# amox-pi-extensions-lean

[English](README.md)

五个可独立安装的 Pi 扩展，涵盖搜索、任务管理、子 Agent、持久目标和数据同步。lean 包精简工具描述和 schema，保留上游执行能力。按当前[工具快照](maintenance/tool-contracts.json)的字符数估算，四个 lean 包已注册的工具文本合计减少约 **82.6%**；同步包不计入统计。

| 扩展 | 工具 | 用途 |
| --- | --- | --- |
| [pi-web-access-lean](packages/pi-web-access-lean/README.zh-CN.md) | `web_access` | 搜索、核实、网页和 PDF |
| [rpiv-todo-lean](packages/rpiv-todo-lean/README.zh-CN.md) | `todo` | 任务、依赖和进度 |
| [pi-subagents-lean](packages/pi-subagents-lean/README.zh-CN.md) | `subagent` | 子 Agent 和工作流 |
| [pi-goal-x-lean](packages/pi-goal-x-lean/README.zh-CN.md) | 原 goal 工具 | 持久目标、自动续跑和完成审计 |
| [amox-pi-sync](packages/amox-pi-sync/README.zh-CN.md) | 无模型工具；`/sync-*` 命令 | 私有 SSH Git 原始数据同步、删除传播、孤儿会话清理、备份与诊断；可配置 sessions/missions |

对 subagents 和 goal-x 做了轻微适配，使两者兼容联用，具体见[适配说明](packages/pi-goal-x-lean/MAINTENANCE.md#subagents-and-workflow-integration-boundaries)。

## 安装

支持 Linux、macOS 和 Windows，需要 Pi `>=1.1.0`、Node `>=22.19.0` 和 npm；`pi-goal-x-lean` 需要 Pi `>=1.4.0 <2.0.0`，`amox-pi-sync` 还需要 Git 和可用的 SSH 认证。按需安装，不固定版本：

```bash
pi install npm:@gfgghgftgffg/pi-web-access-lean
pi install npm:@gfgghgftgffg/rpiv-todo-lean
pi install npm:@gfgghgftgffg/pi-subagents-lean
pi install npm:@gfgghgftgffg/pi-goal-x-lean
pi install npm:@gfgghgftgffg/amox-pi-sync
pi update --extensions
```

服务凭据和配置见各包 README。

需要从源码或固定 tag 安装时，使用 Git，按需执行各扩展的安装脚本；不需要根目录 `npm ci`：

```bash
git clone https://github.com/gfgghgftgffg/amox_pi_extensions_lean.git
cd amox_pi_extensions_lean
node scripts/install-extension.mjs pi-web-access-lean
node scripts/install-extension.mjs rpiv-todo-lean
node scripts/install-extension.mjs pi-subagents-lean
node scripts/install-extension.mjs pi-goal-x-lean
node scripts/install-extension.mjs amox-pi-sync
```

goal 可单独使用；联用 subagents 时安装或更新两个 npm 包。详见 [goal README](packages/pi-goal-x-lean/README.zh-CN.md)。

本地安装通过 `git pull --ff-only` 和对应安装脚本更新。新电脑可按 [amox-agent-bootstrap](https://github.com/gfgghgftgffg/amox-agent-bootstrap/blob/main/setup_for_pi.md) 部署。

## 开发文档

- [开发与维护策略](docs/maintenance.md)
- [维护主机部署](docs/local-scheduler.md)
- [npm 发布配置](docs/npm-publishing.zh-CN.md)

## 来源

基于 kunkun9527 的 [web](https://github.com/kunkun9527/pi-web-access-lean)、[todo](https://github.com/kunkun9527/rpiv-todo-lean)、[subagent](https://github.com/kunkun9527/pi-subagents-lean) 包装和 [lean 指南](https://github.com/kunkun9527/my-lean-pi-setup/blob/main/docs/make-your-own-lean.zh-CN.md)。上游实现以依赖引入，不复制源码。

`pi-goal-x-lean` 是本仓库原创门面，以精确依赖复用 [tmonk/pi-goal-x](https://github.com/tmonk/pi-goal-x) 运行时。

`amox-pi-sync` 是基于 [MuratAitov/pi-sync](https://github.com/MuratAitov/pi-sync) 的独立 fork，来源为 MIT `pi-sync-suite@0.1.1`（ref：`npm:pi-sync-suite@0.1.1`），保留 Copyright (c) 2026 Murat。它不安装原 suite，请勿同时加载两者。同步内容可能含秘密，请使用私有 SSH 仓库，并阅读包文档中的安全限制。

许可证：[MIT](LICENSE)。
