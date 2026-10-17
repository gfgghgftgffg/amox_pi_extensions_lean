# npm 发布与 VPS 迁移

[English](npm-publishing.md)

现有 [Release workflow](../.github/workflows/release.yml) 已加入 npm job。这不会替你完成首次发布、登录 npm 或迁移现有 Pi 安装。完成下面的一次性账号配置前，仍使用 Git 安装脚本。准备就绪前，不要合并下一个版本升级并期待 npm 已经可用：GitHub Release 可以成功，而 npm 发布仍然失败。

## 发布边界

维护者审查并合并版本升级后，Release 在 Linux、macOS、Windows 验证同一不可变 SHA，创建 GitHub Release，再将其中三个已验证归档发布到 npm。无更新的维护运行不发布。根 `package.json` 保持 private。

只有 npm job 获得 `id-token: write`。它在 GitHub-hosted Ubuntu、`release` environment 中运行，仓库只读，使用 Node 22.22.1 和 npm 11.15.0。它只安装固定版本 npm CLI，不安装扩展依赖。[发布脚本](../scripts/publish-npm.mjs) 校验 SHA/tag、归档哈希、包身份、仓库和包内全部六个文件，再预检三个公开 npm 版本。上传的是这些 `.tgz`，禁用生命周期脚本和 npm HTTP 重试；每次新发布后检查 registry integrity 和 `latest`。GitHub trusted publishing 自动生成 provenance。Pi、systemd、仓库和 Actions Secrets 均不保存 npm token。

## 一次性 npm 账号配置

使用 npm 账号 `gfgghgftgffg`，验证邮箱并开启 2FA。在可信电脑上自行登录并完成 2FA，不向 Agent 发送密码、OTP 或 token，也不要将其写进命令参数。

首次发布以下三个包，使用**已有且经过验证的 GitHub Release 归档**，不要重新打包工作树：

- `@gfgghgftgffg/pi-web-access-lean`
- `@gfgghgftgffg/rpiv-todo-lean`
- `@gfgghgftgffg/pi-subagents-lean`

以下示例用于可信 Bash 终端。选择已有 Release 和全新的空工作目录；`v0.1.4` 只是示例，不是安装版本固定。GitHub CLI 和 npm 分别认证。

```bash
set -e
TAG=v0.1.4
git clone --branch "$TAG" https://github.com/gfgghgftgffg/amox_pi_extensions_lean.git amox-npm-bootstrap
cd amox-npm-bootstrap
gh release download "$TAG" --repo gfgghgftgffg/amox_pi_extensions_lean --pattern '*.tgz' --pattern assets.json --dir .release-assets
node --input-type=module -e 'import { validateReleaseAssets } from "./scripts/release-assets.mjs"; console.log(validateReleaseAssets({repoRoot:process.cwd(),dir:".release-assets"}).map(x=>x.package));'
npm login --registry=https://registry.npmjs.org/
npm whoami --registry=https://registry.npmjs.org/
# Confirm the account is gfgghgftgffg before these public, irreversible writes:
npm publish ".release-assets/gfgghgftgffg-pi-web-access-lean-${TAG#v}.tgz" --access public --ignore-scripts --fetch-retries=0 --registry=https://registry.npmjs.org/
npm publish ".release-assets/gfgghgftgffg-rpiv-todo-lean-${TAG#v}.tgz" --access public --ignore-scripts --fetch-retries=0 --registry=https://registry.npmjs.org/
npm publish ".release-assets/gfgghgftgffg-pi-subagents-lean-${TAG#v}.tgz" --access public --ignore-scripts --fetch-retries=0 --registry=https://registry.npmjs.org/
```

每次发布后，从公开 registry 检查精确版本的 `dist.integrity` 和 `dist-tags.latest`，与 `assets.json` 比较。npm 版本不能覆盖。若命令结果不明，先检查 registry，再决定是否明确重试，不要整段盲目重跑。不要发布 private 的 workspace 根包。临时电脑用完后退出 npm 登录。

