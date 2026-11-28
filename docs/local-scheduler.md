# Linux 维护主机部署与每日调度

Linux 维护主机通过 systemd 定时器在每天 **02:23 UTC（北京时间 10:23）** 启动一次隔离的本地 Pi SDK 维护会话。该任务并非 subagent，不加载任何个人扩展，也不会更新本机个人安装的扩展或热替换运行中的宿主进程。

> [!NOTE]
> 普通扩展用户不需要部署此服务，直接通过 `pi install npm:...` 安装扩展即可。固定主机自动合并与 OIDC 发布的安全边界见[维护策略](maintenance.md)。

## 环境与凭据准备

### 1. 基础软件要求

在维护主机安装 Node.js `>=22.19`、npm、Git、`bubblewrap`、`flock`、GNU `timeout` 与 systemd；克隆本仓库后在根目录执行一次依赖安装：

```bash
npm ci --ignore-scripts
```

### 2. 仓库权限与外部凭据

维护专用账号需具备本仓库的 SSH 推送权限，以及**仅限本仓库作用域**的细粒度 GitHub PAT（权限：`Contents: Read and write`、`Pull requests: Write`、`Actions: Read-only`）。所有凭据存放在仓库目录之外，且严禁通过命令行参数传递：

1. **GitHub 令牌文件 `~/.config/amox-pi-actions.env`** — 仅写入单行字面值 `GH_TOKEN=...`（不要使用 `export` 或任何 shell 表达式）。
2. **维护模型配置 `~/.config/amox-pi-maintenance.json`**：

```json
{
  "provider": "gateway",
  "model": "your-model-id",
  "api": "openai-responses",
  "baseUrl": "https://api.example.com/v1",
  "apiKey": "YOUR_PRIVATE_KEY",
  "thinking": "medium"
}
```

支持 `openai-responses`、`openai-codex-responses`、`openai-completions` 与 `anthropic-messages` 接口（内置官方 provider 可省略 `baseUrl`；Codex Responses 走 SSE 传输；`sub2api-gpt-only` 等独立网关需单独配置各自 API key，不会自动读取个人 Pi 配置）。两个凭据文件均须设置 **`chmod 600`**，切勿提交至 Git。

## 部署与启动流程

在部署至目标主机前，需根据实际系统环境（如运行用户、仓库安装路径与状态存储目录）调整 [每日服务](../scripts/systemd/amox-pi-actions.service) 与 [重试服务](../scripts/systemd/amox-pi-actions-retry.service) 的 unit 配置。两份配置中均需校对并修改 `User`、`WorkingDirectory`、`HOME`、`TMPDIR`、`AMOX_MAINTENANCE_STATE`、`ReadWritePaths`、`ExecStart` 及 `ExecStopPost` 字段；[重试服务](../scripts/systemd/amox-pi-actions-retry.service) 还需额外更新 `ConditionPathExists` 与 `ExecCondition`。若是进行版本升级，请务必先备份已有的旧 unit 文件；若是从旧主机迁移，应先停用旧环境上的定时器，以防多个节点并发执行产生状态冲突。

```bash
mkdir -p ~/.local/state/amox-pi-maintenance/tmp
chmod 700 ~/.local/state/amox-pi-maintenance

sudo install -m 644 scripts/systemd/amox-pi-actions.service /etc/systemd/system/
sudo install -m 644 scripts/systemd/amox-pi-actions.timer /etc/systemd/system/
sudo install -m 644 scripts/systemd/amox-pi-actions-retry.service scripts/systemd/amox-pi-actions-retry.timer /etc/systemd/system/

sudo systemctl daemon-reload
sudo systemd-analyze verify /etc/systemd/system/amox-pi-actions.{service,timer} /etc/systemd/system/amox-pi-actions-retry.{service,timer}

node scripts/local-maintenance.mjs --dry-run
```

确认模型配置、目录权限、磁盘 `TMPDIR` 与 `bubblewrap` 沙箱均正常后，按需执行一次受控验证，随后启用每日定时器与延迟重试定时器：

```bash
sudo systemctl start amox-pi-actions.service
sudo systemctl enable --now amox-pi-actions.timer amox-pi-actions-retry.timer
```

### 运行机制与计费注意事项

