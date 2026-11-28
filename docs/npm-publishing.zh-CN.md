# npm 发布配置与故障恢复指南

[English](npm-publishing.md)

本仓库包含六个独立扩展包，由 [Release 工作流](../.github/workflows/release.yml) 通过 GitHub OIDC Trusted Publishing 将各包每次发版经三平台验证的 `.tgz` 归档发布至公共 npm。各包的实际可用性以对应 Release 的 npm job 和公共 npm 元数据为准。任何新增扩展包必须先完成下文的首次发布引导，随后才能交由 OIDC 无人值守发布。

## 按包独立发版机制

- **独立版本号与专属 Tag** — 每个 npm 包各自维护版本号、独立打 `<包名>@<版本>` Git tag 并创建各自的 GitHub Release；仓库根目录的 `package.json` 固定为 `"private": true` 与 `0.0.0`，绝不充当发布版本号。
- **按需打包与上传** — 仅当某个包的当前版本高于其最近一次 `<包名>@<版本>` 发布 tag 时才会进入本次发布列表（从未打过专属包 tag 的扩展以最新的旧版 `vX.Y.Z` 批次 tag 记录为初始基线）。未发生版本递增的包不会打包、不会请求 npm 注册表，也不会重复上传；构建清单 `.release-assets/assets.json` 逐一记录各归档对应的包名、版本与校验哈希。
- **统一的受影响范围验证** — 本地检查、精确 PR head 三平台 CI 与 Release 独立验收共用同一套变更范围分析器。当推送至 `main` 的提交包含待发布包版本时，由 Release 唯一负责该合并 SHA 的三平台验收，普通 `main`-push CI 自动让渡而不再重复跑矩阵（不含发版的常规 `main` 更新仍照常运行 CI）。共享脚本或依赖变更会自动扩大验收覆盖面，但绝不会把未升版的包连带发布出去。

## OIDC Trusted Publisher 配置

请在 npm 上为全部六个扩展包分别配置独立的 Trusted Publisher 连接：

- `@gfgghgftgffg/pi-web-access-lean`
- `@gfgghgftgffg/rpiv-todo-lean`
- `@gfgghgftgffg/pi-subagents-lean`
- `@gfgghgftgffg/pi-goal-x-lean`
- `@gfgghgftgffg/amox-pi-sync`
- `@gfgghgftgffg/amox-high-level`

| 配置项 | 必填值 |
| --- | --- |
| GitHub owner | `gfgghgftgffg` |
| Repository | `amox_pi_extensions_lean` |
| Workflow filename | `release.yml` |
| Environment | `release` |
| Allowed actions | 直接 `npm publish`（不能仅勾选 stage 权限） |

请保留已有包的连接配置；每个新包按下节完成首发后，单独配置自己的连接。GitHub 仓库的 `release` environment 应保持仅允许 `main` 分支部署，且不设人工审批门禁以支持无人值守发版。修改 npm 信任设置需要维护者账号与交互式 2FA，而日常 OIDC 自动发版无需在 Pi、systemd 或 GitHub Actions Secrets 中存放任何 npm token。

