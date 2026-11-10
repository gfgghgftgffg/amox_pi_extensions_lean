# amox-pi-extensions-lean

[English](README.md)

三个独立的 lean 包装扩展，以及独立的 `amox-pi-sync` 数据同步扩展。三个 lean 包缩短工具描述和 schema，保留上游执行能力，运行时随上游更新。按当前[工具快照](maintenance/tool-contracts.json)的字符数估算，三个 lean 包的工具上下文合计减少约 **93.5%**，不是实际计费 token；同步包不计入统计。

| 扩展 | 工具 | 用途 |
| --- | --- | --- |
| [pi-web-access-lean](packages/pi-web-access-lean/README.zh-CN.md) | `web_access` | 搜索、核实、网页和 PDF |
| [rpiv-todo-lean](packages/rpiv-todo-lean/README.zh-CN.md) | `todo` | 任务、依赖和进度 |
| [pi-subagents-lean](packages/pi-subagents-lean/README.zh-CN.md) | `subagent` | 子 Agent 和工作流 |
| [amox-pi-sync](packages/amox-pi-sync/README.zh-CN.md) | 无模型工具；`/sync-*` 命令 | 私有 SSH Git 原始数据同步、删除传播、孤儿会话清理、备份与诊断；可配置 sessions/missions |

## 安装

支持 Linux、macOS 和 Windows，需要 Pi `>=1.1.0`、Node `>=22.19.0` 和 npm；`amox-pi-sync` 还需要 Git 和可用的 SSH 认证。按需安装，不固定版本：

```bash
pi install npm:@gfgghgftgffg/pi-web-access-lean
pi install npm:@gfgghgftgffg/rpiv-todo-lean
pi install npm:@gfgghgftgffg/pi-subagents-lean
pi install npm:@gfgghgftgffg/amox-pi-sync
pi update --extensions
```

更新需手动执行，仓库发布不会在你的电脑上安排自动更新。`pi update --extensions` 更新 npm 来源，不更新本地目录。迁移时先备份 settings，通过 `pi list` 找到旧来源，仅用 `pi remove <old-source>` 移除对应项，再安装 npm 来源。重启 Pi，每个扩展只保留一种来源，不另行加载上游引擎。服务凭据和配置见各包 README。

需要从源码或固定 tag 安装时，使用 Git，按需执行各扩展的安装脚本；不需要根目录 `npm ci`：

```bash
git clone https://github.com/gfgghgftgffg/amox_pi_extensions_lean.git
cd amox_pi_extensions_lean
node scripts/install-extension.mjs pi-web-access-lean
node scripts/install-extension.mjs rpiv-todo-lean
node scripts/install-extension.mjs pi-subagents-lean
node scripts/install-extension.mjs amox-pi-sync
```