- **干净克隆与独立分包** — 每次执行都会从远端 `main` 全新克隆候选目录，不会混入维护工作区中未提交或未合并的本地改动。每日任务仅暂存并发布实际存在更新的包，各包版本号相互独立；本地门禁、PR CI 与 Release 共用同一套变更范围判定，共享代码改动会扩大验收范围但不会强制其他包陪跑发布。存在待发布版本时，普通 `main` push CI 矩阵自动交由 Release 统一验收；常规单测也不会嵌套重跑独立生产安装或全量契约捕获。
- **subagents 产物一致性** — `pi-subagents-lean` 固定加载上游发布的 `dist/index.js`；本地门禁、PR 三平台 CI 与 Release 合并验收均会强制校验产物存在性、源码与 `dist` 契约一致性以及真实 `dist` 回归。
- **先合入再部署新 unit** — 分包与 `dist` 门禁本身不改动原每日 unit 的调度或权限；新增的延迟重试需要部署配套的 retry service/timer。变更维护脚本时应先合入远端 `main` 并同步主机代码，再启用新增 unit，避免新入口混用旧脚本。
- **按需调用模型** — 没有上游更新或远端已存在未处理维护 PR 时直接跳过模型调用；检测到上游更新时，真实运行会产生模型推理费用。调试时可用 `--run --local-only` 仅在本地演练适配与门禁（不推送分支、不建 PR、不执行固定主机自动合并，也不检查远端待处理 PR）。请避免机械重复触发付费运行；“无更新跳过”返回成功并不代表模型适配链路已验证。

## sync 选择性上游监控

`amox-pi-sync` 每日自动检查 npm 最新稳定版发布：

1. **只读源码初审** — 无新版本时不调用模型；发现新版本时，先启动只读 Pi SDK 会话，对照包内 `MAINTENANCE.md` 逐文件审查发布源码差异，逐项判定**移植（port）**、**跳过（skip）**或**请所有者决定（ask）**。
2. **边界内定向合入** — 仅当改动属于保留功能范围、确有价值且无任何待决疑问时，才进入常规适配、回归测试、三平台 CI 与独立发版流程；已裁剪模块一律跳过。若初审存在 `ask` 项，则暂缓 `amox-pi-sync` 且不阻塞其他 lean 包正常维护；若适配编码阶段才发现新的不确定性，模型可通过 `ask_owner` 持久化记录原因、发送 ntfy 提醒并暂停当前候选，阻止后续推送与合并（绝不重建新候选绕过失败门禁）。
3. **审查缓存与基线规则** — 审查报告以 `600` 权限写入状态目录下的 `fork-review-amox-pi-sync.json`（含版本号、变更文件、判定理由、SHA-512 integrity 及源码上下文路径）。同一目标版本且本地实现与 `MAINTENANCE.md` 策略未变时直接复用 `skip`/`ask` 报告，不重复消耗模型额度，同时待决项仍会在每日 ntfy 摘要中持续提醒。维护者将裁决写入包内 `MAINTENANCE.md` 并合入后会自动触发重审。纯 `skip` 不递增版本也不推进已整合基线，后续新版本仍与上次实际整合的基线对比；源码获取异常或模型输出不完整同样转人工确认（明确的 HTTP 5xx 仍走下节延迟重试）。

`--dry-run` 仅列出待审版本，不调用审查模型、不写缓存也不发布。更新监控逻辑后合入 `main` 并拉取主机代码即可生效，无需额外部署新 systemd unit。

## 服务器错误延迟重试

针对尚未进入“推送分支 / 创建 PR”发布写入边界前的明确临时性服务端故障，主机提供持久化延迟重试：

- **严格的状态码识别** — 仅当明确捕获到 **HTTP 500 / 502 / 503 / 504**（涵盖模型 SDK 响应状态头、公开 Git 读取、npm 元数据查询、明确的 npm `E5xx` 安装报错以及发布前只读 GitHub GET）时才排队重试；绝不根据任意日志文本或响应正文中的数字猜测重试。首次失败后每次至少间隔 **2 小时**，最多额外重试 **3 次**（单周期总计最多 4 次尝试）。
- **无常驻睡眠的定时器驱动** — 重试计数与到期时间戳以 `600` 权限原子写入 `retry-state.json`。独立的 [amox-pi-actions-retry.timer](../scripts/systemd/amox-pi-actions-retry.timer) 每分钟触发一次，由 [amox-pi-actions-retry.service](../scripts/systemd/amox-pi-actions-retry.service) 的只读 `ExecCondition` 判断是否到期，通常在到期后 1 分钟内拉起重试且主机重启后依然生效，无需让 Node/Pi 进程常驻睡眠两小时。每日主服务也通过 `Wants=` 关联激活 retry timer，防止遗漏启动。
- **共享互斥锁与防绕过** — 日常调度与延迟重试共用 `maintenance.lock`：未到期、无待重试任务或锁已被占用时，不调用模型、不克隆仓库、不扣减重试预算；手动启动每日 service 同样无法跳过排队中的冷却期。3 次重试耗尽后本周期终止，等待次日新调度开启下一周期。
- **失败保护与人工边界** — 每次到点重试会重新检测尚未发布的更新，同时保留此前失败的运行目录供排查。代码/测试/契约/审计执行失败、HTTP 4xx、性质不明的网络异常及本地超时均**不自动重试**。一旦候选已出现未修复的门禁断言失败，即便后续模型请求又遇到 5xx，也会保留同一候选交由人工修复，绝不新建候选绕过失败门禁。任何推送、PR 创建或合并请求一旦发出（或远端已存在维护 PR、写入结果不明），立即停止自动重跑并转人工核查同一候选，绝不自动重发 Release 或 npm 发布。
- **精控通知与状态文件保护** — 每次排队推迟会立即发送一条包含 HTTP 状态码、北京时间下次执行时刻及当前第几次（共最多 3 次）的 ntfy 通知；预算耗尽时再发最终失败通知，冷却期内的每分钟轮询与锁竞争静默不打扰，重试成功后发送常规成功通知。首次失败的 systemd unit 记录仍可显示 failed，实时整体状态以 `last-run.json`、`retry-state.json` 和 retry service 为准。`--dry-run` 与 `--local-only` 不写入重试队列；若状态文件损坏将立即停机报错，请勿手动删除状态文件来绕过重试上限。

