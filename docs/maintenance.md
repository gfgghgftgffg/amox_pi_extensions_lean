# 上游跟踪与最小改动维护

本仓库只维护三个 lean 门面（`packages/*-lean`）的适配层，上游引擎以精确版本依赖使用。
本文件说明自动化能做什么、不能做什么，以及人工/agent 如何按原始 lean 指南做**最小改动**。

## 1. 锁定与跟踪

- `maintenance/manifest.json` 记录每个包的上游包名、精确版本、上游仓库、lean 仓库与 `leanCommit` 基线。
- `.github/workflows/check-upstream.yml` 每天检测：
  - npm registry 的**最新稳定版**（`dist-tags.latest`，拒绝预发布、拒绝降级、拒绝坏元数据/网络失败）；
  - 三个 lean 仓库的 HEAD 是否偏离 `leanCommit`。
- 检测脚本默认只读报告：

```bash
node scripts/check-upstream.mjs                 # 只读报告（--dry-run）
node scripts/check-upstream.mjs --json          # 机器可读
node scripts/check-upstream.mjs --metadata <f>  # 离线注入元数据（测试/手动）
```

- `--apply` 才生成候选：要求 tracked checkout 与 `HEAD` 一致且无未提交/暂存改动（本地改动会被拒绝），
  用本地 Git 克隆精确基线到临时目录，排除 untracked 源文件；只在该临时目录改依赖版本、重装、重新捕获契约、对比快照。
  测试前在临时树创建 proposal commit 以供 Git 相关检查；artifact 的 `baseCommit` 仍是原始基线，绝不提交真实工作树。
  输出受约束的 `candidate.json` + 报告 + 诊断；**不会**修改适配代码、prompt、schema、描述或工具契约。
- 自动化**不会**自动改写代码、不会自动合并、不会发布 npm、不会使用 AI/模型密钥。

## 2. 候选状态

| 状态 | 含义 | 处理 |
| --- | --- | --- |
| `ready` | 依赖升级且结构契约无漂移，快照元数据可刷新 | 仍需人工 changelog/代码审查后合并 |
| `drift` | 工具/参数/default/描述/guideline 结构漂移 | 已接受快照保持不变；按第 4 节最小调整后重新生成 |
| `failed` | 安装/捕获/`npm run check` 失败 | 查看 artifact `diagnostics/`，人工修复后重跑 |
| `lean-review` | lean 仓库 HEAD 变化（manual reuse review） | 逐条审查可复用改进；`leanCommit` 人工确认后才更新 |
| `snapshot-refresh` | 无依赖变化，仅用 `--refresh-snapshot` 刷新无漂移快照元数据 | 人工确认快照内容无结构变化 |

结构对比会忽略包版本与 node 环境元数据，但会比较：工具增删、参数增删、`default` 值、
描述、promptSnippet、promptGuidelines（含顺序）、source、注册/活跃工具列表、entry 与包身份。
快照续期只允许 environment 与已声明升级的 upstream version 变化，lean 版本/entry 和无关 metadata 必须保留；计数器按真实契约字符串验证。
`upstreamGitHead` 来自 npm 已发布版本的 `gitHead`，不是可能已经前进的 repo HEAD；发布元数据缺失时失败并交人工处理。
旧测试通过**不等于**新特性已被 lean 版正确处理，
所有 draft PR 都需要人工查看上游 CHANGELOG/代码 diff。

## 3. 人工/agent 最小改动流程

1. 打开 `maintenance/update-report.md` 与 workflow artifact 中的
   `diagnostics/contract-diff.json`、`check.log`，确认变化清单。
2. 阅读对应包 `MAINTENANCE.md` 与上游 CHANGELOG/代码 diff，核对记录的上游内部细节
   （工具名、执行签名、`prepareArguments`、私有字段、状态条目格式等）。
3. 若只是版本/内部实现变化：不需要改 `index.ts`。
4. 若有新工具/新参数/默认值变化：按下述精简规则做最小调整（常用进 schema，冷门放 help；
   行为变化时同步描述），不要顺手重构。
5. 本地验证：

```bash
npm ci --ignore-scripts
npm run check                  # 三个包 + 根级 typecheck/test
npm run contracts              # 仅在确认无漂移、适配已更新后刷新快照
npm run contracts:check        # 校验快照与当前依赖一致
node scripts/verify-production-install.mjs   # 生产安装（--omit=dev --legacy-peer-deps）加载验证
```

