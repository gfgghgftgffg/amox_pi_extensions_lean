# 开发检查与维护策略

本单仓维护两类独立发布的 Pi 扩展包：

1. **四个轻量门面（Lean Facades）** — `pi-web-access-lean`、`rpiv-todo-lean`、`pi-subagents-lean` 与仓库原创门面 `pi-goal-x-lean`，均以精确 npm 依赖引入上游运行时。
2. **独立维护衍生包** — `amox-pi-sync` 基于 MIT `pi-sync-suite@0.1.1`（`npm:pi-sync-suite@0.1.1`，Copyright (c) 2026 Murat），在 `maintenance/manifest.json` 中声明 `maintenanceMode: selective-fork`、`releaseVersioning: independent` 与 `toolContract: false`：每日监控上游 npm 稳定发布，对照包内功能边界只读审查后定向移植有价值的修复，不整包覆盖、不引入原版运行时依赖，也不计入工具字符对比；已裁剪模块直接跳过，遇到新增特性、取舍冲突或兼容性疑问则通过 ntfy 提请所有者拍板（期间仅暂缓 `sync`，不阻塞其他扩展更新），其功能与 Starline 状态菜单详见 [amox-pi-sync 文档](../packages/amox-pi-sync/README.zh-CN.md)。`amox-high-level` 声明为 `maintenanceMode: manual-fork`、`releaseVersioning: independent` 与 `toolContract: false`，由维护者手动审阅跟进。两包同样纳入受影响范围内的 CI 与独立生产安装验收。

## 本地开发验证命令

