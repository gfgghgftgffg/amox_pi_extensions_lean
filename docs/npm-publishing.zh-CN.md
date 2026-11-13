# npm 发布

[English](npm-publishing.md)

仓库包含五个独立扩展包。[Release](../.github/workflows/release.yml) 通过 OIDC 将本批选中、已验证的 GitHub Release 归档发布到公共 npm。各包实际可用性以对应 Release 的 npm job 和公共 npm 元数据为准。新包须先完成下述首次发布配置，再使用 OIDC 发布。

## 按包独立发布

每个 npm 包独立维护版本。根 private 包版本和 GitHub `vX.Y.Z` tag 仅标识发布批次，不是五个 npm 包的统一版本。受保护的 `maintenance/manifest.json` release 选择记录批次版本、精确 base 和包 ID；只给选中的包升版、打包和发布，未变化的包保持版本，不查询 registry 或重新上传。`assets.json` 分别记录每个归档的包版本。

本地检查、精确 PR head 三平台 CI 和独立 Release 验收共用受影响范围。发布批次由 Release 唯一验证合并 SHA，普通 main-push CI 不再重复跑同一矩阵；非发布 main 更新仍运行 CI。共享代码或依赖变化扩大验收，不会自动扩大 npm 发布选择。

## 发布配置

每个包分别配置 npm Trusted Publisher：`@gfgghgftgffg/pi-web-access-lean`、`@gfgghgftgffg/rpiv-todo-lean`、`@gfgghgftgffg/pi-subagents-lean`、`@gfgghgftgffg/pi-goal-x-lean`、`@gfgghgftgffg/amox-pi-sync`。

| 字段 | 值 |
| --- | --- |
| GitHub owner | `gfgghgftgffg` |
| Repository | `amox_pi_extensions_lean` |
| Workflow filename | `release.yml` |
| Environment | `release` |
| Allowed actions | 直接 `npm publish`，不能只有 stage 权限 |

保留现有连接；每个新包按下节完成首发后，单独配置自己的连接。GitHub 的 `release` environment 保持仅允许 `main`，无人值守发布不设人工审批。管理 npm 信任配置需要维护者权限和交互式 2FA，日常 OIDC 发布不需要。[新连接](https://docs.npmjs.com/trusted-publishers/)必须在 **2 天**内完成首次成功发布。迁移 VPS 不必重做配置。

只有 npm job 获得 `id-token: write`，仓库只读，不安装扩展依赖。[发布脚本](../scripts/publish-npm.mjs) 校验源码 SHA、tag、归档内容和 registry integrity。根 `package.json` 保持 private。Pi、systemd 和 Actions Secrets 不需要 npm token。

## 首次发布（以 goal 为例）

OIDC 发布脚本在任何上传前都会拒绝 registry 中不存在的包，不能自行完成新包首发。

1. 将新包纳入受保护的 release 选择，从对应 GitHub Release 获取已验证的归档与 `assets.json`。核对包身份、版本、源码 SHA 和哈希，不重新打包工作树。将 `ARCHIVE` 设为已验证的 `.tgz` 路径。
2. 维护者通过交互式 npm 认证和 2FA，将该已验证归档发布一次：

   ```bash
   npm publish "$ARCHIVE" --access public --tag latest --ignore-scripts --fetch-retries=0 --registry=https://registry.npmjs.org/
   ```

   确认公共 registry 的版本、`dist.integrity` 和 `latest` 与已验证归档一致。上传结果不明时先检查 registry，再决定是否重试。
3. 在 `@gfgghgftgffg/pi-goal-x-lean` 的 npm 设置中，按上表添加独立 Trusted Publisher。registry 验证通过后，才重跑原 Release 失败的 npm job；它会跳过内容一致的 goal 归档，继续其它选中包。跳过不代表已验证 OIDC 信任：连接的首次成功 OIDC 发布须在连接的两天窗口内，使用下一个经审查的 goal 版本完成。

## 失败恢复

每个缺失归档只通过 `--ignore-scripts --fetch-retries=0` 提交一次，再共享十分钟只读 GET 可见性检查。已存在且一致的版本跳过；integrity 冲突或写入结果不明就停止。不盲目重复上传、不覆盖版本、不倒退 `latest`。

先检查精确的 Release 运行和本批选中包的 registry 版本。修复原因后，在 artifact 保留期内（7 天）对同一次运行选择 **Re-run failed jobs**。不要为已有 tag 重新启动完整 Release。artifact 已过期时，使用已验证的 GitHub Release 附件恢复，写入前核对身份和哈希，不重新打包工作树。GitHub Release 成功不能单独证明 npm 发布成功。

手动 Release 只用于尚未发布且与根目录批次版本、受保护 release 选择一致的 tag；各个选中包分别匹配自身 manifest 版本，不要求等于 tag。回滚不会撤回 npm 版本，修复应发布更高版本。

## 新 VPS 检查表

1. 日常 Pi 使用按 [bootstrap](https://github.com/gfgghgftgffg/amox-agent-bootstrap/blob/main/setup_for_pi.md) 安装，采用不固定版本的 npm 来源。按需执行 `pi update --extensions`，发布不更新个人安装。只有确认公共 registry 返回 404 时才使用 Git 回退，不把认证或网络错误当成缺包。
2. 迁移已有本地来源须经用户同意：备份 settings，通过 `pi list` 确定精确来源，仅移除对应项，安装 npm 来源后重启。每个工具只保留一个门面，保留无关配置。
3. 需要每日维护时，按 [Linux 主机部署](local-scheduler.md) 单独配置模型、GitHub 和 SSH 权限，不通过 Git 复制凭据或会话。先停旧 VPS timer，再启新 timer。
4. npm 发布仍由 GitHub 执行。迁移 VPS 不需要新的 npm 凭据或信任连接；保持仓库、workflow、environment 身份不变，并检查下次 Release 的 npm job。
