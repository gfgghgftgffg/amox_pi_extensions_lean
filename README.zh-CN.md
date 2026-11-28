# amox-pi-extensions-lean

[![CI](https://img.shields.io/github/actions/workflow/status/gfgghgftgffg/amox_pi_extensions_lean/test.yml?branch=main&style=flat-square&label=CI)](https://github.com/gfgghgftgffg/amox_pi_extensions_lean/actions/workflows/test.yml)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22.19.0-3c873a?style=flat-square)](https://nodejs.org)
[![Pi](https://img.shields.io/badge/Pi-%3E%3D1.1.0-4f46e5?style=flat-square)](https://npmjs.com/package/@earendil-works/pi-coding-agent)
[![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](LICENSE)

**低上下文开销、可按需独立安装的 Pi 编程助手扩展集。**

[English](README.md) • [扩展一览](#扩展一览) • [安装指南](#安装指南) • [开发文档](#开发文档) • [来源与致谢](#来源与致谢)

四个 lean 包精简了工具声明，注册的工具契约总开销减少了 **83.9%**（按字符代理 `ceil(字符数 / 4)` 计算，包含所有已注册声明以及 Pi 未对模型展示的部分）。具体数据可参考[工具契约快照](maintenance/tool-contracts.json)。

## 核心特性

- **极低首轮开销** — 常驻声明仅保留高频参数，低频配置收敛至按需 `help` 查询与 JSON `input` 透传。
- **原汁原味的上游执行** — lean 门面以精确 npm 依赖引入上游引擎，不复制业务源码，完整保留上游校验与渲染体验。
- **完全独立解耦** — 六个扩展在 Linux、macOS、Windows 上独立发版、按需安装、互不绑架。
- **跨扩展协同体验** — 针对性适配让 `pi-goal-x-lean` 与 `pi-subagents-lean` 在父子会话隔离及后台任务等待上无缝配合，并在当前会话拥有活跃 Goal 时自动收起 `rpiv-todo-lean` 面板；边界说明见[协同适配文档](packages/pi-goal-x-lean/MAINTENANCE.md#subagents-and-workflow-integration-boundaries)。

## 扩展一览

| 扩展包 | 交互入口 | 核心用途 | 宿主要求 |
| --- | --- | --- | --- |
| [pi-web-access-lean](packages/pi-web-access-lean/README.zh-CN.md) | `web_access` 工具 | 联网搜索、事实核验、网页抓取、结果续取与本地 PDF 提取 | Pi `>=1.1.0` |
| [rpiv-todo-lean](packages/rpiv-todo-lean/README.zh-CN.md) | `todo` 工具 + `/todos` | 会话级任务列表、依赖关系、批量创建与可折叠终端进度面板 | Pi `>=1.1.0` |
| [pi-subagents-lean](packages/pi-subagents-lean/README.zh-CN.md) | `subagent` 工具 | 前后台子 Agent 派发、中途引导、结果查询与脚本化工作流 | Pi `>=1.1.0` |
| [pi-goal-x-lean](packages/pi-goal-x-lean/README.zh-CN.md) | `get_goal` + `goal` 工具、`/goal*` | 持久目标规划、里程碑追踪、自动续跑与完成审计 | Pi `>=1.7.0 <2.0.0` |
| [amox-pi-sync](packages/amox-pi-sync/README.zh-CN.md) | `/sync-*`、`/delete-session`（无模型工具） | 私有 SSH Git 原始数据同步、删除传播、会话树定向删除、孤儿清理、备份与诊断 | Pi `>=1.1.0`、Git + SSH |
| [amox-high-level](packages/amox-high-level/README.zh-CN.md) | `/hl*`、`+hl`（无模型工具） | 不污染后续上下文的只读高层总结卡片，支持多触发模式、独立思考预算、历史回看与 Starline 菜单 | Pi `>=1.6.0` |

## 安装指南

全系列支持 Linux、macOS 与 Windows，需 Node.js `>=22.19.0` 和 npm。直接通过 npm 按需安装所需扩展（无需锁定版本号）：

```bash
pi install npm:@gfgghgftgffg/pi-web-access-lean
pi install npm:@gfgghgftgffg/rpiv-todo-lean
pi install npm:@gfgghgftgffg/pi-subagents-lean
pi install npm:@gfgghgftgffg/pi-goal-x-lean
pi install npm:@gfgghgftgffg/amox-pi-sync
pi install npm:@gfgghgftgffg/amox-high-level
```

后续统一升级已安装的扩展：

```bash
pi update --extensions
```

> [!TIP]
> `pi-goal-x-lean` 可单独使用；若需与 `pi-subagents-lean` 联动，请同时安装或更新这两个 npm 包，详见 [pi-goal-x-lean 文档](packages/pi-goal-x-lean/README.zh-CN.md)。外部搜索凭据与扩展专属配置请参阅各子包 README；全新机器初始化可参考 [amox-agent-bootstrap](https://github.com/gfgghgftgffg/amox-agent-bootstrap/blob/main/setup_for_pi.md)。

### 从源码或指定版本 Tag 安装

如需从本地源码安装，或回退到某个扩展的精确发布版本（每个包拥有独立的 `<包名>@<版本>` tag，例如先执行 `git checkout '@gfgghgftgffg/pi-goal-x-lean@0.1.4'`），克隆仓库后仅运行目标扩展的安装脚本即可，无需在仓库根目录执行 `npm ci`：

```bash
git clone https://github.com/gfgghgftgffg/amox_pi_extensions_lean.git
cd amox_pi_extensions_lean

node scripts/install-extension.mjs pi-web-access-lean
node scripts/install-extension.mjs rpiv-todo-lean
node scripts/install-extension.mjs pi-subagents-lean
node scripts/install-extension.mjs pi-goal-x-lean
node scripts/install-extension.mjs amox-pi-sync
node scripts/install-extension.mjs amox-high-level
```

本地源码安装的扩展后续可通过 `git pull --ff-only` 拉取更新，再重新执行对应的安装脚本。

## 开发文档

- [开发检查与维护策略](docs/maintenance.md)
- [Linux 维护主机部署与运行](docs/local-scheduler.md)
- [npm OIDC 发布配置与故障恢复](docs/npm-publishing.zh-CN.md)

## 来源与致谢

### 上游架构与分支关系

- **Lean 门面（`web`、`todo`、`subagent`）** — 基于 kunkun9527 的 [pi-web-access-lean](https://github.com/kunkun9527/pi-web-access-lean)、[rpiv-todo-lean](https://github.com/kunkun9527/rpiv-todo-lean)、[pi-subagents-lean](https://github.com/kunkun9527/pi-subagents-lean) 与 [Lean 改造指南](https://github.com/kunkun9527/my-lean-pi-setup/blob/main/docs/make-your-own-lean.zh-CN.md) 持续维护；上游引擎均以精确依赖引入，不复制源码。
- **`pi-goal-x-lean`** — 本仓库针对 [tmonk/pi-goal-x](https://github.com/tmonk/pi-goal-x) 编写的原创精简门面，以精确依赖复用上游运行时。
- **`amox-pi-sync`** — 基于 [MuratAitov/pi-sync](https://github.com/MuratAitov/pi-sync)（MIT `pi-sync-suite@0.1.1`，ref `npm:pi-sync-suite@0.1.1`，保留 Copyright (c) 2026 Murat）维护的独立选择性 fork；不依赖原版 `pi-sync-suite`，请勿同时加载两者。
- **`amox-high-level`** — 基于 [z472421519/pi-high-level](https://github.com/z472421519/pi-high-level) 维护的衍生版本，保留原始 MIT 版权与设计归属。

> [!WARNING]
> `amox-pi-sync` 同步的会话、任务与自定义数据可能包含密钥或敏感项目内容。请务必使用**私有 SSH Git 仓库**，并在启用前阅读包内 README 的数据安全说明。

### 贡献者

- **gfgghgftgffg** — 单仓维护、独立打包与跨扩展协同适配
- **z472421519** — `pi-high-level` 原始设计与实现
- **kunkun9527** — 初始 lean 封装与设计指南
- **MuratAitov** — 原始 `pi-sync` 作者
- **tmonk** — 原始 `pi-goal-x` 作者
- **tintinweb** — 原始 `pi-subagents` 作者
- **juicesharp** — 原始 `rpiv-todo` 作者
- **nicobailon** — 原始 `pi-web-access` 作者

本项目基于 [MIT](LICENSE) 许可证开源。
