# amox-pi-sync

[English](README.md)

## 优点

通过私有 Git 仓库同步 Pi session，路径可自选。`/delete-session` 删除当前会话及其后代，`/sync-prune` 清理孤儿子代理会话，并把删除同步出去。

## 功能

- 默认路径是 `sessions` 和 `missions`，也可以增减其它 agent 数据路径。文件原样传输，不导出 Markdown，不做 JSONL 合并。双方改了同一文件就停止。
- `/delete-session` 默认预览当前会话及其后代树，切换到新会话后删除选中的文件及快照副本。包括最近修改、改过名的后代和手动 fork，不处理无关孤儿。
- `/sync-prune` 找出父会话已经不在的子代理会话及其后代，先预览，再把这次删除同步出去。除非打开开关，否则不会在 Push 前自动执行。
- Pull 只备份即将被替换或删除的文件。
- 装了 [Starline](https://github.com/Andy8647/pi-starline) 可从状态胶囊操作；没装时同样的动作留在 `/sync-*`。

## 来源

`@gfgghgftgffg/amox-pi-sync` 是 [MuratAitov/pi-sync](https://github.com/MuratAitov/pi-sync) 的选择性 fork，基于 MIT `pi-sync-suite@0.1.1`（Copyright © 2026 Murat）。来源 ref 为 `npm:pi-sync-suite@0.1.1`。传输用 SSH Git。详见 [MAINTENANCE.md](MAINTENANCE.md)。

## 使用方法

先指向一个私有 SSH Git 仓库。这一步不传文件：

```text
/sync-setup git@host:owner/private-repo.git
```

把本地 session 发出去，再把远端 session 拉回来：

```text
/sync-push
/sync-pull
```

删除当前会话及其全部后代。默认弹出确认框；在 `/sync-settings` 关闭 **Confirm session deletion** 后可直接删除。需要先配置同步，并将 `sessions` 纳入同步路径：

```text
/delete-session
```

命令先切换到新会话再删除。执行前请关闭其它正在使用这些会话的 Pi 进程。快照删除先提交到本地仓库；manual/off 模式下用 `/sync-push` 发布，auto 模式沿用自动同步。Git 历史、备份和 `/tmp` 文件不清理。执行前发现新增后代时停止删除，不扩展本次扫描选定的删除范围。

先预览孤儿子代理会话，确认后再删除并同步这次删除：

```text
/sync-prune
/sync-prune --yes
```

没装 [Starline](https://github.com/Andy8647/pi-starline) 时，`/sync-status` 也能打开这些操作。`/sync-settings` 用来改路径，以及是否在 Push 前自动清理孤儿会话。

## 安装

需要 Pi `>=1.1.0`、Node `>=22.19.0`、npm、Git 和可用的 SSH 认证。

在本仓库目录执行：

```sh
node scripts/install-extension.mjs amox-pi-sync
```

只安装本扩展。不要同时加载原版 `pi-sync-suite`；通过 `pi list` 检查已有来源，自行移除旧来源。若首次 npm 发布尚未完成，使用上述本地安装方式。npm 包可用后可使用：

```sh
pi install npm:@gfgghgftgffg/amox-pi-sync
pi update --extensions
```

## 代理配置

SSH Git 需要走 HTTP 代理时，在现有 agent 数据目录的 `amox-pi-sync.json` 中添加 `"proxy": "http://127.0.0.1:7897"`，然后 reload Pi。移除该字段恢复直连。扩展通过 HTTP CONNECT 转发 SSH，不修改全局 Git、SSH 或系统代理设置，SSH 认证和主机密钥校验保持开启。仅支持 `http://` 代理地址，不接受用户名密码、额外 URL 路径、查询参数或 fragment；代理必须允许 CONNECT 到你的 SSH 服务器及其端口。

删除确认偏好也保存在此文件中：`"confirmSessionDelete": false` 表示不弹确认框，省略则默认开启。在菜单切换此项只保存本地配置，不触发同步。

## 细节

- 每台设备用 `syncedPaths` 基线记录上次成功 Push 或 Pull 时的路径。Push 会从快照移除基线中本地已消失的路径。Pull 在备份后应用远端删除，并把本地缺失的基线路径保留为待 Push 删除，所以先 Pull 也不会把它们复活。从未同步的本地文件，以及还没 Pull 的远端文件，不会被删除。首次基线是本地路径和快照路径的交集；基线建立前的删除不会自动推断。
- 定向删除递归跟随父子关系，不依赖名称，也不受十分钟限制。与孤儿清理共用跨设备 basename 匹配和重名歧义保护。旧 runtime 关闭完成后才删除，新扩展实例先执行删除再启动自动 Pull。删除失败会暂停自动同步；排除错误后重新启用同步或 reload。
- 孤儿清理按父文件 basename 不区分大小写比对，接受 `type#8hex` 这种名字，并级联到后代。最近 10 分钟改过的文件和当前活跃会话会跳过。先预览条数、体积和名称，先提交快照删除，再删本地文件。仓库有未提交修改时拒绝执行。Push 前清理默认关闭。清理失败只警告，不阻断 Push。
- 网络 Git 操作超时 10 分钟，本地 Git 操作超时 60 秒。被超时或取消终止的进程算失败，即使 Pi 返回 exit code 0。Pull 能快进就快进，否则做干净的三方合并。Push 被非快进拒绝时会 fetch，不 rebase、不 force，整合远端历史并重试一次。
- Pull 和恢复只备份本次会被替换或删除的本地文件。只新增文件的 Pull 不创建备份。手动创建备份仍是完整的纳管数据快照。
- Windows 在可用时优先使用原生 OpenSSH（`System32/OpenSSH/ssh.exe`）。Git 强制 `core.autocrlf=false` 和 `core.eol=lf`，快照仓库使用本地 `* -text` 属性。已有的混合换行不会被改写。

## 设置与界面

- 设置菜单包含 **View Status**、**Sync Mode**（`auto`、`manual`、`off`）、**Sync Paths**（包含/排除任意安全的 agent 数据相对路径）、**Prune before push**（默认 Off）、**Confirm session deletion**（默认 On）、**Backups**（创建/列表/恢复）、**Diagnostics**（doctor/diff/log）和 **Cleanup**（Preview、Run、Delete Selected Backup、Retention）。排除某个路径只停止后续传输，不会仅凭该设置删除已有快照副本。
- manual/off 启动不访问网络。auto 启动先计算本地 fingerprint，再启动定时器并发起后台拉取，不等待网络完成。`/sync-setup` 只保存配置并停止定时器；已启用 auto 时需 reload 激活。
- 安装 [Starline](https://github.com/Andy8647/pi-starline) 时，可点击状态胶囊打开详情和操作。状态 key 保留为 `pi-sync`，兼容原 placement；pill bridge 优先于旧 `extensionStatuses.commands`。没有三行 widget。
- 点击胶囊时，气泡像 Model 一样锚定对应的 Starline cell；设置、子菜单及确认框沿用该锚点。`/sync-status` 使用最近点击的锚点，首次点击前回退居中。文本输入仍使用 Pi 输入框。
- **Bubble colour** 默认 **Follow pill**（跟随胶囊），也可选择当前主题的 accent、success、warning 或 error 作为边框和选中项颜色；首次点击前使用主题 accent。可选配置 `bubbleColor` 保存为 `pill`、`accent`、`success`、`warning` 或 `error`，修改配色不触发传输。未安装 Starline 时隐藏此选项，由 Pi 渲染原生弹框。
- 标签与值统一用冒号分隔（如 `Paths: 2 configured`，表示配置了 2 个同步路径），Starline 中的可选操作统一以 `•` 开头。标签、数值和异常使用 Pi 主题色区分，可选操作使用粗体并保留 Starline 自带的选中对比度。删除完成后 State 恢复 Manual、Auto 或 Off，不残留 Delete session；已完成动作只显示在 Last action。传输执行中显示 Push／Pull，另列当前模式，不追加 idle。RPC 和未安装 Starline 时保留纯文本。

## 数据与安全

> [!WARNING]
> 会话、missions 及其他选中文件可能包含秘密。请使用**私有 SSH 仓库**，检查同步路径，并保护远端和本地备份。私有 Git 不提供加密或秘密清除。

- 路径相对于 Pi agent 数据目录，不是当前项目。可包含/排除任意安全的数据相对路径；扩展不改写工作目录。
- 并发编辑不是语义合并，请协调多设备操作并查看诊断。同路径的不同内容以拉取数据为准，覆盖前备份；不得删除或覆盖活跃会话。恢复备份只处理当前纳管范围。
- 备份位于 agent 数据目录下的 `amox-pi-sync-backups`。Cleanup 仅在手动预览/确认后删除本地备份，按完整备份目录计数，不按单个文件计数。默认数量上限 20 份、最长 180 天；超龄或超量的备份纳入清理候选，不自动删除，不清理 sessions 或 missions。
- 新设置文件为 `amox-pi-sync.json`；不存在时可读取旧 `pi-sync-suite.json` 迁移。保存新设置前不改旧文件，保存时写入新文件。迁移使用独立的 `amox-pi-sync-repo` 目录，不复用旧快照。

不包含原版的配置同步/settings 合并、Markdown/JSON 归档、Environment Tools 和 Local Packages。环境部署和机器专属配置交给 `amox-agent-bootstrap` 等部署流程，阅读版导出使用 Pi 原生 `/export`；同步器保留原始数据选择、备份恢复和手动备份清理。各项原因与后续维护边界见[功能取舍](MAINTENANCE.md#功能取舍与维护边界)。这是选择性跟进上游的独立 fork，不是调用原版运行时的包装，也不是原版全功能替代品。每日审查上游正式发布，仅移植保留范围内有价值的改动；舍弃功能跳过，不能判断时由 ntfy 请维护者决定，不自动恢复原版模块。
