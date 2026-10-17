# npm 发布与 VPS 迁移

[English](npm-publishing.md)

[Release workflow](../.github/workflows/release.yml) 在审查后的版本发布中，将已验证归档发布到 npm。维护者完成发布初始化后，npm 才可用于安装；在此之前，扩展用户可使用 Git 安装脚本。GitHub Release 成功不等于 npm 发布成功。

## 发布边界

维护者审查并合并版本升级后，Release 在 Linux、macOS、Windows 验证同一不可变 SHA，创建 GitHub Release，再将其中三个已验证归档发布到 npm。无更新的维护运行不发布。根 `package.json` 保持 private。

只有 npm job 获得 `id-token: write`。它在 GitHub-hosted Ubuntu、`release` environment 中运行，仓库只读，使用 Node 22.22.1 和 npm 11.15.0。它只安装固定版本 npm CLI，不安装扩展依赖。[发布脚本](../scripts/publish-npm.mjs) 校验 SHA/tag、归档哈希、包身份、仓库和包内全部六个文件，再预检三个公开 npm 版本。上传的是这些 `.tgz`，使用 `--ignore-scripts` 和 `--fetch-retries=0` 禁用生命周期脚本和 npm HTTP 重试；每次新发布后检查 registry integrity 和 `latest`。GitHub trusted publishing 自动生成 provenance。Pi、systemd、仓库和 Actions Secrets 均不保存 npm token。

## 维护者发布配置

本节面向包维护者。扩展用户只需执行 README 中的安装命令，不需要 npm 发布凭据或 trusted publisher 配置。

首次发布需要包发布权限，并使用**已有且经过验证的 GitHub Release 归档**，不要重新打包工作树：

- `@gfgghgftgffg/pi-web-access-lean`
- `@gfgghgftgffg/rpiv-todo-lean`
- `@gfgghgftgffg/pi-subagents-lean`

发布前，将三个归档与对应的 release tag 和 `assets.json` 校验。每次发布后，将精确版本的公开 registry `dist.integrity` 与清单比较，并检查 `dist-tags.latest`。npm 版本不能覆盖。写入结果不明时，先检查 registry，再决定是否明确重试。不要发布 private 的 workspace 根包。

包存在后，**三个包分别**在 npmjs.com → 包 → Settings → Trusted Publisher → GitHub Actions 配置。trusted publisher 配置需要维护者权限，并在账号层面启用 2FA：

| 字段 | 值 |
| --- | --- |
| Organization or user（GitHub 仓库所有者） | `gfgghgftgffg` |
| Repository | `amox_pi_extensions_lean` |
| Workflow filename | `release.yml`，不填完整路径 |
| Environment name | `release` |
| Allowed actions | 显式允许直接 `npm publish`；只有 stage 权限不够 |

GitHub 的 `release` environment 限制到 `main`，可按需加人工审批；两个发布 job 都可能请求审批。OIDC 验证成功后，在 npm 选择 “Require two-factor authentication and disallow tokens”，撤销不再使用的发布 token。Fork 或修改仓库、workflow、environment 名称时，需要同步包元数据并新建信任配置；迁移 VPS 不会授予 npm 发布权限。

npm [官方 trusted publishing 文档](https://docs.npmjs.com/trusted-publishers/)要求新信任配置在 **2 天内完成首次成功发布**。请在下次已审查的版本发布前就近配置；跳过已发布版本、dry-run 和登录状态检查都不能验证 OIDC。过期时，在发布前删除并重建信任配置。不要复用首次版本，也不要靠随意升版本掩盖配置缺失。首次真正的 OIDC 发布在 GitHub 成功前，仍属于未验证。

## 部分成功与恢复

写入前预检三个 registry 版本。已存在且 integrity 相同则跳过，同版本内容不同则拒绝。尚未首发、查询失败、试图倒退 `latest` 时停止。发布结果不明不会自动重试，也不会继续发布后面的包。

先检查精确的工作流运行、三个 registry 版本和哈希。在 artifact 保留期内（7 天），修复原因后，明确选择同一次 Release 的 **Re-run failed jobs**。已完成且一致的包会跳过。不要对已有 tag 重新启动一次完整手动 Release：GitHub 发布 job 有意拒绝改指 tag 或覆盖已有 release。artifact 已过期时，由维护者用已验证的 GitHub 附件手动恢复，先检查身份和 integrity。不要通过撤包或改写 tag 强行通过。registry `latest` 异常需要人工审查，不自动改 tag。

## 新 VPS 检查表

1. 日常 Pi 使用按 [bootstrap setup](https://github.com/gfgghgftgffg/amox-agent-bootstrap/blob/main/setup_for_pi.md) 安装。三个包可用后采用不固定版本的 `npm:@gfgghgftgffg/...` 来源，再用 `pi update --extensions`。npm 返回 404 时使用各扩展的 Git 安装脚本。保留上游依赖固定版本，不另行注册上游引擎。
2. 迁移旧本地来源需要用户同意：备份 settings，`pi list`，`pi remove <exact-old-source>`，再安装对应 npm 来源。保留无关包和凭据，重启 Pi，确认 `web_access`、`todo`、`subagent` 各一个。Git 本地安装仍需 `git pull --ff-only` 并重跑安装脚本。
3. 每日维护主机是独立的可选部署。按[本机维护说明](local-scheduler.md)安装 Linux 前置依赖和根依赖，按实际用户与路径修改 systemd unit，单独配置主机模型文件、仓库限定 GitHub PAT 和 SSH 权限。模型、GitHub、npm 凭据分开，不通过 Git 复制密钥、会话或模型日志。
4. 先停旧 VPS timer，再启新主机。检查时钟/时区、状态目录权限、磁盘 TMPDIR 和 bubblewrap 限制。先只读 `--dry-run`，再按授权选择至多一次真实验证，成功后启用每日 02:23 UTC timer。无更新检查成功不等于付费模型适配已验证，不要机械执行多轮付费检查。
5. 迁移 VPS 不迁移 npm trusted publishing，发布仍由 GitHub 执行。保持 workflow/environment 身份不变，保留三平台 CI 和人工审查；下次同时确认 GitHub Release 与 npm job，不能把 CI 绿灯当作发布成功。
