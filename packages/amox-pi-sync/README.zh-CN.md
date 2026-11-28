# @gfgghgftgffg/amox-pi-sync

[![npm](https://img.shields.io/npm/v/@gfgghgftgffg/amox-pi-sync?style=flat-square)](https://www.npmjs.com/package/@gfgghgftgffg/amox-pi-sync)
[![Pi](https://img.shields.io/badge/Pi-%3E%3D1.1.0-4f46e5?style=flat-square)](https://npmjs.com/package/@earendil-works/pi-coding-agent)
[![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](LICENSE)

**基于私有 SSH Git 仓库的 Pi 原始数据同步扩展——支持路径自选、跨设备删除传播、当前会话树定向清理与孤儿子会话回收。**

[English](README.md)

专注于跨设备原样传输与恢复 Pi 会话数据，不注册任何模型工具，不改写 JSONL 内容，也不合并机器专属配置文件。

## 核心特性

- **原样字节级同步** — 默认同步 `sessions` 与 `missions`，支持按需增删其他安全的 agent 数据相对路径；文件原样传输，不做 Markdown 转换或 JSONL 语义合并，双端同文件冲突时立即安全中止供人工核查。
- **跨设备删除传播** — 基于每台设备独立的 `syncedPaths` 基线追踪已同步路径，精准传播本地或远端的删除操作，绝不误删从未同步的本地文件或尚未拉取的远端文件。
- **`/delete-session` 会话树定向删除** — 默认预览当前会话及其递归后代树（涵盖最近修改、重命名及手动 fork 的子会话），自动切换至全新会话后一并移除本地文件与快照副本，不触碰无关孤儿会话。
- **`/sync-prune` 孤儿子会话清理** — 自动识别父会话已不存在的 `type#8hex` 子代理会话及其后代，支持条数与体积预览并将清理结果同步至快照仓库（默认手动执行，可按需开启 Push 前自动清理）。
- **按需增量备份与 Starline 胶囊菜单** — Pull 与恢复操作仅备份即将被覆盖或删除的本地文件；安装 [Starline](https://github.com/Andy8647/pi-starline) 时提供状态栏胶囊气泡交互，未安装时通过 `/sync-*` 命令提供同等完整操作。

## 安装

需要 Pi `>=1.1.0`、Node.js `>=22.19.0`、npm、Git 以及可用的 SSH 认证。

推荐直接从 npm 安装（无需锁定版本号）：

```sh
pi install npm:@gfgghgftgffg/amox-pi-sync
pi update --extensions
```

如需从单仓本地 checkout 安装（或首次 npm 发布尚未完成时回退使用），在仓库根目录执行：

```sh
node scripts/install-extension.mjs amox-pi-sync
```

> [!IMPORTANT]
> 该脚本仅安装本独立扩展。请勿与原版 `pi-sync-suite` 同时加载；启用前请通过 `pi list` 检查已有来源并手动移除旧扩展。

## 使用方法

**1. 绑定私有 SSH Git 仓库（仅保存配置，不立即传输文件）：**

```text
/sync-setup git@host:owner/private-repo.git
```

GitHub 仓库请使用 `git@github.com:OWNER/REPO.git` 格式。网络连通性、代理与 SSH 密钥均由系统、Git 和 SSH 自身配置负责。

**2. 推送本地数据与拉取远端更新：**

```text
/sync-push
/sync-pull
```

**3. 定向删除当前会话及其全部后代：**

```text
/delete-session
```

需先完成同步配置且将 `sessions` 纳入纳管路径。默认弹出确认框（可在 `/sync-settings` 中关闭 **Confirm session deletion** 跳过确认）。执行前请先关闭其他正在读写这些会话的 Pi 进程：命令会切换至全新会话，等待旧 runtime 收尾关闭后，先在本地快照仓库提交删除再移除本地文件（`manual`/`off` 模式下需执行 `/sync-push` 推送远端，`auto` 模式由后台循环自动同步）。Git 历史、备份目录与 `/tmp` 文件不受影响；若执行前检测到扫描后新增的后代，将立即中止以避免扩大删除范围。

**4. 预览并清理孤儿子代理会话：**

```text
/sync-prune
/sync-prune --yes
```

**5. 状态面板、设置与残留锁恢复：**

- `/sync-status` — 查看当前状态并打开操作菜单（未安装 [Starline](https://github.com/Andy8647/pi-starline) 时同样可用）。
- `/sync-settings` — 配置同步模式、纳管路径、Push 前清理开关、备份、诊断与备份清理。
- `/sync-unlock` — 当同步进程被强制终止导致锁文件残留，使 Push、Pull、Prune 或 `/delete-session` 停止时，手动检查并在原记录 PID 已退出的前提下安全清理残留锁（`manual`、`auto`、`off` 下的后续写操作也会自动执行相同检查；绝不清理仍存活或格式损坏的锁，也不会仅凭锁文件时间较久就强行接管）。

## 同步机制与可靠性细节

- **`syncedPaths` 基线传播** — 每台设备记录上次成功 Push 或 Pull 时的纳管路径集合。Push 仅从快照移除基线中本地已消失的文件；Pull 在备份后执行远端删除，同时将本地已删的基线路径保留为待 Push 删除项，避免“先 Pull 后 Push”把已删文件复活。首次运行以本地与现有快照的交集初始化基线，不回溯推断基线建立前的删除。
- **定向删除与孤儿清理边界** — `/delete-session` 递归追踪父子会话链，不受文件名格式与 10 分钟修改时间限制，与孤儿清理共用跨平台大小写无关 basename 匹配及重名歧义保护；新实例在自动 Pull 启动前优先完成删除，若删除报错则自动暂停后台同步，待排障后重新启用或执行 `/reload`。`/sync-prune` 仅匹配父文件缺失的 `type#8hex` 会话并级联后代，跳过最近 10 分钟内修改的文件与当前活跃会话，遇到未提交改动的脏仓库拒绝执行，遵循“先提交快照删除、再删本地文件”；可选的 Push 前清理失败仅发出警告，不阻断正常 Push。
- **Git 超时与非快进处理** — 远端网络 Git 操作超时为 10 分钟，本地 Git 命令超时为 60 秒；因超时或取消终止的子进程即使宿主返回退出码 `0` 也严格记为失败。Pull 优先快进（fast-forward），否则执行干净的三方合并；Push 遇非快进拒绝时自动 fetch、在不 rebase 且不 force 的前提下整合历史并重试一次。
- **按需备份与跨平台换行保护** — Pull 与恢复仅备份本次将被覆盖或删除的本地文件（纯新增文件的 Pull 不生成备份；手动执行 **Create backup** 仍保存完整纳管快照）。Windows 环境优先调用系统原生 OpenSSH（`System32/OpenSSH/ssh.exe`）；Git 命令固定 `core.autocrlf=false` 与 `core.eol=lf`，并在快照仓库写入本地 `* -text` 属性，不自动改写历史混合换行。

## 设置项与 Starline 界面

- **设置菜单结构** — 包含 **View Status**、**Sync Mode**（`auto`、`manual`、`off`）、**Sync Paths**（增删安全的 agent 数据相对路径；排除某路径仅停止后续传输，不会自动删除快照中已有的副本）、**Prune before push**（默认 Off）、**Confirm session deletion**（默认 On，对应 `amox-pi-sync.json` 中的 `confirmSessionDelete`）、**Backups**（创建/列表/恢复）、**Diagnostics**（doctor/diff/log）与 **Cleanup**（Preview、Run、Delete Selected Backup、Retention）。
- **启动网络边界** — `manual` 与 `off` 启动阶段零网络请求；`auto` 启动先计算本地指纹，随后启动定时器并异步发起后台拉取，不阻塞界面。`/sync-setup` 仅保存配置并停止定时器，若开启 `auto` 需执行 `/reload` 激活。
- **Starline 胶囊与气泡锚定** — 安装 [Starline](https://github.com/Andy8647/pi-starline) 时，点击状态栏胶囊（保留 `pi-sync` 状态键以兼容既有布局，pill bridge 优先于旧 `extensionStatuses.commands`，无常驻三行 widget）可展开锚定在对应单元格的气泡菜单，设置、子菜单与确认框均沿用该锚点（`/sync-status` 复用最近一次点击锚点，首次点击前居中展示；文本输入仍调用 Pi 原生输入框）。
- **主题配色与状态文案** — **Bubble colour**（配置字段 `bubbleColor`）默认 **Follow pill**（`pill`，首次点击前使用主题 `accent`），也可切换为当前主题的 `accent`、`success`、`warning` 或 `error` 边框与选中色，切换配色不触发网络传输；未安装 Starline 时自动隐藏该项并回退至 Pi 原生菜单。信息行统一采用冒号键值格式（如 `Paths: 2 configured`），Starline 可执行操作统一以粗体 `•` 开头并保留 Starline 原生选中对比度。传输中显示 `Push` / `Pull` 并单独列出当前模式（不拼接 `idle`）；会话删除完成后 State 恢复显示 `Manual`、`Auto` 或 `Off`，已完成动作归入 `Last action`。RPC 与无 Starline 环境保持纯文本输出。

## 数据安全与职责边界

> [!WARNING]
> 会话记录、`missions` 及其他选定路径可能包含 API 密钥、访问令牌或敏感业务代码。请务必使用**私有 SSH Git 仓库**，审慎检查纳入的同步路径，并妥善保护远端仓库与本地备份目录。私有 Git 仓库本身不提供端到端加密或敏感信息脱敏。

- **路径与并发安全** — 所有路径均相对于 Pi agent 数据目录解析，绝不修改当前项目工作目录。多设备并发修改同一文件不做 JSONL 语义合并，拉取不同内容前先自动备份再覆盖，且严禁覆盖或删除当前活跃会话；恢复备份仅作用于当前纳管路径。
- **本地备份清理策略** — 备份存放于 agent 数据目录下的 `amox-pi-sync-backups`。**Cleanup** 仅在手动预览并确认后按“完整备份目录”粒度清理本地备份（默认将超过 20 份或早于 180 天的完整备份列为候选），绝不自动删除，也绝不清理 `sessions` 或 `missions`。
- **配置文件与平滑迁移** — 配置保存在 `amox-pi-sync.json`；若尚不存在，可无损读取旧版 `pi-sync-suite.json` 完成迁移（保存新配置前不改动旧文件，保存后写入新文件，并使用独立的 `amox-pi-sync-repo` 快照目录，不复用旧版仓库目录）。

## 来源与维护说明

`@gfgghgftgffg/amox-pi-sync` 是基于 [MuratAitov/pi-sync](https://github.com/MuratAitov/pi-sync) 维护的独立选择性 fork，基线源自 MIT 协议的 `pi-sync-suite@0.1.1`（Copyright © 2026 Murat，来源 ref：`npm:pi-sync-suite@0.1.1`）。

本包有意移除上游的配置同步/settings 合并、Markdown/JSON 聊天归档、Environment Tools 与 Local Packages：环境初始化与机器差异配置交由 `amox-agent-bootstrap` 等部署工具管理，可读归档导出交由 Pi 原生 `/export` 处理。日常维护持续跟踪上游正式 npm 发布，仅定向移植保留功能范围内的有价值改进，跳过已裁剪模块，遇到取舍存疑的变更通过 ntfy 交由维护者拍板，绝不自动恢复已移除模块。详细设计取舍与维护边界见 [MAINTENANCE.md](MAINTENANCE.md)（参见[功能取舍与维护边界](MAINTENANCE.md#功能取舍与维护边界)）。
