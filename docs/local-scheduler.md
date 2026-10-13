# 本机每日调度

每日入口只有 `scripts/dispatch-workflows.mjs`，没有 npm 依赖，也不启动 Pi 或模型。脚本通过 GitHub API 在 `main` 上触发 `Check upstream`，取得确切的 run ID，然后等待该次运行完成。任务失败、取消、API 错误或超过三小时，脚本均返回非零状态。

默认每天 02:23 UTC（北京时间 10:23）。上游未变化时，GitHub 只做检测，跳过模型适配、三平台候选验证和 PR 创建。CI 保留 push/PR 触发，Release 保留受版本校验约束的触发；两者不每日空跑。草稿 PR 仍须人工审查和合并。

## 凭据

原生 GitHub `schedule` 不需要 PAT。这里改为 VPS 从外部调用 GitHub API，所以需要独立 GitHub 授权。`MAINTENANCE_API_KEY` 是模型密钥，不能替代 GitHub token。

创建一个 **fine-grained PAT**，资源所有者选仓库所有者，只授权目标仓库，Repository permissions 仅设置 **Actions: Read and write**；Metadata read 为默认权限。设置有效期并在到期前轮换。无需 Contents write、Administration 或整个账号的广泛仓库写权限。

模型配置继续留在 GitHub Actions 的 Secrets/Variables，本机不需要它们。工作流内部 PR/Release 继续使用自动提供的 `GITHUB_TOKEN`，仓库默认 token 权限可保持只读。

本机 token 放在 `~/.config/amox-pi-actions.env`，文件权限 `600`，不要放到项目、提交到 Git、直接写到命令参数或发到聊天。

## 安装与启用

本机后台调度需要 Linux、Node >=22.19.0、systemd、util-linux 的 `flock` 和 sudo。所有调度逻辑及单位生成代码都在项目脚本中；安装时按当前用户名、Node 路径及项目绝对路径生成系统单位。不需要 `npm ci`。

先把工作流剪枝变更同步到 GitHub，避免旧 cron 恢复后重复调度。保持部署目录不变；移动目录后需要停用并重新安装单位。

在项目目录以普通用户执行：

```bash
node scripts/dispatch-workflows.mjs --dry-run
node scripts/dispatch-workflows.mjs --install-timer
```

安装器创建 `/etc/systemd/system/amox-pi-actions.service` 和 `.timer`，以及仓库外的空凭据文件；**不会启用或启动任务**，也不会覆盖已有单位或凭据。已有安装要更新时，先停止 timer，审查新单位，再按系统运维流程替换。

在服务器终端安全输入 PAT，以下输入不显示，也不把密钥字面值留在 shell history 中：

```bash
set +x
read -r -s -p 'GitHub fine-grained PAT: ' token
printf '\n'
(umask 077; printf 'GH_TOKEN=%s\n' "$token" > "$HOME/.config/amox-pi-actions.env")
unset token
chmod 600 "$HOME/.config/amox-pi-actions.env"
```

先实际运行一次，确认授权及远端运行成功，再启用每天的 timer：

```bash
sudo systemctl start amox-pi-actions.service
sudo systemctl enable --now amox-pi-actions.timer
systemctl list-timers amox-pi-actions.timer --all
```

`start` 等待脚本完成，可另开终端看日志。单元由系统 systemd 管理，不依赖用户登录、linger 或 Pi 会话；主机离线时不执行，重新上线后 `Persistent=true` 补一次错过的调度，不重放全部离线日期。

## 手动入口

默认只检查上游。若确需额外跑 CI，可以在终端加载同一凭据后显式选择：

```bash
set -a
. "$HOME/.config/amox-pi-actions.env"
set +a
node scripts/dispatch-workflows.mjs --workflow upstream --workflow ci
unset GH_TOKEN
```

只跑 CI 使用 `--workflow ci`。排查模型连通性使用 `--workflow model-probe`：在 GitHub 上只发一条固定短文本请求，最多 128 个输出 token、60 秒请求期限，不重试，不读取源码或调用工具，也不进入适配、验证或 PR 阶段；响应正文不记录。它仍可能按模型服务计费。探针通过只说明这个小请求可用，不代表完整适配已经通过。

多个目标顺序执行，任意一个失败后停止。脚本默认仓库为本项目，fork 使用 `--repo OWNER/REPO`；定时器安装同样接受该选项。总等待期限可用 `--timeout-minutes N` 缩短，范围为 1..180。

发布不属于每日任务。需要初次或重试发布时，继续使用 GitHub `Release → Run workflow`，填写与包版本一致的 tag，不绕过验证和审批。

## 日志、锁与失败处理

```bash
systemctl status amox-pi-actions.timer amox-pi-actions.service --no-pager
journalctl -u amox-pi-actions.service -n 100 --no-pager
journalctl -fu amox-pi-actions.service
```

- 本机 `flock` 防止同仓库的手动调用与后台任务重叠；进程退出或崩溃后 OS 自动释放锁，无需清理陈旧 PID 文件。
- 使用 GitHub API `2026-03-10` 返回的 `workflow_run_id`，不猜“最新一次运行”，也不把 API 接受请求当成运行成功。
- POST 不自动重试。网络中断或响应缺少 run ID 时，先检查 Actions，避免重复调用模型或重复建 PR。
- API/工作流失败都会使 systemd service 失败并留下错误位置、HTTP 状态或运行链接；错误不打印 token、响应正文或环境变量。
- 本机超时、停止服务或关闭主机不会取消已提交的 GitHub 运行。先查看远端状态，再决定重试。
- 目前提供 journal 日志和 service 失败状态，没有额外微信告警。无人值守部署应定期检查状态或接入已有服务器监控；GitHub workflow 失败通知也可在 GitHub 账号中配置。

停用后台调度：

```bash
sudo systemctl disable --now amox-pi-actions.timer
```

这不会取消已经运行的任务。如需同时停止本机等待器，执行 `sudo systemctl stop amox-pi-actions.service`，再检查远端运行状态。

## 剪枝后的维护责任

只保留 `check-upstream.yml`、`test.yml`、`release.yml`；不保留 GitHub cron、临时触发探针、Dependabot 的版本更新配置或未启用的 npm 发布实现。

删除 Dependabot 配置不是因为它与上游检测重复：它原来负责 Action SHA 和开发依赖更新。这两类版本升级现在由维护者审查执行，现有 CI 安全审计继续保留。GitHub 自身的 Dependabot alerts/security-update 设置不受删除此配置文件控制。
