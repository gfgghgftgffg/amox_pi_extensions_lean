# 维护者文档

本项目的 runtime 仍是三个独立 lean 门面。维护流程采用本地一次性 Pi，GitHub 只做普通 CI 和 Release，不再拆分检测、模型、候选 artifact、独立 verify 和 PR-writing jobs。

## 原则

- 阅读精确前后版本的源码和 CHANGELOG，按最小改动适配；不要复制上游运行时代码。
- 原 lean 作者的新 revision 只是待逐项审查的数据，不直接覆盖本项目。
- 保留现有断言；只补本次变化相关的门面回归。新增测试需要依据真实响应结构，不把展示文本当原始数据。
- 实际执行检查，失败后修复同一份候选。主干 CI 成功不能证明新增候选成功，Linux 本地成功不能冒充三平台成功。
- 依赖固定稳定版本；上游元数据失败、预发布和降级都明确报错。Pi 开发 SDK 与 Action SHA 仍由维护者单独更新，不跟随扩展上游自动升级。
- README 只描述当前安装、用法、配置、限制、版本与字符统计，中英文同步更新现有段落，不追加逐版本升级或作者审查流水账。详细审查与适配历史放在各包 MAINTENANCE.md 和 maintenance/agent-review.md，发布摘要进入 Release notes。
- 测试保留在原目录，不发布到三个 lean 包；不靠删除运行时测试获得绿灯。

## 本地开发

```bash
npm ci --ignore-scripts
npm run check
npm run contracts:check
npm run verify:production
npm audit --audit-level=high
npm audit --omit=dev --audit-level=high
```

适配或版本变动后用 `npm run contracts` 重新捕获 `maintenance/tool-contracts.json`，对照源码审查实际变化，并同步 README 中的字符代理统计。该统计不是计费 token。

只读检测：`npm run maintenance:plan`。自动维护：`npm run maintenance:local`。只读本机诊断：`npm run maintenance:dry-run`。调度、凭据隔离和失败副本说明见[本机每日维护](local-scheduler.md)。

Pi 的文件权限限制不是操作系统级沙箱。新流程另外把真正执行候选代码的检查放进 bubblewrap；不加载个人扩展、MCP、项目 AGENTS 或保存个人会话。主机固定代码仍需信任，不能把它当作对 VPS 管理员的隔离。

## GitHub

普通 CI 在 PR 和 main 更新后，独立运行 Linux、macOS、Windows 检查；`all-platforms-pass` 必须成功。PR checkout 固定候选 head SHA，不用可能变化的合并树。Fork PR 可能需要维护者 Approve workflows to run。

维护脚本创建 draft PR，三平台通过后仍等待人工审查合并。没有自动合并。发布模型摘要由固定脚本写入版本绑定的 `maintenance/update-report.md`；Release 不再调用模型。

Release 仅接受 main 上的统一包装版本增加，或手动输入与根 package.json、三个包和 manifest 一致的 `vX.Y.Z`。三个系统重新验证不可变提交；GitHub 写权限 job 只校验附件并创建 tag/Release，不执行 npm 或候选依赖。随后独立 npm job 使用 GitHub-hosted OIDC 发布同一批已验证 `.tgz`，只有仓库只读和 `id-token: write`，不安装扩展依赖，禁用生命周期脚本与 HTTP 重试。首次 npm 发布、三个 trusted publisher、部分成功恢复及 VPS 迁移见 [npm 发布说明](npm-publishing.zh-CN.md)。

建议在仓库规则中要求 `all-platforms-pass`、禁止直接写 main，并配置 `release` environment 的 main 限制与必要审批。修改规则是账号管理操作，不由维护 Agent 自动完成。

所有 Actions 使用完整 SHA；CI 只读、不注入 Secrets，checkout 不保留凭据。仓库不再有维护 workflow、原生 cron、模型探针或 Dependabot 配置。npm 发布在现有 Release 内，不新增维护 workflow；VPS 不保存 npm token。