## 日常巡检、排障与可选通知

### 常用运维命令

```bash
systemctl status amox-pi-actions.service
systemctl status amox-pi-actions-retry.service
systemctl list-timers amox-pi-actions.timer amox-pi-actions-retry.timer
journalctl -u amox-pi-actions.service -u amox-pi-actions-retry.service
```

需要临时停用自动调度时执行：

```bash
sudo systemctl disable --now amox-pi-actions.timer amox-pi-actions-retry.timer
```

### 故障恢复与超时策略

- **定位同一候选** — 运行状态与失败现场保存在 `~/.local/state/amox-pi-maintenance`，可通过 `last-run.json` 定位对应的候选工作树和分阶段检查日志。出现门禁或合并异常后请在**同一份候选**上排查修复（次日调度不会自动接管遗留旧 PR）；遇到网络超时切勿盲目重复 push、建 PR 或 merge，务必先核对 GitHub 远端实际状态。npm 发布侧恢复流程见[发布配置与恢复](npm-publishing.zh-CN.md)。
- **超时与历史副本清理** — 单次运行内部限时 `120` 分钟，systemd service 层设 `130` 分钟硬兜底（两小时延迟重试等待期不计入运行耗时）；模型 SDK 层的即时重试保持关闭。定时器启用了 `Persistent=true`，首次开启前请留心是否会立即补跑错过的周期。每次 `--run` 会自动清理超过 3 天的历史 `run-*` 目录，但会完整保留 `last-run.json` 指向的未完成或失败现场，且绝不删除 `last-run.json`、`retry-state.json` 与锁文件。
- **环境变量覆盖** — 可通过 `AMOX_MODEL_CONFIG`、`AMOX_PUBLISH_ENV`、`AMOX_MAINTENANCE_STATE` 与 `AMOX_LOCAL_PI_MAX_TURNS` 自定义路径与参数（需同步调整 systemd unit 的读写白名单与 `TMPDIR`）。`AMOX_LOCAL_PI_MAX_TURNS` 控制单次本地 Pi SDK 会话的最大轮数（默认 `80`，合法范围 `1`–`1000`），仅建议在排查模型是否于读源码阶段耗尽轮数时谨慎调高，以免拉长耗时并增加费用。

### 可选消息推送（ntfy / Hermes）

在仓库外创建权限为 `600` 的 `~/.config/amox-pi-notify.json`（可通过 `AMOX_NOTIFY_CONFIG` 覆盖路径；未配置则静默跳过，通知发送失败不影响主任务退出状态）：

- **ntfy 推送**：`{"server":"https://ntfy.example.com","topic":"maintenance","tokenFile":"/private/ntfy-token"}`（配置文件与 `tokenFile` 均设为 `600`）。
- **Hermes 容器转发（如 QQ 机器人）**：`{"transport":"hermes","container":"hermes","targets":["qqbot"]}`，底层调用 `podman exec <container> hermes send`，任一目标投递成功即视为通知成功。（注：微信 iLink 依赖用户上一条消息附带的临时 `context_token`，闲置后无法主动推送，不适合无人值守告警。）

部署上述 systemd 服务后，结束钩子会自动推送成功、无更新、失败与超时摘要；对于已自动合入 `main` 的更新，通知钩子会只读等待现有 Release / npm job 的真实终态后再汇总回报，绝不重复触发验收或发布。可执行以下命令主动测试连通性：

```bash
node scripts/notify-maintenance.mjs --test
```