> [!IMPORTANT]
> 新建的 [npm Trusted Publisher 连接](https://docs.npmjs.com/trusted-publishers/)必须在创建后 **2 天**内完成首次真实 OIDC 发布。迁移日常维护所用的 Linux VPS 时无需重配 npm 信任连接。

**最小权限隔离：** 整个工作流中仅最后的 `npm` job 拥有 `id-token: write` 权限，同时仓库权限降为只读且不安装任何扩展运行时依赖；[scripts/publish-npm.mjs](../scripts/publish-npm.mjs) 会在上传前严格校验检出 SHA、发布 tag、归档文件集合及注册表 SHA-512 `dist.integrity`。

## 首次发布（以 goal 为例）

由于 OIDC 发布脚本在任何上传前都会拒绝 registry 中不存在的包，因此它无法从零创建全新包名，新包上架须由维护者引导一次：

1. **获取经验证的发布归档** — 当 `main` 首次引入新包或递增无历史 tag 的包版本时（或使用带 `<包名>@<版本>` 的手动 Release 指定发布），工作流会先完成三平台验证并生成发布资产。下载该次 Release 产出的已验证 `.tgz` 归档，核对包名、版本、源码 SHA 与哈希清单（严禁在本地工作树重新 `npm pack`），并将路径赋给环境变量 `ARCHIVE`。
2. **交互式执行首次发布** — 由具备 npm 维护权限的账号配合交互式 2FA 执行一次手动发布：

   ```bash
   npm publish "$ARCHIVE" --access public --tag latest --ignore-scripts --fetch-retries=0 --registry=https://registry.npmjs.org/
   ```

   执行后查询公共注册表元数据，确认线上的版本号、`dist.integrity` 与 `latest` 标签均与本地已验证归档完全一致（若命令返回结果不明，务必先核查 registry 实际状态，切勿盲目重试）。
3. **绑定 Trusted Publisher 并激活 OIDC** — 打开 `@gfgghgftgffg/pi-goal-x-lean` 的 npm 包设置页，按上表字段添加专属 Trusted Publisher。确认公共 registry 已可查到首发版本后，回到原 Release 运行记录点击 **Re-run failed jobs**：脚本核对 `dist.integrity` 一致后会自动跳过已上架的 goal 归档，继续发布同批次其余计划包。注意，这种幂等跳过不代表已验证 OIDC 信任——请务必在新建连接的 **2 天**有效窗口内发布下一个经审查的 goal 正式版本，以真正跑通首次 OIDC 上传。

## 失败恢复与手动发布

- **单次提交与只读轮询确认** — 每个待上架归档均通过 `--ignore-scripts --fetch-retries=0` 仅提交一次，随后进入共享的 10 分钟纯 `GET` 注册表可见性轮询。已上架且 `dist.integrity` 完全一致的版本自动跳过；一旦遇到哈希冲突、`latest` 标签异常或写入结果不明立即报错停止。严禁盲目重复上传、覆盖已有版本或将 `latest` 倒退回旧版本。
- **失败任务恢复流程** — 排障时先核查精确的 Release 运行日志以及本次计划包在公共 registry 上的实际版本（GitHub Release 创建成功并不代表后续独立的 `npm` job 已发布成功）。问题排除后，在 7 天构建产物保留期内直接对**同一次运行**点击 **Re-run failed jobs**，切勿对已存在的 tag 重新发起完整 Release。若构建产物已过期，应下载 GitHub Release 页面挂载的已验证 `.tgz` 附件并在严格核对包身份与哈希后恢复，严禁从本地工作树重新打包。
- **手动触发与回滚原则** — 手动触发 `release.yml` 时，可填入单个尚未发布的 `<包名>@<版本>` tag（须与当前 `main` 上的包版本完全一致且高于历史发布版本），或留空以一次性发布所有当前领先于历史 tag 的包；所有待发布 tag 均须在 `maintenance/update-report.md` 中存在对应的同名摘要块。鉴于公共 npm 版本不可撤回或篡改，发生线上回归时请修复后发布更高版本号。

## 迁移新 VPS 检查清单

1. **常规开发环境安装** — 普通机器按 [amox-agent-bootstrap](https://github.com/gfgghgftgffg/amox-agent-bootstrap/blob/main/setup_for_pi.md) 指引采用不固定版本的 `npm:` 来源安装；由于线上发布不更新个人安装，日常按需运行 `pi update --extensions` 升级即可。仅在确认公共 registry 明确返回 `404` 时才改用本地 Git 回退安装，切勿将认证异常或网络抖动误判为缺包。
2. **旧版地路径平滑迁移** — 迁移本地源码来源前须征得用户确认：先备份 Pi `settings.json`，通过 `pi list` 查明精确旧条目并仅移除对应项，随后安装 `npm:` 来源并重启会话——确保每类工具只保留单一门面且不破坏其他无关配置。
3. **迁移每日维护调度主机** — 按 [Linux 维护主机部署文档](local-scheduler.md) 在新机器上独立配置模型密钥、细粒度 GitHub PAT 与 SSH 密钥，严禁通过 Git 仓库拷贝凭据或会话文件；启用新机器 timer 前务必先停用旧 VPS 上的 timer。
4. **保持 OIDC 发布链路不变** — npm 发布全程由 GitHub Actions 执行，更换维护 VPS 无需申请任何新 npm 凭据或重配 Trusted Publisher；只需保持仓库名、`release.yml` 与 `release` environment 身份不变，并在下次发版时留心核对 Release 的 `npm` job 状态即可。
