# 维护者文档

本项目包含四个独立 lean 门面及 `amox-pi-sync` 独立 fork。后者基于 MIT `pi-sync-suite@0.1.1`（`npm:pi-sync-suite@0.1.1`，Copyright (c) 2026 Murat），在 manifest 中标记 `maintenanceMode: selective-fork`、`releaseVersioning: independent` 和 `toolContract: false`：每日监控 npm 正式发布，按功能边界审查后定向移植，不跟随整包覆盖、不添加上游运行时依赖，也不参与字符统计。舍弃功能跳过；有争议的新增、行为或兼容性问题通过 ntfy 请所有者决定，sync 暂不适配但不阻塞其它包。该包仍纳入受影响范围内的 CI 和独立安装验证；功能及 Starline 状态菜单见[包 README](../packages/amox-pi-sync/README.zh-CN.md)。

## 开发检查

需要 Node >=22.19、npm 和 Git，在仓库根目录运行：

```bash
npm ci --ignore-scripts
npm run check
npm run contracts:check
npm run verify:production
node scripts/audit-dependencies.mjs
node scripts/audit-dependencies.mjs --omit=dev
```

工具契约变化后执行 `npm run contracts`，审查 `maintenance/tool-contracts.json`，同步中英文 README 的字符代理统计。字符代理不是计费 token。

依赖审计始终执行；上游漏洞只记录警告，不阻断维护、CI、自动合并或发布。审计报告获取／执行错误仍报错，不冒充零漏洞；功能、类型、契约和生产安装失败仍严格阻断。

## 适配规则

- 对比 manifest 中当前版本与目标稳定版本的精确源码和 CHANGELOG；有外部 lean 作者来源的包逐项审查作者更新，不直接覆盖本仓库。
- `pi-goal-x-lean` 为本仓库原创门面（`maintenanceMode: original-facade`），没有外部 lean 作者仓库，不填写 `leanRepository` / `leanCommit`，只监控上游。`upstreamEntry: extensions/goal.ts` 指定 npm 包的真实入口，门面自身仍发布 `index.ts`。
- Git 审查路径继续要求 npm publication `gitHead`，缺失时不回退到仓库 HEAD 或 tag。`upstreamSource: npm` 显式选择精确 npm 发布来源，以 `upstreamRef: npm:<包名>@<版本>` 记录基线；复用 selective fork 的 tarball 收集器核对 registry／归档包名版本与 SHA-512，仅把文本写入 before/after 审查上下文，不安装或执行源码。校验失败仍阻断。`pi-goal-x@0.34.1` 没有 publication `gitHead`；其上游 tag `v0.34.1` peeled commit 为 `27d9facf49e66ee677770a74e26198a8bdcada8a`，仅作 Git 参考，不冒充 npm 来源证明。
- 保持最小改动，不复制上游实现，不改 node_modules。保留既有测试断言，只补与门面变化有关的回归。
- 依赖保持精确版本；Pi 开发 SDK、Action SHA 和维护宿主代码单独审查、更新及部署。
- README 只描述当前项目的介绍、安装、基本用法、封装差异、必要限制与字符测量，中英文同步。运行时只写随上游更新，不重复依赖版本、测试快照或上游手册；参数查 help 和上游文档，精确版本查 package.json、lockfile 和 manifest。技术审查与适配历史保留在各包 `MAINTENANCE.md` 和 `maintenance/agent-review.md`，发布摘要写入 `maintenance/update-report.md`。

[每日 prompt](../maintenance/daily-update.md) 由独立 Pi SDK 适配会话加载；只有 `list/read/write/edit/check` 工具；批准移植 sync 时另有 `ask_owner`，用于将适配中新发现的疑问持久记录、发 ntfy 并暂停同一候选，阻止后续推送／合并。sync 在暂存版本前另用只有 `list/read/submit_review` 的只读 SDK 会话审查，不加载个人扩展、MCP、AGENTS、task-routing 或历史会话。适配或验收失败后修复同一候选，不通过另起候选绕过检查或凭口头声明通过。仅可明确识别的服务器暂时性错误且尚未进入发布边界时，允许持久化排队两小时后重跑，最多额外三次；规则与通知见[延迟重试](local-scheduler.md#服务器错误延迟重试)。

Pi 的工具权限不是操作系统级沙箱。候选执行另用 bubblewrap 隔离，检查进程没有主机 home、SSH 或凭据，候选源码只读；安装与契约捕获仅开放所需写入。主机固定代码仍属于信任边界。

## 独立版本与验收范围

- 每个 npm 包独立递增版本，只与自身 package.json、lockfile 工作区记录和 manifest 条目对应；根 private 包版本及 GitHub tag 仅标识发布批次，不要求与 npm 版本相等。精确版本查 package.json 和 manifest；不得为发布同步包统一回滚或给其它包陪跑升版。
- 每日脚本仅暂存上游引擎、lean 作者来源变化或已批准定向移植的 selective fork 包。manifest 的 `release` 记录批次 `version`、精确 `baseCommit` 和非空、无重复的 `packageIds`，模型不可改写。手动准备发布也须同步这些字段；门禁要求所选包恰好是相对该 base 升版的包，并拒绝未选包发布文件变化。
- 本地 gate、PR CI 和 Release 共用变更范围判定：单包变化只跑该包类型/功能测试、契约与独立生产安装；共享源码、维护脚本、开发依赖或无法确定比较基准时全量检查，共享运行时依赖按锁文件扩展到实际使用它的包。依赖审计始终执行。扩大验收不等于扩大 npm 发布。
- goal/subagents 固定双向联合验收：任一包变化均验证两包的类型/功能、契约与独立生产安装，保持 subagents 的 global v1 API 与原版 dist 的原生 result/notification ABI 兼容。这是验证关系，不是 npm runtime 兄弟依赖；未变更兄弟包不升版、不发布。失败阻断同一候选；修复若需改另一包，须人工明确扩大发布选择，不能静默放行或放宽未选包发布文件及已有测试 append-only 保护。
- 契约捕获仅更新本批受影响记录，保留其它包快照；测量文档只改所选发布包。开发者仍可用上面的命令全量验收，或为单包命令附加 `--packages <id>`。受控 CI 通过 `scripts/check-changes.mjs` 与精确 SHA 自动计算范围，不接受模型提供的范围声明。

## CI、合并与发布

CI 对精确 PR head 独立运行 Linux、macOS、Windows 检查，必须通过 `all-platforms-pass`。Fork PR 可能需要维护者 Approve workflows to run。Actions 固定完整 SHA，checkout 不保留凭据，普通 CI 只读且不注入 Secrets。

固定主机自动合并当前维护会话创建的同仓非草稿 PR，合并前重新检查精确 head、最新 CI、PR 身份和 base/main，再按 head SHA 发送一次请求。不合并其它 PR，不直接推 main；检查失败、主干前进或写入结果不明就停止，不盲目重试。建议仓库规则要求 `all-platforms-pass` 和严格最新分支检查。

发布批次版本增加后，Release 对合并 SHA 按相同范围重新执行三平台验收，仅打包 manifest.release 选中的 npm 包及其各自版本，附带哈希清单，再由独立 OIDC job 发布这些归档。未选包不打包、不查询 registry、不重新上传；其版本保持不变。日常成功路径无需人工合并或 npm 认证。已发布版本不可覆盖；出现回归须重新验证并发布更高的修复版本。Release notes 复用本地 Pi 提交并通过门禁验证的摘要；CI 和 Release 不调用模型。

- [维护主机部署与运行](local-scheduler.md)
- [npm 发布配置与恢复](npm-publishing.zh-CN.md)
