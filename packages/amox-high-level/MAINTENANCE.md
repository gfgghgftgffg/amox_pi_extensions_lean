# MAINTENANCE — amox-high-level

> [!NOTE]
> 来源记录与历史说明不代表当前 CI/发布结果或现行审批要求。当前自动合并与 OIDC 发布规则见[单仓维护者文档](https://github.com/gfgghgftgffg/amox_pi_extensions_lean/blob/main/docs/maintenance.md)。

## 来源与定位

`amox-high-level` 是基于 [z472421519/pi-high-level](https://github.com/z472421519/pi-high-level)（MIT 许可证）维护的独立衍生扩展，原始设计与基础实现归属 z472421519。在 `maintenance/manifest.json` 中标记为 `maintenanceMode: manual-fork`、`releaseVersioning: independent` 与 `toolContract: false`。

相对原版新增并维护以下能力：

- **四种触发模式** — `manual`（手动）、`auto`（字符或行数任一达标）、`minChars`（最小字符数）、`minLines`（最小行数）。
- **独立思考等级与输出预留** — 支持为总结请求单独配置推理等级，并在思考预算之上额外预留 `320` 个回答 token。
- **跨分支历史面板** — `/hl-history` 支持浏览当前会话所有分支的卡片（无卡片时同样打开空列表），支持跳回原回复与重新生成。
- **Starline 状态胶囊与原生回退** — 提供 `pi-starline` 可点击 `HL` 胶囊气泡菜单，并在未安装 `pi-starline` 时默认回退至 Pi 原生选择菜单。
- **内联 Prompt 与平滑迁移** — 支持在 JSON 配置中直接编辑内联模板，并自动将旧版 `auto.enabled` 迁移为 `mode`。

核心设计原则保持不变：**总结卡片仅用于会话内展示，绝不进入后续轮次的模型请求上下文。**

## 上游人工审查边界

本包采用人工按需审查模式，不参与每日自动移植或自动发布选择。手动跟进上游改动前，应先对比 manifest 中当前固定版本/revision 与目标源码，并严格守住以下兼容性契约：

- 保持 `/hl`、`/hl-status`、`/hl-history` 与 `/hl-settings` 命令面稳定。
- 保持 `~/.pi/agent/pi-high-level.json` 配置文件路径不变，兼容存量安装。
- 保持未安装 `pi-starline` 时可通过 `fallbackMenu: false` 关闭原生回退菜单的语义。
- 保持思考预算之外的回答 token 预留机制，防止推理开销截断正文输出。
- 严禁引入或修改任何 Pi 全局设置项。

## 验证命令

在当前子包目录运行：

```bash
npm run typecheck
npm test
```

或在单仓根目录运行全量类型与回归测试：

```bash
npm run check
```

由于本包不注册任何模型可见工具（`registeredTools: []`），因此不生成工具契约快照，也不参与工具字符代理统计，但仍纳入独立生产安装与发版归档完整性校验。
