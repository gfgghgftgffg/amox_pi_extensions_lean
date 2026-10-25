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
- README 只描述当前安装、用法、配置、限制、版本与测量，中英文同步。技术审查保留在各包 `MAINTENANCE.md` 和 `maintenance/agent-review.md`，发布摘要写入 `maintenance/update-report.md`。

[每日 prompt](../maintenance/daily-update.md) 由独立 Pi SDK 会话加载；只有 `list/read/write/edit/check` 工具，不加载个人扩展、MCP、AGENTS、task-routing 或历史会话。失败后修复同一候选，不重新生成候选或凭口头声明通过。

Pi 的工具权限不是操作系统级沙箱。候选执行另用 bubblewrap 隔离，检查进程没有主机 home、SSH 或凭据，候选源码只读；安装与契约捕获仅开放所需写入。主机固定代码仍属于信任边界。

## CI、合并与发布

CI 对精确 PR head 独立运行 Linux、macOS、Windows 检查，必须通过 `all-platforms-pass`。Fork PR 可能需要维护者 Approve workflows to run。Actions 固定完整 SHA，checkout 不保留凭据，普通 CI 只读且不注入 Secrets。

固定主机自动合并当前维护会话创建的同仓非草稿 PR，合并前重新检查精确 head、最新 CI、PR 身份和 base/main，再按 head SHA 发送一次请求。不合并其它 PR，不直接推 main；检查失败、主干前进或写入结果不明就停止，不盲目重试。建议仓库规则要求 `all-platforms-pass` 和严格最新分支检查。

版本增加后，Release 对合并 SHA 重新执行三平台验收，发布三个归档和哈希清单，再由独立 OIDC job 发布这些归档到 npm。日常成功路径无需人工合并或 npm 认证。已发布版本不可覆盖；出现回归须重新验证并发布更高的修复版本。

- [维护主机部署与运行](local-scheduler.md)
- [npm 发布配置与恢复](npm-publishing.zh-CN.md)
