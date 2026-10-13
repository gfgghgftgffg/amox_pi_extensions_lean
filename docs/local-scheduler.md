# 本机每日维护

每日 02:23 UTC（北京时间 10:23），systemd 启动一个一次性 Pi SDK 进程。不依赖 GitHub cron，不复用个人会话，也没有常驻 Agent。

代码位置：
- 任务入口：[scripts/local-maintenance.mjs](../scripts/local-maintenance.mjs)
- 独立 Pi 会话：[scripts/lib/local-pi.mjs](../scripts/lib/local-pi.mjs)
- 实际加载的 prompt：[maintenance/daily-update.md](../maintenance/daily-update.md)
- 定时器：[scripts/systemd/amox-pi-actions.timer](../scripts/systemd/amox-pi-actions.timer)
- 服务：[scripts/systemd/amox-pi-actions.service](../scripts/systemd/amox-pi-actions.service)

这里调用 `createAgentSession` 新开 Pi 会话，不调用 subagent、不加载 subagent 扩展或 task-routing。被维护的依赖只装进临时副本，不更新个人 Pi 或正在运行的宿主。

## 工作过程

`systemd → 临时 main 副本 → 检测上游 → Pi 修改并实际检查 → 草稿 PR → 普通三平台 CI → 人工合并 → Release`

没有上游更新，或已经有待审的 `maintenance/local-*` PR，就不调用模型、不重复创建 PR。临时副本不会改动日常开发 checkout。

Pi 只有 `list/read/write/edit/check` 五个工具。`check` 真正执行契约捕获、类型检查、测试、独立生产安装和两次安全审计。失败输出交回同一个 Pi 会话，修复同一份候选，而不是重新生成候选。根检查脚本、工作流、依赖版本和已有测试断言受保护；新写的回归测试可根据真实响应修正。

发布由固定脚本执行，不以 Agent 的口头“通过”为依据。它只推已经检查过且未再修改的 commit，使用普通非强制 push，创建 draft PR。远程 CI 失败时，最多给同一会话一次针对实际日志的修复机会；再次失败就停。不会自动合并、直接推 main 或在 VPS 创建 Release。人工合并版本升级后，Release 工作流再做三平台验证并发布 GitHub 附件。

## 依赖与配置

维护主机需要 Linux、Node >=22.19、npm、Git、`bubblewrap`、`flock`、GNU `timeout` 和 systemd。先在维护工具 checkout 运行 `npm ci --ignore-scripts`。扩展用户不需要这些维护配置。

模型配置放在仓库外的 `~/.config/amox-pi-maintenance.json`，权限 **600**：

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

支持 `openai-responses`、`openai-completions`、`anthropic-messages`。内置 provider 可省略 `baseUrl`。不执行配置中的 shell 命令。凭据不要提交到 Git，不要作为命令行参数。

GitHub API 凭据放在仓库外的 `~/.config/amox-pi-actions.env`，权限 **600**，格式为一行字面值 `GH_TOKEN=...`，不加 shell 表达式。建议细粒度 PAT 只授权该仓库：Contents read、Pull requests write、Actions read。Git push 使用维护账号的 SSH key，需对该仓库有写权限。

模型和发布凭据仅供主机上的固定控制代码使用。检查子进程由 bubblewrap 清空环境、隔离 PID，只有公共系统文件、只读候选、临时 HOME/TMP；没有主机 home、SSH、凭据或主机 `/proc`。安装阶段只开放 node_modules 和 lockfile 写入；捕获阶段只开放输出快照写入。检查需要访问公共 npm/GitHub，网络不是完全隔离的。

## 部署

示例系统级 unit 保存在 [scripts/systemd](../scripts/systemd/)；部署到其它账号或路径时，先修改其中的 `User`、工作目录和状态路径。已存在的 unit 必须先备份，不直接覆盖未知部署。

```bash
mkdir -p ~/.local/state/amox-pi-maintenance/tmp
chmod 700 ~/.local/state/amox-pi-maintenance
sudo install -m 644 scripts/systemd/amox-pi-actions.service /etc/systemd/system/
sudo install -m 644 scripts/systemd/amox-pi-actions.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemd-analyze verify /etc/systemd/system/amox-pi-actions.{service,timer}
```

先验证，再启用定时器：

```bash
node scripts/local-maintenance.mjs --dry-run
# 实际调用模型、做本地检查，但不推送或创建 PR：
node scripts/local-maintenance.mjs --run --local-only
# 完整执行（会调用模型并创建草稿 PR）：
sudo systemctl start amox-pi-actions.service
# 完整链路成功后才启用：
sudo systemctl enable --now amox-pi-actions.timer
```

`--local-only` 不是短模型探针，会执行真正适配和检查，仍按模型服务计费。不要把这三条验证命令机械地全执行，以免重复付费；只读诊断后选需要的一条实际运行。

可通过 `AMOX_MODEL_CONFIG`、`AMOX_PUBLISH_ENV`、`AMOX_MAINTENANCE_STATE` 指定仓库外的配置/状态路径。锁、工作副本和日志默认在 `~/.local/state/amox-pi-maintenance`，不打包进扩展。

## 失败与恢复

```bash
systemctl status amox-pi-actions.service
systemctl list-timers amox-pi-actions.timer
journalctl -u amox-pi-actions.service
```

查看状态目录中的 `last-run.json` 与它指向的副本/`checks-*` 日志。失败副本会保留，便于检查同一份改动；维护者可在确认不再需要后清理这些专用 `run-*` 目录，避免长期积累。没有更新的临时副本自动删除。

单次使用 `flock` 防重入、总运行上限 120 分钟（service 130 分钟兜底），Pi 模型/工具阶段合计最多 45 分钟、80 turn，不自动重试模型错误。检查命令各有超时，远程 CI 每轮等待最多 40 分钟。超时不等于远程任务取消；推送/PR 请求结果不明时先检查远端，不自动重发。

timer 为 `Persistent=true`。首次启用前确认最近成功运行和 timer stamp，避免补执行形成不必要的模型调用。暂停：`sudo systemctl disable --now amox-pi-actions.timer`。

GitHub 不再需要维护模型 Secrets/Variables。旧值不会被新流程读取；移除旧 workflow 不等于自动删除账号里的凭据。

`.github/dependabot.yml` 的版本/Action 更新配置已经删除。GitHub 的 `dynamic/dependabot/dependabot-updates` 是平台动态入口，不是仓库里的 YAML，普通 workflow disable API 不支持禁用它。Dependabot 自动安全更新由仓库安全设置控制，需具备相应仓库管理权限；移除配置不能证明安全更新已关闭。可在仓库 Settings 的安全设置中关闭 Dependabot security updates；漏洞告警与 npm audit 是独立检查，可保留。历史 Actions 入口/记录可能仍显示，不能冒充已清除。