需要 Node.js `>=22.19`、npm 与 Git，在仓库根目录依次执行：

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm run check
npm run contracts:check
npm run verify:production
node scripts/audit-dependencies.mjs
node scripts/audit-dependencies.mjs --omit=dev
```

- **契约快照与字符代理刷新** — 当工具描述或 Schema 发生变化后，运行 `npm run contracts` 更新 `maintenance/tool-contracts.json`，人工核查差异并同步中英文 README 的字符代理统计（固定按 `ceil(字符数 / 4)` 估算，不是服务商计费 token）。
- **职责解耦与纯净环境** — `npm run check` 专注于各工作区类型检查与单元/集成回归；契约校验与独立生产安装由上述专用命令各跑一次，不在普通单测内嵌套重跑。`verify:production` 在隔离的空 `HOME` 目录中模拟真实用户安装加载，不依赖本机个人 Pi 环境。
- **依赖安全审计策略** — 本地门禁执行全量与 `--omit=dev` 两份审计；GitHub CI 与 Release 仅在 Ubuntu 节点执行这两份审计（避免在 macOS 与 Windows 重复请求注册表），且 `npm ci` 阶段统一关闭隐式 `--no-audit --no-fund`。按仓库策略，上游传递依赖漏洞作为警告记录在诊断报告中，不阻断日常维护、CI、自动合并或发布；但审计命令本身执行失败或无法获取报告仍会严格报错，绝不冒充“零漏洞”。类型、测试、契约与生产安装失败始终严格阻断。

## 上游审查与适配准则

- **精确发布基线对比** — 始终对比 `maintenance/manifest.json` 中记录的当前版本与目标稳定版本的精确源码及 `CHANGELOG`；拥有外部 lean 作者仓库的包需逐项审阅作者提交，按需吸收而非直接覆盖本仓实现。
- **`pi-goal-x-lean` 原创门面规则** — 标记为 `maintenanceMode: original-facade`，无外部 lean 作者仓库（不填 `leanRepository` / `leanCommit`），仅跟踪上游 `pi-goal-x`；`upstreamEntry: extensions/goal.ts` 指向 npm 包内真实入口，门面自身仍发布 `index.ts`。
- **来源完整性证明（Git `gitHead` 与 npm Tarball）** — Git 审查链路严格要求 npm 发布元数据提供 `gitHead`，缺失时绝不回退猜测仓库 `HEAD` 或 Git tag。显式声明 `upstreamSource: npm` 的包以 `upstreamRef: npm:<包名>@<版本>` 记录基线，复用 selective fork 的归档解析器校验 registry 包名、版本与 SHA-512 完整性，仅将纯文本源码提取至 `before`/`after` 审查目录，绝不安装或执行生命周期脚本；任何校验不匹配立即阻断。（注：`pi-goal-x@0.34.1` 发布包不含 `gitHead`，其上游 tag `v0.34.1` 解引用提交 `27d9facf49e66ee677770a74e26198a8bdcada8a` 仅作历史 Git 参考，不作为 npm 发布来源证明。）
- **最小改动与测试只增不删** — 坚持最小改动原则，不复制上游引擎实现，严禁修改 `node_modules`；完整保留既有基线测试断言（append-only），仅针对门面行为变更补充聚焦回归；所有运行时依赖固定精确版本号，Pi 开发 SDK、GitHub Actions SHA 与维护宿主脚本单独审查升级。
- **文档职责分离** — 各级 **README 只描述当前**项目的功能定位、安装方式、核心用法、封装差异、必要限制与字符代理测量，保持中英文同步；运行时仅说明跟随上游稳定版演进，不手写具体依赖版本号、测试宿主快照或复制上游完整参数手册（详细参数通过 `help` 或上游文档查询，精确版本以 `package.json`、lockfile 与 `manifest.json` 为准）。技术审查细节沉淀在各包 `MAINTENANCE.md` 与 `maintenance/agent-review.md`，版本发布摘要写入 `maintenance/update-report.md`。

### 自动化会话权限与操作系统沙箱

[每日维护提示词](../maintenance/daily-update.md)由隔离的本地 Pi SDK 会话加载：

- **最小工具集** — 常规适配会话仅开放受控的 `list`、`read`、`write`、`edit`、`check` 五个工具（获批移植 `amox-pi-sync` 时额外提供 `ask_owner`，用于将编码阶段新发现的取舍疑问持久化保存、推送 ntfy 并原地暂停当前候选，阻止后续推送与合并）；`sync` 初审阶段则使用仅含 `list`、`read`、`submit_review` 的纯只读会话，全程不加载个人扩展、MCP、`AGENTS.md`、task-routing 或历史会话。
- **同一候选闭环与 bubblewrap 隔离** — 适配或门禁报错必须在同一份候选目录中修复并通过真实 `check`，绝不允许另起炉灶绕过断言或凭模型口头声明放行；仅在进入发布写入边界前遇到明确的临时性服务器 5xx 错误时，才交由主机持久化队列在 2 小时后重试（最多额外 3 次），详见[延迟重试规则](local-scheduler.md#服务器错误延迟重试)。由于 **Pi 的工具权限不是操作系统级沙箱**，所有候选安装与检查均在 `bubblewrap` 容器内执行：隔离进程无权访问宿主机 `HOME`、SSH 密钥或发布凭据，候选源码挂载为只读，仅对依赖安装与契约输出开放最小必要写路径（宿主机固定调度脚本自身属于受信边界）。

## 独立版本控制与精准验收范围

- **按包独立版本号与 Tag** — 每个工作区包独立递增版本，严格对齐自身 `package.json`、`package-lock.json` 工作区记录与 `maintenance/manifest.json`；发布 tag 格式固定为 `<包名>@<版本>`，根仓库 `private` 包版本恒为 `0.0.0`（不代表发布批次，也无需递增）。严禁为了发版让未变更的包陪跑升版。
- **版本即发布契约** — 每日脚本仅暂存上游引擎、外部 lean 作者提交发生变动或已批准定向移植的包。当且仅当某包当前版本高于其上一个发布 tag 时才成为发布候选；任何已纳入 npm 发布的包内文件（含源码、`README*.md`、`MAINTENANCE.md` 等）只能在递增该包版本的同时修改，否则范围门禁直接拒绝，且版本号只增不减。
- **共享的变更范围计算** — 本地门禁、PR CI 与 Release 共用 `scripts/check-changes.mjs` 的精确 SHA 差异计算（不采信模型自报的范围）：单包改动仅执行该包的类型/功能测试、契约检查与独立生产安装；涉及共享脚本、开发依赖或缺少不可变基准 SHA 时自动升级为全仓库全量检查；锁文件中共享运行时依赖变更则精准扩展至依赖闭包内的受影响包。依赖安全审计始终运行。**扩大验收范围绝不等于扩大 npm 发布范围。**
- **Goal 与 Subagents 双向联合验收** — `pi-goal-x-lean` 与 `pi-subagents-lean` 绑定为双向联合验证对：任一包发生变更，都会同时跑通两包的类型/功能测试、契约校验与独立生产安装，持续守护 `subagents` 全局 v1 子会话上下文接口及原版 `dist` 结果/通知 ABI 兼容性。这只是测试门禁关系而非 npm 运行时兄弟依赖——未改动的一方不升版、不发布；若兼容性修复确实需要改动另一方代码，必须由人工显式递增另一方版本并纳入发布，严禁静默夹带未升版改动或放宽测试 append-only 保护。
- **局部快照更新** — 单包更新时，契约捕获仅刷新受影响包的条目并保留其余包快照，测量文档也只改写本次升版的包；本地开发时既可跑全量命令，也可在单包命令后追加 `--packages <id>` 定向验证。

## CI、固定主机自动合并与 OIDC 发布

1. **只读三平台 PR CI** — GitHub Actions 对精确的 PR head SHA 在 Linux、macOS、Windows 三平台并行执行完整验证，并汇总至必过门禁 `all-platforms-pass`（外部 Fork PR 可能需维护者点击 **Approve workflows to run**）。所有 Action 均固定 40 位完整 commit SHA，`checkout` 显式关闭凭据持久化，普通 CI 仅申请 `contents: read` 且零 Secrets 注入。
2. **固定主机条件自动合并** — 维护主机仅针对本次维护会话亲手创建的同仓非草稿 PR 执行自动合并：发起合并前会再次核查精确 head SHA、`all-platforms-pass` 最新状态、PR 身份以及 `main` 基线未发生偏移，确认无误后**再按 head SHA 发送一次请求**。绝不合并非本轮 PR，绝不直接向 `main` 强推；一旦预检不符、主干前进或合并响应状态不明立即停机，绝不盲目重试（建议仓库分支保护开启 `all-platforms-pass` 与严格最新分支要求）。
3. **主干推送分流与按包独立发布** — `main` 分支收到推送后先运行发布规划：无待发布包版本时执行常规三平台 CI；存在高于历史 tag 的待发布包版本时，普通 push CI 自动让渡给 Release，由 Release 对该合并 SHA 执行唯一一套三平台验收（规划步骤报错绝不会伪装成验收通过）。验收通过后，Release 仅为本次升版的每个包分别创建 `<包名>@<版本>` tag 与 GitHub Release、构建各自版本的归档与哈希清单，再交由隔离的 OIDC `npm` job 上传至公共注册表——未升版的包不打包、不查 registry、不重传。**CI 和 Release 不调用模型**；**Release notes 复用本地 Pi** 在门禁阶段生成并写入 `maintenance/update-report.md` 的绑定摘要（人工手动升版发包前也必须在该报告中补齐对应 `<包名>@<版本>` 的摘要块，否则 Release 会在建 tag 前拒绝）。已发布的 npm 版本不可覆盖或撤回，线上回归须通过更高版本号修复发布。

## 延伸阅读

- [维护主机部署与运行](local-scheduler.md)
- [npm 发布配置与故障恢复](npm-publishing.zh-CN.md)
