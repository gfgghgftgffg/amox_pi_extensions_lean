# 本机每日维护

Linux 维护主机每天 02:23 UTC（北京时间 10:23）启动一次性 Pi SDK 会话。它不是 subagent，不加载个人扩展，也不更新个人安装或替换运行中的宿主。固定主机自动合并与发布的安全边界见[维护策略](maintenance.md)。

## 前置条件

安装 Node >=22.19、npm、Git、`bubblewrap`、`flock`、GNU `timeout` 和 systemd。克隆本仓库，在根目录执行 `npm ci --ignore-scripts`。普通扩展用户不需要部署此服务。

维护账号需要该仓库的 SSH 写权限，以及仅授权该仓库的 GitHub PAT：Contents read/write、Pull requests write、Actions read。凭据放在仓库外，不作为命令行参数。

创建 `~/.config/amox-pi-actions.env`，内容为一行字面值 `GH_TOKEN=...`，不使用 shell 表达式。创建 `~/.config/amox-pi-maintenance.json`：

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

支持 `openai-responses`、`openai-completions` 和 `anthropic-messages`，内置 provider 可省略 `baseUrl`。两个凭据文件均设为 **600**，不提交到 Git。

## 部署

先按实际账号和安装路径修改 [service](../scripts/systemd/amox-pi-actions.service) 中的 `User`、工作目录、HOME、状态目录、ExecStart 和 ReadWritePaths；[timer](../scripts/systemd/amox-pi-actions.timer) 使用 UTC。已有 unit 先备份；迁移 VPS 时先停旧 timer。

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

检查模型配置、权限、磁盘 TMPDIR 和 bubblewrap 可用后，按授权选择一次真实验证，再启用 timer：

```bash
sudo systemctl start amox-pi-actions.service
sudo systemctl enable --now amox-pi-actions.timer amox-pi-actions-retry.timer
```

服务每次克隆远端 `main`，不会把维护工作区未提交或未合并的修改带入候选。subagents 使用上游现成的 `dist/index.js`；同一套本地 gate、三平台 CI 与 Release 独立验收检查其产物存在、源码/dist 契约一致和真实 dist 回归。每日任务只暂存和发布实际更新的包，包版本相互独立；变更范围判定由本地 gate、CI 与 Release 共用，共享变更扩大验收而不强制其它包发布。分包与 dist 策略不改变原每日 unit、调度或权限；延迟重试另需部署下面的 retry service/timer。先合入并更新主机代码，再部署、启用新增 unit，不将新入口与旧代码混用。

没有上游更新或已有维护 PR 时跳过模型；有更新时，真实运行会产生模型费用。`--run --local-only` 可只验证本地适配，不推送、创建 PR 或自动合并，也不检查远端待处理 PR。不要机械执行多次付费验证；无更新成功不等于模型适配已验证。

## 服务器错误延迟重试

- 可明确识别的 HTTP 500/502/503/504，在尚未进入推送／创建 PR 的边界前，失败后至少等待 2 小时再自动尝试，首次执行之外最多重试 3 次，总共最多 4 次。支持模型 SDK 状态头、公开 Git 读取、npm 元数据与明确 npm E5xx 安装错误、发布前 GitHub GET；不根据任意日志或响应正文里的数字判断。
- `retry-state.json` 在专用状态目录中以 600 权限原子写入，保存次数与到期时间。独立的 [retry timer](../scripts/systemd/amox-pi-actions-retry.timer) 每分钟检查，由 [retry service](../scripts/systemd/amox-pi-actions-retry.service) 的只读 ExecCondition 判定是否到期；通常到期后一分钟内触发，重启后仍有效，不让 Node/Pi 进程睡眠两小时。每日 service 也通过 Wants 激活 retry timer，避免只启动每日服务而漏开重试定时器。
- 日常与重试共用 `maintenance.lock`。未到期、没有待重试或已有进程持锁时，不调用模型、不克隆候选、不消耗次数；手动启动每日服务也不能绕过已排队的等待。耗尽后本周期停止，后续每日任务可开启新周期。
- 每次重试重新检测并处理尚未发布的工作，保留旧失败副本。代码／测试／契约／审计执行失败、4xx、无法确认的网络错误及本地超时不自动重跑。若已出现尚未修复的验收失败，即使后续模型又返回 5xx，也保留同一候选人工修复，不通过新候选绕过失败断言。任何推送／PR／合并写入开始后，或已有 PR、写入结果不明时，停止自动重跑，人工核对同一候选；不自动重发 Release/npm。
- 每次安排推迟立即发 ntfy，含 HTTP 状态、北京时间下次执行时间和第几次／最多 3 次；耗尽再发失败通知。等待期间的分钟检查和锁竞争不重复通知；成功后沿用正常结果通知。原失败那次 unit 仍可显示失败，当前整体状态以 `last-run.json`、`retry-state.json` 及 retry service 为准。
- `--dry-run` 和 `--local-only` 不排队重试。已有状态损坏时停止，不自动清零预算；不要删除状态文件来绕过上限。

## 日常检查与恢复

```bash
systemctl status amox-pi-actions.service
systemctl status amox-pi-actions-retry.service
systemctl list-timers amox-pi-actions.timer amox-pi-actions-retry.timer
journalctl -u amox-pi-actions.service -u amox-pi-actions-retry.service
```

状态和失败副本位于 `~/.local/state/amox-pi-maintenance`，从 `last-run.json` 找到对应候选和检查日志。失败后修复同一候选；不会在下一次调度自动接管旧 PR。不要因请求超时就重复推送、创建 PR 或 merge，先检查远端实际状态。npm 恢复见[发布说明](npm-publishing.zh-CN.md)。

单次尝试上限 120 分钟，service 130 分钟兜底；两小时等待不占用该运行时间。SDK 即时重试仍关闭，只有上述安全范围内的服务器错误由持久化队列延迟重试。timer 使用 `Persistent=true`，启用前检查是否会补执行。暂停：`sudo systemctl disable --now amox-pi-actions.timer amox-pi-actions-retry.timer`。确认不再需要后再清理专用失败副本，避免磁盘耗尽。

自定义路径可使用 `AMOX_MODEL_CONFIG`、`AMOX_PUBLISH_ENV` 和 `AMOX_MAINTENANCE_STATE`，并同步 unit 的写入权限与 TMPDIR。

## 可选 ntfy 通知

将 `server`、`topic`、`tokenFile` 写入仓库外的 `~/.config/amox-pi-notify.json`，例如 `{"server":"https://ntfy.example.com","topic":"maintenance","tokenFile":"/private/ntfy-token"}`；配置和 token 文件均设为 600。部署上述 service 后，结束钩子会通知成功、无更新、失败和超时；已合并版本等待现有 Release/npm job 的实际结果，不重复执行验收或发布。通知失败不改变原任务结果。未配置时跳过通知。

显式测试：`node scripts/notify-maintenance.mjs --test`。自定义配置路径可用 `AMOX_NOTIFY_CONFIG`。
