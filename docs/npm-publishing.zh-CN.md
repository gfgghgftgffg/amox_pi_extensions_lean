# npm 发布

[English](npm-publishing.md)

三个扩展包已在 npm 公开发布。[Release](../.github/workflows/release.yml) 通过 OIDC 发布已验证的 GitHub Release 归档；用户只需执行 README 中的安装命令。

## 发布配置

每个包分别配置 npm Trusted Publisher：`@gfgghgftgffg/pi-web-access-lean`、`@gfgghgftgffg/rpiv-todo-lean`、`@gfgghgftgffg/pi-subagents-lean`。

| 字段 | 值 |
| --- | --- |
| GitHub owner | `gfgghgftgffg` |
| Repository | `amox_pi_extensions_lean` |
| Workflow filename | `release.yml` |
| Environment | `release` |
| Allowed actions | 直接 `npm publish`，不能只有 stage 权限 |

这些连接已在使用。GitHub 的 `release` environment 保持仅允许 `main`，无人值守发布不设人工审批。管理 npm 信任配置需要维护者权限和交互式 2FA，日常 OIDC 发布不需要。[新连接](https://docs.npmjs.com/trusted-publishers/)必须在 **2 天**内完成首次成功发布。迁移 VPS 不必重做配置。

只有 npm job 获得 `id-token: write`，仓库只读，不安装扩展依赖。[发布脚本](../scripts/publish-npm.mjs) 校验源码 SHA、tag、归档内容和 registry integrity。根 `package.json` 保持 private。Pi、systemd 和 Actions Secrets 不需要 npm token。

## 失败恢复

每个缺失归档只通过 `--ignore-scripts --fetch-retries=0` 提交一次，再共享十分钟只读 GET 可见性检查。已存在且一致的版本跳过；integrity 冲突或写入结果不明就停止。不盲目重复上传、不覆盖版本、不倒退 `latest`。

先检查精确的 Release 运行和三个 registry 版本。修复原因后，在 artifact 保留期内（7 天）对同一次运行选择 **Re-run failed jobs**。不要为已有 tag 重新启动完整 Release。artifact 已过期时，使用已验证的 GitHub Release 附件恢复，写入前核对身份和哈希，不重新打包工作树。GitHub Release 成功不能单独证明 npm 发布成功。

手动完整 Release 只用于尚未发布、与根目录、三个包和 manifest 版本一致的 tag。回滚不会撤回 npm 版本，修复应发布更高版本。

## 新 VPS 检查表

1. 日常 Pi 使用按 [bootstrap](https://github.com/gfgghgftgffg/amox-agent-bootstrap/blob/main/setup_for_pi.md) 安装，采用不固定版本的 npm 来源。按需执行 `pi update --extensions`，发布不更新个人安装。只有确认公共 registry 返回 404 时才使用 Git 回退，不把认证或网络错误当成缺包。
2. 迁移已有本地来源须经用户同意：备份 settings，通过 `pi list` 确定精确来源，仅移除对应项，安装 npm 来源后重启。每个工具只保留一个门面，保留无关配置。
3. 需要每日维护时，按 [Linux 主机部署](local-scheduler.md) 单独配置模型、GitHub 和 SSH 权限，不通过 Git 复制凭据或会话。先停旧 VPS timer，再启新 timer。
4. npm 发布仍由 GitHub 执行。迁移 VPS 不需要新的 npm 凭据或信任连接；保持仓库、workflow、environment 身份不变，并检查下次 Release 的 npm job。
