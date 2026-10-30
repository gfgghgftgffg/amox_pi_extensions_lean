# 维护者文档

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

- 对比 manifest 中当前版本与目标稳定版本的精确源码和 CHANGELOG；lean 作者更新逐项审查，不直接覆盖本仓库。
- 保持最小改动，不复制上游实现，不改 node_modules。保留既有测试断言，只补与门面变化有关的回归。
- 依赖保持精确版本；Pi 开发 SDK、Action SHA 和维护宿主代码单独审查、更新及部署。
- README 只描述当前项目的介绍、安装、基本用法、封装差异、必要限制与字符测量，中英文同步。运行时只写随上游更新，不重复依赖版本、测试快照或上游手册；参数查 help 和上游文档，精确版本查 package.json、lockfile 和 manifest。技术审查与适配历史保留在各包 `MAINTENANCE.md` 和 `maintenance/agent-review.md`，发布摘要写入 `maintenance/update-report.md`。

[每日 prompt](../maintenance/daily-update.md) 由独立 Pi SDK 会话加载；只有 `list/read/write/edit/check` 工具，不加载个人扩展、MCP、AGENTS、task-routing 或历史会话。适配或验收失败后修复同一候选，不通过另起候选绕过检查或凭口头声明通过。仅可明确识别的服务器暂时性错误且尚未进入发布边界时，允许持久化排队两小时后重跑，最多额外三次；规则与通知见[延迟重试](local-scheduler.md#服务器错误延迟重试)。

Pi 的工具权限不是操作系统级沙箱。候选执行另用 bubblewrap 隔离，检查进程没有主机 home、SSH 或凭据，候选源码只读；安装与契约捕获仅开放所需写入。主机固定代码仍属于信任边界。

## 独立版本与验收范围

- 每个 npm 包独立递增版本，只与自身 package.json、lockfile 工作区记录和 manifest 条目对应；根 private 包版本及 GitHub tag 仅标识发布批次，不要求与 npm 版本相等。
- 每日脚本仅暂存上游引擎或 lean 作者来源变化的包。manifest 的 `release` 记录批次 `version`、精确 `baseCommit` 和非空、无重复的 `packageIds`，模型不可改写。手动准备发布也须同步这些字段；门禁要求所选包恰好是相对该 base 升版的包，并拒绝未选包发布文件变化。
- 本地 gate、PR CI 和 Release 共用变更范围判定：单包变化只跑该包类型/功能测试、契约与独立生产安装；共享源码、维护脚本、开发依赖或无法确定比较基准时全量检查，共享运行时依赖按锁文件扩展到实际使用它的包。依赖审计始终执行。扩大验收不等于扩大 npm 发布。
- 契约捕获仅更新本批受影响记录，保留其它包快照；测量文档只改所选发布包。开发者仍可用上面的命令全量验收，或为单包命令附加 `--packages <id>`。受控 CI 通过 `scripts/check-changes.mjs` 与精确 SHA 自动计算范围，不接受模型提供的范围声明。

## CI、合并与发布

CI 对精确 PR head 独立运行 Linux、macOS、Windows 检查，必须通过 `all-platforms-pass`。Fork PR 可能需要维护者 Approve workflows to run。Actions 固定完整 SHA，checkout 不保留凭据，普通 CI 只读且不注入 Secrets。

固定主机自动合并当前维护会话创建的同仓非草稿 PR，合并前重新检查精确 head、最新 CI、PR 身份和 base/main，再按 head SHA 发送一次请求。不合并其它 PR，不直接推 main；检查失败、主干前进或写入结果不明就停止，不盲目重试。建议仓库规则要求 `all-platforms-pass` 和严格最新分支检查。

发布批次版本增加后，Release 对合并 SHA 按相同范围重新执行三平台验收，仅打包 manifest.release 选中的 npm 包及其各自版本，附带哈希清单，再由独立 OIDC job 发布这些归档。未选包不打包、不查询 registry、不重新上传；其版本保持不变。日常成功路径无需人工合并或 npm 认证。已发布版本不可覆盖；出现回归须重新验证并发布更高的修复版本。

- [维护主机部署与运行](local-scheduler.md)
- [npm 发布配置与恢复](npm-publishing.zh-CN.md)
