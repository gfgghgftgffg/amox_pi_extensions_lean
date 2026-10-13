# 维护者文档

Actions 配置和工作流概览见 [README](../README.md#自动维护)。维护遵循[原 lean 指南](https://github.com/kunkun9527/my-lean-pi-setup/blob/main/docs/make-your-own-lean.zh-CN.md)：依赖锁定精确版本，按上游 API 和行为变化做最小改动，执行继续委托上游。

## 适配约束

- 每个包的 `MAINTENANCE.md` 记录内部接口、生命周期和升级注意事项；升级前对照新旧源码与 changelog。
- 常用参数保留在 schema，完整参数和说明通过 help 提供。新增工具、默认值或行为变化需要同步适配说明与测试。
- 原 lean 仓库的改动逐项评估，不整仓覆盖；通过审查和独立验证后才更新 `leanCommit`。
- 适配代码变化必须增加回归测试，自动 agent 不能删除或改写既有断言。无法确认兼容性时，提案应列出未解决事项并停止。

## 版本与产物

| 文件或产物 | 内容 |
| --- | --- |
| `maintenance/manifest.json` | 包装版本、上游精确版本及发布 commit、原 lean 已审查 commit；单体仓库的源码目录和相关目录 |
| `maintenance/tool-contracts.json` | 隔离 Pi 会话捕获的工具定义、活动工具和字符代理统计，不是实际计费 token |
| `maintenance/agent-review.md` | 源码 revision、API/行为差异、适配理由及未解决事项 |
| `maintenance/update-report.md` | 候选发布版本、绑定版本的 AI 更新摘要及验证记录 |
| workflow artifacts | 依赖候选、源码上下文、agent 提案、独立验证日志和最终 bundle |

独立验证阶段统一增加 patch 版本，同步根、三个包、manifest 和 lockfile，并重建快照和文档统计。agent 本身不能修改依赖或版本。候选绑定基线 SHA；`main` 前进后，旧基线不能应用。

发布产物为三个独立包和 `assets.json`，通过 GitHub Release 提供。现有 npm 发布 job 未启用。

`maintenance_finish.summary` 写成面向使用者的 Markdown 更新条目，描述实际功能／行为变化、适配、修复和限制，不只列版本或内部审查过程，也不声称尚未执行的测试已通过。独立验证器把摘要包在版本标记中写入 `maintenance/update-report.md`，Release 直接读取并补充确定的验证和安装信息，不再次调用模型。摘要缺失、重复或版本不匹配时，在使用写 token 和预留 tag 前停止。手动发布也需要匹配版本的摘要；既有 tag 和安装包不自动改写。

## 本地检查

```bash
npm ci --ignore-scripts
npm run check
npm run contracts:check
npm run verify:production
npm run test:maintenance-pipeline
npm audit --audit-level=high
npm audit --omit=dev --audit-level=high
```

离线 pipeline 在临时 clone 中检查适配、版本生成、打包和数据应用，不调用真实模型或发布服务。接受适配后的工具定义变化时，用 `npm run contracts` 重建快照，再执行上述检查。

### 阶段命令

| 命令 | 作用 |
| --- | --- |
| `npm run maintenance:plan` | 只读检查版本与源码 revision |
| `npm run maintenance:prepare` | 准备依赖候选并收集精确源码上下文，要求干净的 tracked checkout |
| `npm run maintenance:adapt` | 使用模型配置生成适配提案 |
| `npm run maintenance:verify` | 应用提案、生成版本和快照、测试并创建本地验证提交；仅用于临时 clone 或 runner |
| `node scripts/automate-maintenance.mjs apply` | 校验并应用已验证 bundle，供 PR job 使用 |

`maintenance:stage` 和 `scripts/check-upstream.mjs --apply` 是底层候选生成工具，不执行完整 agent 适配。其 `ready/drift/failed/lean-review/snapshot-refresh` 状态不能替代独立验证。

## 故障诊断

| 阶段 | 检查项 |
| --- | --- |
| 定时未触发 | cron 使用 UTC：Check upstream 为北京时间 10:23，CI 为 12:17。核对默认分支、workflow 启用状态及 `schedule` 运行历史。GitHub 定时事件可能延迟或被丢弃；没有记录时不能据此判断无更新。 |
| detect | npm/git 网络、metadata 和安装诊断。安装成功但旧封装捕获失败时，保留 lockfile 与诊断交给 agent 修复。上传隐藏目录需显式设置 `include-hidden-files: true`。 |
| adapt | `MAINTENANCE_*`、服务协议、模型 ID、额度、超时和未解决事项。detect 成功不代表模型调用成功。 |
| verify | 下载 `maintenance-verification-logs-<OS>`，定位测试、契约、安装或审计失败。失败提案不会进入 PR job。 |
| open-pr | PR 创建权限、bundle 校验和基线 SHA。`main` 已更新时需重新运行。 |
| release | 包装版本、tag、匹配版本的更新摘要、审批和验证结果。已有 tag 不移动或删除；tag 预留成功但 Release 创建失败时，只恢复 Release。 |

修复后从最新 `main` 新建 workflow 运行；重跑旧记录仍使用旧 SHA。自动提案分支 `maintenance/upstream-update` 会被后续检测重建，手工修复应使用独立分支。若 GitHub 要求 **Approve workflows to run**，批准后确认 PR 的完整 CI 结果。

## 执行与凭据边界

模型仅有受限文本工具，可修改适配入口、包文档、追加测试和审查报告；不能运行 shell、加载项目扩展或 MCP、读取环境变量、修改工作流、脚本、依赖、许可证和已接受快照。模型凭据只在 adapt 的 SDK 步骤可用，不与上游执行共享。

候选跨 job 传递时校验路径、大小、哈希、固定依赖来源、发布 commit 和 metadata。verify 使用独立三平台 runner，不带模型凭据或写 token；open-pr 不执行候选代码；release/npm 仅处理预构建包。隐藏产物上传限定到候选目录或发布目录，不上传整个 checkout。

路径白名单和临时 HOME 不是操作系统级沙箱，测试也不能证明所有新增行为均被覆盖。源码、生成代码和回归测试仍需代码审查；模型服务会接收被读取的公开源码和维护材料，原始 transcript 不上传。