6. 若 `leanCommit` 需要更新：只做人工逐条复用审查，然后手动改 `maintenance/manifest.json`；
   自动化永远不会替你更新该字段。

### 精简规则（与原始指南一致）

- 同一件事只说一遍；schema 已表达的类型/枚举/长度/数量不再用文字重复。
- 删除参数描述，保留字段名、类型与约束；字段名看不出用途的才留一句短描述。
- 删除只对人有用的界面说明；不用 MUST/NEVER/全大写语气；不写死该由用户决定的事。
- 会影响模型怎么调用的规则必须保留；工具列表在会话中途不能变。

### 维护提示词（复制给人工/agent）

```text
把本仓库（三个 lean 门面）同步到上游最新稳定版，保持最小改动：

1. 先读对应包的 MAINTENANCE.md，确认当前锁定版本、适配点与依赖的上游内部细节。
2. 对比两个版本代码与 CHANGELOG，列出：新增/删除工具、参数与默认值变化、行为变化，以及 MAINTENANCE.md 记录的工具名、执行签名、prepareArguments、私有字段等细节是否仍然成立。
3. 仅版本号与内部实现变化时，只升级依赖，不改 index.ts。
4. 有新参数或新工具的，按原精简规则补进 lean 版：常用参数进 schema，冷门参数放 help；上游行为变化时同步更新描述，不要让描述与行为对不上。
5. 保持工具列表在会话中不变、保持 prompt/schema/execute 结构；删哪些规则、合哪些工具有歧义时，先给出方案，不要直接改。
6. 运行 npm ci、npm run check、npm run contracts、npm run contracts:check、node scripts/verify-production-install.mjs；重新统计字符代理并同步 README、MAINTENANCE.md 与 maintenance/manifest.json。
7. 把改动清单交给人工确认后再合并或发版。
```

> 提示词与精简规则改编自 kunkun9527 的 lean 项目文档
> `docs/make-your-own-lean.zh-CN.md`（三个包的代码与许可证也来自该项目，见各包 `MAINTENANCE.md` / `LICENSE`）。

## 4. 漂移后如何刷新快照

1. 先按第 3 节完成适配代码的最小调整。
2. 运行 `npm run contracts` 重写 `maintenance/tool-contracts.json`（人工显式执行）。
3. 运行 `npm run contracts:check` 与 `npm run check` 确认一致。
4. 重新触发 `check-upstream`（或本地 `node scripts/check-upstream.mjs --apply`），
   确认候选状态变为 `ready`。

禁止为了让契约检查通过而放宽断言或直接把新 schema 标记为已接受；`--output` 只会把快照写到
指定文件，不会静默覆盖已接受快照。

## 5. 发布与后续版本

- 首次发布与 environment/reviewer 设置见 [actions-setup.md](./actions-setup.md)。
- 后续发版：人工 bump 根 `package.json` 版本 → 等 CI → 手动触发 Release 工作流（tag 与版本一致）。
- 推荐用户固定 tag 或 commit 安装：

```bash
pi install git:github.com/gfgghgftgffg/amox_pi_extensions_lean@v0.1.0
```

## 6. 安全声明

- 生成/安装/捕获/测试 job 只读、无 secret；写权限 job 只做候选校验与 PR 创建，不执行任何依赖。
- 特权校验只用 Node 内置模块从固定 `https://registry.npmjs.org` 获取版本 DATA（拒绝重定向），
  核对发布身份/commit、tarball 与规范 integrity；artifact/npm 配置不是 registry 权威。
  lock 只允许目标旧/新 runtime dependency closure 内可证明的变化；无关/共享记录、workspace metadata、peer/dev 变化与不支持的源/range 均拒绝并交人工处理。
  唯一收窄例外：同一更新 workspace 内两个显式变更的直接依赖根（如 rpiv-todo 与 rpiv-i18n
  在同一目标版本同步升级，且旧/新解析路径、peer 声明不变、range 满足、registry metadata 独立权威）
  允许随其声明的配对 peer 边一起更新；任何无关或受保护的直接/传递 peer 消费者（含 peer 环）
  仍会冻结该 peer 及其整个 runtime closure，其余 peer 变化一律交人工处理。
- 隔离临时 `HOME` 只是配置隔离，不是 OS 沙箱；不要在候选里注入凭据。
- 上游跟踪只读参考原始 lean 作者仓库，不会盲目覆盖本仓库的适配。
