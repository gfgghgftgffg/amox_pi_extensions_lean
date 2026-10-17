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
sudo systemctl daemon-reload
sudo systemd-analyze verify /etc/systemd/system/amox-pi-actions.{service,timer}
node scripts/local-maintenance.mjs --dry-run
```

检查模型配置、权限、磁盘 TMPDIR 和 bubblewrap 可用后，按授权选择一次真实验证，再启用 timer：

```bash
sudo systemctl start amox-pi-actions.service
sudo systemctl enable --now amox-pi-actions.timer
```

没有上游更新或已有维护 PR 时跳过模型；有更新时，真实运行会产生模型费用。`--run --local-only` 可只验证本地适配，不推送、创建 PR 或自动合并，也不检查远端待处理 PR。不要机械执行多次付费验证；无更新成功不等于模型适配已验证。

## 日常检查与恢复

```bash
systemctl status amox-pi-actions.service
systemctl list-timers amox-pi-actions.timer
journalctl -u amox-pi-actions.service
```

状态和失败副本位于 `~/.local/state/amox-pi-maintenance`，从 `last-run.json` 找到对应候选和检查日志。失败后修复同一候选；不会在下一次调度自动接管旧 PR。不要因请求超时就重复推送、创建 PR 或 merge，先检查远端实际状态。npm 恢复见[发布说明](npm-publishing.zh-CN.md)。

单次维护上限 120 分钟，service 130 分钟兜底，模型错误不自动重试。timer 使用 `Persistent=true`，启用前检查是否会补执行。暂停：`sudo systemctl disable --now amox-pi-actions.timer`。确认不再需要后再清理专用失败副本，避免磁盘耗尽。

自定义路径可使用 `AMOX_MODEL_CONFIG`、`AMOX_PUBLISH_ENV` 和 `AMOX_MAINTENANCE_STATE`，并同步 unit 的写入权限与 TMPDIR。
