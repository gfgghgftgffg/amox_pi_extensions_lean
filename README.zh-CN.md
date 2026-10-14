# amox-pi-extensions-lean

[English](README.md)

`pi-web-access`、`rpiv-todo` 和 `pi-subagents` 的 lean 封装。缩短工具描述和 schema，合并同类工具，完整参数说明按需获取；实际执行仍调用上游代码。

按当前[工具快照](maintenance/tool-contracts.json)的字符数估算，三个扩展的工具上下文合计减少约 **94.5%**。这是字符代理统计，不是模型实际计费 token。

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

安装和使用扩展不需要配置 Actions。维护入口在本机：每天 02:23 UTC（北京时间 10:23），systemd 启动一次性 Pi，在临时工作副本内检查上游、适配、实际跑检查，并根据报错修复同一份候选。没有上游更新或已有待审维护 PR 时不调用模型。

日常任务的源码与配置：
- [维护入口](scripts/local-maintenance.mjs) · [独立 Pi SDK 会话](scripts/lib/local-pi.mjs)
- [每日更新 prompt（原作者维护段原文）](maintenance/daily-update.md)
- [systemd service](scripts/systemd/amox-pi-actions.service) · [每日 timer](scripts/systemd/amox-pi-actions.timer)

这是独立 Pi 会话，不是 subagent；维护会话不加载被维护的扩展（它们只在独立检查沙箱加载），也不更新当前个人安装。

本地检查通过后创建草稿 PR，再由普通 CI 在 Linux、macOS、Windows 独立验收；人工审查合并版本升级后才进入 Release。Pi 不直接推 main、不自动合并，发布凭据与执行候选代码的环境隔离。部署和故障处理见[本机每日维护](docs/local-scheduler.md)。

GitHub 只保留两个工作流：

| Workflow | 触发条件 | 工作内容 |
| --- | --- | --- |
| CI | 推送 `main`、PR 更新，或手动运行 | 三平台测试、契约检查、独立安装验证和安全审计 |
| Release | `main` 的发布相关文件更新，或手动运行 | 统一包装版本增加或指定有效 tag 时，三平台验证并发布三个独立 `.tgz` 和哈希清单 |

CI 和 Release 不调用模型，也没有 GitHub cron。模型配置与 GitHub/SSH 凭据保存在维护主机，不需要维护模型 Actions Secrets/Variables。Release notes 复用本地 Pi 的具体更新摘要，发布阶段不再调用模型。

首次或重试发布可手动运行 Release，`tag` 必须与根 package.json、三个包和 manifest 的版本一致。发布使用 `release` environment，可限制到 `main` 并配置审批。

开发 SDK 和 Action SHA 由维护者单独更新；安全审计保留。开发命令与人工审查要求见[维护者文档](docs/maintenance.md)。

## 来源

基于 kunkun9527 的 [pi-web-access-lean](https://github.com/kunkun9527/pi-web-access-lean)、[rpiv-todo-lean](https://github.com/kunkun9527/rpiv-todo-lean) 和 [pi-subagents-lean](https://github.com/kunkun9527/pi-subagents-lean)，制作方法参考[原 lean 指南](https://github.com/kunkun9527/my-lean-pi-setup/blob/main/docs/make-your-own-lean.zh-CN.md)。上游以精确版本依赖引入，不复制实现或修改 `node_modules`。

许可证：[MIT](LICENSE)。
