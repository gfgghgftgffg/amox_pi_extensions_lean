# amox-pi-extensions-lean

`pi-web-access`、`rpiv-todo` 和 `pi-subagents` 的 lean 封装。缩短工具描述和 schema，合并同类工具，完整参数说明按需获取；实际执行仍调用上游代码。

按当前[工具快照](maintenance/tool-contracts.json)的字符数估算，三个扩展的工具上下文合计减少约 **94.4%**。这是字符代理统计，不是模型实际计费 token。

## 扩展

| 扩展 | 工具 | 用途 |
| --- | --- | --- |
| [pi-web-access-lean](packages/pi-web-access-lean/README.zh-CN.md) | `web_access` | 网页搜索、说法核实、页面和 PDF 抓取、结果分页 |
| [rpiv-todo-lean](packages/rpiv-todo-lean/README.zh-CN.md) | `todo` | 任务、依赖关系和进度管理 |
| [pi-subagents-lean](packages/pi-subagents-lean/README.zh-CN.md) | `subagent` | 启动子代理、获取结果、调整任务方向和运行 workflow |

各扩展独立安装。上游服务的凭据要求、外部依赖和使用限制仍适用，具体说明见各扩展 README。

## 安装

支持 macOS、Windows 和 Linux。需要 Pi `>=1.1.0`、Node `>=22.19.0`、npm 和 Git。

```bash
git clone https://github.com/gfgghgftgffg/amox_pi_extensions_lean.git
cd amox_pi_extensions_lean
```

按需执行对应命令，每条只安装一个扩展：

```bash
node scripts/install-extension.mjs pi-web-access-lean
node scripts/install-extension.mjs rpiv-todo-lean
node scripts/install-extension.mjs pi-subagents-lean
```

不需要在根目录运行 `npm ci`。升级时执行 `git pull --ff-only`，再运行对应的安装命令；固定版本可切换到已发布的 tag。

本项目不发布 npm 包，安装使用上述仓库脚本。

同一个扩展只保留一种安装来源，避免与上游或旧的 `@ssk_dev/*-lean` 重复注册。旧来源可通过 `pi list` 查找，再用 `pi remove <旧来源>` 移除。

## 自动维护

安装和使用扩展不需要配置 Actions。以下设置用于维护本仓库或 fork。

| Workflow | 触发条件 | 工作内容 |
| --- | --- | --- |
| Check upstream | 每天 02:23 UTC（北京时间 10:23），或手动运行 | 检查上游版本和原 lean 源码；有更新时调用 agent 适配、补测试和文档，经三平台验证后生成草稿 PR |
| CI | 推送 `main`、PR 更新、每天 04:17 UTC（北京时间 12:17），或手动运行 | 在 macOS、Windows、Linux 上执行测试、契约检查、独立安装验证和安全审计 |
| Release | `main` 的发布相关文件更新，或手动运行 | 包装版本增加或指定有效 tag 时，验证并发布三个独立 `.tgz` 包和哈希清单 |
| Dependabot Updates | 每周 | 检查开发依赖和 Actions 版本，提交依赖升级 PR |

没有上游更新时不调用模型；CI 和 Release 也不调用模型。

Release notes 复用适配 agent 的具体更新摘要，说明上游行为变化、lean 适配、修复和已知限制；版本、验证结果及安装信息由脚本补充。发布阶段不再调用模型。

### 配置

在仓库 `Settings → Actions → General` 启用 Actions，允许工作流创建 PR。默认 token 权限保持只读，所需写权限已在工作流中单独声明。PR 和 GitHub Release 使用内置 `GITHUB_TOKEN`。

在 `Settings → Secrets and variables → Actions` 添加：

| 类型 | 名称 | 内容 |
| --- | --- | --- |
| Secret | `MAINTENANCE_API_KEY` | 模型服务的 API key |
| Variable | `MAINTENANCE_PROVIDER` | Pi provider id，如 `openai`、`anthropic`；自定义服务可用 `gateway` |
| Variable | `MAINTENANCE_MODEL` | 服务支持的模型 ID |
| Variable | `MAINTENANCE_BASE_URL` | 自定义服务的 HTTPS API 基址，如 `https://api.example.com/v1`；内置 provider 留空 |
| Variable | `MAINTENANCE_API` | 自定义服务选 `openai-completions`、`openai-responses` 或 `anthropic-messages`；内置 provider 留空 |
| Variable | `MAINTENANCE_THINKING` | 默认 `high`；支持 `off`、`minimal`、`low`、`medium`、`high`、`xhigh`，非推理模型用 `off` |

API key 只放入 Secret，端点不可包含凭据或查询参数。模型调用按服务计费，单次适配最多 20 分钟、60 个 turn。

手动运行入口为 `Actions → Check upstream → Run workflow → main`。无更新时后续步骤跳过是正常结果。手动首次发布使用 `Release` 的 `tag` 输入，版本必须与根 `package.json`、三个包及 manifest 一致。

发布使用 `release` environment，可限制到 `main` 并配置审批。

实现约束、开发命令和故障诊断见[维护者文档](docs/maintenance.md)。

## 来源

基于 kunkun9527 的 [pi-web-access-lean](https://github.com/kunkun9527/pi-web-access-lean)、[rpiv-todo-lean](https://github.com/kunkun9527/rpiv-todo-lean) 和 [pi-subagents-lean](https://github.com/kunkun9527/pi-subagents-lean)，制作方法参考[原 lean 指南](https://github.com/kunkun9527/my-lean-pi-setup/blob/main/docs/make-your-own-lean.zh-CN.md)。上游以精确版本依赖引入，不复制实现或修改 `node_modules`。

许可证：[MIT](LICENSE)。