本地安装通过 `git pull --ff-only` 和对应安装脚本更新。新电脑可按 [amox-agent-bootstrap](https://github.com/gfgghgftgffg/amox-agent-bootstrap/blob/main/setup_for_pi.md) 部署。

## amox-pi-sync 特性

`amox-pi-sync` 通过私有 SSH Git 仓库传输原始 agent 数据。纳管路径可配置，默认是 `sessions` 和 `missions`。排除某个路径只停止后续传输，不会仅凭该设置删除已有快照副本。命令包括 `/sync-status`、`/sync-setup`、`/sync-push`、`/sync-pull`、`/sync-prune` 和 `/sync-settings`。安装 Starline 时，状态胶囊在对应的底栏 cell 上打开同样的操作气泡，并可选主题配色；没有 Starline 时使用 Pi 原生弹框和纯文本状态。

- **删除传播：** 每台设备用 `syncedPaths` 基线记录上次成功 Push/Pull 时的路径。Push 会从快照移除基线中本地已消失的路径；Pull 在恢复备份后应用远端删除，并把本地缺失的基线路径保留为待 Push 删除，因此先 Pull 也不会复活。从未同步的本地文件和尚未 Pull 的远端文件不会被删除。首次使用时基线由本地与快照路径的交集初始化；基线建立前已经发生的删除不会自动推断。
- **孤儿会话清理：** `Prune orphan sessions` / `/sync-prune [--yes]` 找出父会话不存在或父会话本身也被清理的子代理会话。父文件按 basename 不区分大小写比对，名字匹配 `type#8hex`，并级联到后代；最近 10 分钟修改过的文件和当前活跃会话会跳过；先预览条数、体积和前几条名称，先提交快照删除，再删本地文件；仓库有未提交修改时拒绝执行。**Prune before push**（默认 Off）会在手动、命令和自动 Push 前执行；清理失败只警告，不阻断 Push。
- **传输安全：** 网络 Git 操作超时 10 分钟，本地操作 60 秒。被终止或超时的进程一律视为失败，不记录成功。Pull 能快进则快进，否则执行干净的文件级合并；Push 会整合非快进远端历史并重试一次，不 rebase、不 force。
- **备份：** Pull 和恢复只备份本次会被替换或删除的本地文件；只新增文件的 Pull 不创建备份。手动 Create backup 仍是完整纳管数据快照。Cleanup 为手动操作，按完整备份目录计数。
- **平台与数据安全：** Windows 优先使用原生 OpenSSH；关闭 Git 换行转换，快照仓库使用 `* -text`，保留原始字节。会话可能包含秘密：请使用私有仓库，并阅读[包内安全限制](packages/amox-pi-sync/README.zh-CN.md#数据与安全)。

## 维护与部署

`amox-pi-sync` 是 `selective-fork`：每日比较上游正式发布源码，按文档取舍移植保留范围内有价值的改动，跳过舍弃功能；不能判断时通过 ntfy 请你决定。只有实际移植并验收通过才单独升版，不恢复全量上游 suite。每个包独立维护版本，根 private 包版本仅标识发布批次。安装 Starline 后可点击状态胶囊打开状态与操作菜单；没有 Starline 也可使用 `/sync-status`。功能与限制详见[包 README](packages/amox-pi-sync/README.zh-CN.md)。

安装和使用扩展不需要配置 Actions。每天 02:23 UTC（北京时间 10:23），systemd 新开独立 Pi SDK 会话，不使用 subagent。没有上游更新或已有未合并维护 PR 时不调用模型。适配和实际检查在临时副本中完成，不改个人安装或替换维护宿主。

固定主机只合并本次维护创建的 PR：精确 head 的 Linux、macOS、Windows 和 `all-platforms-pass` 成功，重新检查 PR/base/main 后，以 head SHA 为条件单次合并。Release 再独立验证合并 SHA 的三个平台，创建 GitHub Release，通过 OIDC 将已验证归档发布到 npm。CI 和 Release 不调用模型；Release notes 复用本地 Pi 的摘要。

可选的 [ntfy 通知](docs/local-scheduler.md#可选-ntfy-通知)覆盖成功、无更新、失败和超时。发布成功通知等待 Release/npm job 成功后再发送；通知失败不改变维护结果。

- [开发与维护策略](docs/maintenance.md)
- [Linux 维护主机部署](docs/local-scheduler.md)
- [发布配置、首次 npm 配置与恢复](docs/npm-publishing.zh-CN.md)

## 来源

基于 kunkun9527 的 [web](https://github.com/kunkun9527/pi-web-access-lean)、[todo](https://github.com/kunkun9527/rpiv-todo-lean)、[subagent](https://github.com/kunkun9527/pi-subagents-lean) 包装和 [lean 指南](https://github.com/kunkun9527/my-lean-pi-setup/blob/main/docs/make-your-own-lean.zh-CN.md)。上游实现以依赖引入，不复制源码。

`amox-pi-sync` 是基于 [MuratAitov/pi-sync](https://github.com/MuratAitov/pi-sync) 的独立 fork，来源为 MIT `pi-sync-suite@0.1.1`（ref：`npm:pi-sync-suite@0.1.1`），保留 Copyright (c) 2026 Murat。它不安装原 suite，请勿同时加载两者。同步内容可能含秘密，请使用私有 SSH 仓库，并阅读包文档中的安全限制。

许可证：[MIT](LICENSE)。
