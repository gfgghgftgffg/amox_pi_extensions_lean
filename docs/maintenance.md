# 上游维护：自动适配，人工确认，合并后发布

按 [原 lean 指南](https://github.com/kunkun9527/my-lean-pi-setup/blob/main/docs/make-your-own-lean.zh-CN.md) 做最小改动：上游装成精确版本依赖，封装只精简模型侧描述/schema，执行继续委托上游；不复制上游实现、不改 node_modules。

GitHub Actions 和模型设置见 [actions-setup.md](actions-setup.md)。根 workspace 不作为安装包，三个扩展独立打包和安装。

## 自动流程

```text
每日检测 npm latest 和原 lean 仓库 HEAD
  → 准备依赖候选、收集 old/new 精确 commit 的源码与 changelog
  → 受限 SDK agent 阅读 MAINTENANCE.md、审查 API/行为、做最小适配
  → macOS / Windows / Linux 独立 runner 应用提案、生成 patch、安装并重新测量
  → 三平台类型/回归/契约检查、分包安装和安全审计全部通过
  → 创建草稿 PR
  → 你审查并合并
  → Release 再做三平台验证，创建不可变 tag + 三个独立包
  → 若启用 PUBLISH_NPM，逐个发布 npm 包
```

agent 按指南处理新参数、工具、默认值和行为变化，更新描述、help、包 README 和 MAINTENANCE.md。工具名称和封装身份保持稳定；常用参数进 schema，冷门参数通过 help 展示。改变适配代码必须提供回归测试，既有测试只能追加。无法确认兼容性时必须报告未解决问题，不得为了通过校验删断言或放宽验证。

原 lean 仓库的新 HEAD 是改进来源，需要逐条审查（manual reuse review），不能整仓覆盖。agent 审查完并通过独立验证后，生成器才将对应 `leanCommit` 更新到已审查的精确 commit；PR 中会显示这项变化，仍由你确认。

## 版本与证据

- `maintenance/manifest.json`：上游精确版本、npm 发布 commit、原 lean 来源与已审查 commit，以及每个包装包的发布版本。收集单体仓库源码时也包含相关目录，例如 rpiv-i18n，并记录其实际 Git revision。
- `maintenance/tool-contracts.json`：隔离 Pi 会话实测工具描述、schema、snippet/guideline 和字符代理统计；不是模型 tokenizer 或计费 token。
- `maintenance/agent-review.md`：agent 阅读的源码 revision、API/行为变化、适配理由、复用/拒绝的原 lean 改动与未解决事项。
- `maintenance/update-report.md`：独立验证后的候选说明和计划发布版本。
- workflow artifacts：依赖候选、源码文本、模型提案、独立验证日志及最终受限 bundle。

包装版本由生成器统一增加 patch，同步根 package.json、三个包、manifest 和 lockfile；agent 不能自行改版本。契约快照、实际统计和 README 测量区段也由独立验证阶段生成。不要将“旧测试通过”理解为“所有新增功能都覆盖了”，仍要审查新增回归测试。

## 失败时怎么办

| 位置 | 处理 |
| --- | --- |
| detect | 看 npm/git 网络与 metadata、依赖安装/契约捕获诊断；安装未成功的候选不交给 agent。若依赖已安装，但旧封装因 API 变化而捕获失败，保留 lockfile 与诊断，仍交 agent 修复。 |
| adapt | 检查 MAINTENANCE_* 配置、额度、服务协议、模型超时或未解决事项。没有真实凭据不能做在线适配。 |
| verify | 下载 `maintenance-verification-logs-<OS>`。代码/测试/契约/生产安装/审计任一失败，都不创建更新 PR、不发版；不要弱化检查来绕过。 |
| open-pr | 检查 PR 创建权限、bundle 数据校验和 main 是否已前进；旧基线需重新运行。 |
| release | 看 version/tag/审批/CI。已有 tag 永远不删除、不移动；若 tag 已预留而 Release 创建失败，人工恢复 Release，不再为同一 tag 重跑完整创建。 |
| npm | 核对 scope 权限、token 有效期、2FA 与包是否已发布。部分成功后重跑失败 job，只允许跳过字节完全相同的已有版本。 |

自动流程一次提出适配并独立验证；失败会停止，不会无限让模型修改或自动重试发版。需要修改受保护的 scripts/workflow、依赖种类、工具身份或旧测试时，另开人工修复 PR。

**不要手工编辑机器分支 `maintenance/upstream-update`**，下一次定时运行会重建它。Mark ready、批准 PR CI、审查后合并；若 `release` 环境设置了审批人，还需要批准发布，否则合并后的发布会等待。

## 本地命令

```bash
npm ci --ignore-scripts
npm run check
npm run contracts:check
npm run verify:production
npm run test:maintenance-pipeline # 一次性 clone 中的离线端到端测试，无真实模型/发布
npm run maintenance:plan        # 只读版本报告，不修改仓库
npm run maintenance:prepare     # clean checkout：依赖候选 + 精确源码上下文
npm run maintenance:adapt       # 已配置模型：生成受限 agent 提案
```

`npm run maintenance:verify` 会应用提案、升级版本、生成快照并创建**本地验证提交**。只在一次性 clone/runner 中执行，不要在日常工作树运行。`node scripts/automate-maintenance.mjs apply` 是 PR 写权限 job 的数据应用入口，也不是普通开发命令。

旧的 `npm run maintenance:stage` / `scripts/check-upstream.mjs --apply` 保留为底层**只生成依赖候选**的诊断工具，不代表完整自动适配。它们拒绝 dirty tracked checkout，不修改拥有者工作树中的适配代码；状态 `ready/drift/failed/lean-review/snapshot-refresh` 是这一底层阶段的结果，不能跳过 agent 和独立验证直接自动发布。

### 人工修复与重新测量

阅读包 MAINTENANCE.md 和新旧源码，按原指南最小修改，补回归测试后：

```bash
npm run contracts             # 明确接受适配后，重建快照
npm run check
npm run contracts:check
npm run verify:production
npm audit --audit-level=high
npm audit --omit=dev --audit-level=high
```

人工发版需要同步根、三个包、manifest、lockfile 的包装版本并重建快照；版本增加的 PR 合并到 main 后自动触发 Release。首次未增加版本的发版用手动 Release 入口。

## 权限边界

模型仅能读指定的文本源码、维护说明，写适配入口、包文档、新增/追加包测试和审查报告。不能运行 shell、加载项目扩展/MCP、访问环境变量、改 workflow/script、package.json、依赖、许可证或已接受快照。模型 key 不与上游执行共享步骤。

候选跨 job 传递时检查基线 SHA、路径、大小、哈希、固定依赖来源、发布 commit 和受控 metadata；写权限 job 不执行候选代码。独立验证不带模型或发布凭据，最终发布只处理预构建档案。完整设计见设置文档；这不能替代人工语义审查，故始终不自动合并。