**三个包分别**在 npmjs.com → 包 → Settings → Trusted Publisher → GitHub Actions 配置：

| 字段 | 值 |
| --- | --- |
| Organization or user | `gfgghgftgffg` |
| Repository | `amox_pi_extensions_lean` |
| Workflow filename | `release.yml`，不填完整路径 |
| Environment name | `release` |
| Allowed actions | 显式允许直接 `npm publish`；只有 stage 权限不够 |

GitHub 的 `release` environment 限制到 `main`，可按需加人工审批；两个发布 job 都可能请求审批。OIDC 验证成功后，在 npm 选择 “Require two-factor authentication and disallow tokens”，撤销不再使用的发布 token。Fork 或修改仓库、workflow、environment 名称时，需要同步包元数据并新建信任配置；迁移 VPS 不会授予 npm 发布权限。

npm [官方 trusted publishing 文档](https://docs.npmjs.com/trusted-publishers/)要求新信任配置在 **2 天内完成首次成功发布**。请在下次已审查的版本发布前就近配置；跳过已发布版本、dry-run 和 `npm whoami` 都不能验证 OIDC。过期时，在发布前删除并重建信任配置。不要复用首次版本，也不要靠随意升版本掩盖配置缺失。首次真正的 OIDC 发布在 GitHub 成功前，仍属于未验证。

## 部分成功与恢复

写入前预检三个 registry 版本。已存在且 integrity 相同则跳过，同版本内容不同则拒绝。尚未首发、查询失败、试图倒退 `latest` 时停止。发布结果不明不会自动重试，也不会继续发布后面的包。

先检查精确的工作流运行、三个 registry 版本和哈希。在 artifact 保留期内（7 天），修复原因后，明确选择同一次 Release 的 **Re-run failed jobs**。已完成且一致的包会跳过。不要对已有 tag 重新启动一次完整手动 Release：GitHub 发布 job 有意拒绝改指 tag 或覆盖已有 release。artifact 已过期时，由维护者用已验证的 GitHub 附件手动恢复，先检查身份和 integrity。不要通过撤包或改写 tag 强行通过。registry `latest` 异常需要人工审查，不自动改 tag。

## 新 VPS 检查表

1. 日常 Pi 使用按 [bootstrap setup](https://github.com/gfgghgftgffg/amox-agent-bootstrap/blob/main/setup_for_pi.md) 安装。三个包可用后采用不固定版本的 `npm:@gfgghgftgffg/...` 来源，再用 `pi update --extensions`。npm 返回 404 时使用各扩展的 Git 安装脚本。保留上游依赖固定版本，不另行注册上游引擎。
2. 迁移旧本地来源需要用户同意：备份 settings，`pi list`，`pi remove <exact-old-source>`，再安装对应 npm 来源。保留无关包和凭据，重启 Pi，确认 `web_access`、`todo`、`subagent` 各一个。Git 本地安装仍需 `git pull --ff-only` 并重跑安装脚本。
3. 每日维护主机是独立的可选部署。按[本机维护说明](local-scheduler.md)安装 Linux 前置依赖和根依赖，按实际用户与路径修改 systemd unit，单独配置主机模型文件、仓库限定 GitHub PAT 和 SSH 权限。模型、GitHub、npm 凭据分开，不通过 Git 复制密钥、会话或模型日志。
4. 先停旧 VPS timer，再启新主机。检查时钟/时区、状态目录权限、磁盘 TMPDIR 和 bubblewrap 限制。先只读 `--dry-run`，再按授权选择至多一次真实验证，成功后启用每日 02:23 UTC timer。无更新检查成功不等于付费模型适配已验证，不要机械执行多轮付费检查。
5. 迁移 VPS 不迁移 npm trusted publishing，发布仍由 GitHub 执行。保持 workflow/environment 身份不变，保留三平台 CI 和人工审查；下次同时确认 GitHub Release 与 npm job，不能把 CI 绿灯当作发布成功。
