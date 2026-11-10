# amox-pi-sync

[English](README.md)

通过私有 SSH Git 仓库同步 Pi agent 数据的独立扩展。包名：`@gfgghgftgffg/amox-pi-sync`。基于 [MuratAitov/pi-sync](https://github.com/MuratAitov/pi-sync) 的 `pi-sync-suite@0.1.1`（MIT；Copyright © 2026 Murat）。来源 ref 为 `npm:pi-sync-suite@0.1.1`，详见[MAINTENANCE.md](MAINTENANCE.md)。

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

## 命令

| 命令 | 用途 |
| --- | --- |
| `/sync-setup git@host:owner/private-repo.git [interval]` | 配置 SSH 仓库及可选拉取间隔（分钟），不传输数据 |
| `/sync-push` | Push 选中的原始 agent 数据 |
| `/sync-pull` | Pull 选中的原始 agent 数据 |
| `/sync-prune [--yes]` | 预览并删除孤儿子代理会话及其快照副本 |
| `/sync-settings` | 打开设置与维护操作 |
| `/sync-status` | 查看状态和操作；未安装 Starline 时也可使用 |

设置菜单保留 **View Status**、**Sync Mode**（`auto`、`manual`、`off`）、**Sync Paths**（包含/排除任意安全的 agent 数据相对路径）、**Prune before push**（默认 Off）、**Backups**（创建/列表/恢复）、**Diagnostics**（doctor/diff/log）和 **Cleanup**（Preview、Run、Delete Selected Backup、Retention）。默认路径为 `sessions` 和 `missions`。排除某个路径只停止后续传输，不会仅凭该设置删除已有快照副本。`manual` 和 `off` 模式仍可手动上传、拉取。

manual/off 启动不访问网络。auto 启动先计算本地 fingerprint，再启动定时器并发起后台拉取，不等待网络完成。`/sync-setup` 只保存配置并停止定时器；已启用 auto 时需 reload 激活。安装 Starline 时，优先点击状态胶囊打开详情，执行 Check status、Push、Pull、Prune orphan sessions 或 Settings。状态 key 保留为 `pi-sync`，兼容原 Starline placement；pill bridge 优先于旧 `extensionStatuses.commands`，无需修改 Starline 配置。没有三行 widget。点击胶囊时，气泡像 Model 一样锚定对应的 Starline cell；设置、子菜单及确认框沿用该锚点。`/sync-status` 使用最近点击的锚点，首次点击前回退居中。文本输入仍使用 Pi 输入框。设置中的 **Bubble colour** 默认 **Follow pill**（跟随胶囊），也可选择当前主题的 accent、success、warning 或 error 作为边框和选中项颜色；首次点击前使用主题 accent。可选配置 `bubbleColor` 保存为 `pill`、`accent`、`success`、`warning` 或 `error`，修改配色不触发传输。未安装 Starline 时隐藏此选项，由 Pi 渲染原生弹框。标签与值统一用冒号分隔（如 `Paths: 2 configured`，表示配置了 2 个同步路径），Starline 中的可选操作统一以 `•` 开头。标签、数值和异常使用 Pi 主题色区分，可选操作使用粗体并保留 Starline 自带的选中对比度。State 直接显示 Manual、Auto 或 Off；执行中显示 Push／Pull，另列当前模式，不追加 idle。未安装 Starline 时回退原生界面，状态输出保留纯文本。

## 数据与安全

> [!WARNING]
> 会话、missions 及其他选中文件可能包含秘密。请使用**私有 SSH 仓库**，检查同步路径，并保护远端和本地备份。私有 Git 不提供加密或秘密清除。

- 路径相对于 Pi agent 数据目录，不是当前项目。可包含/排除任意安全的数据相对路径；扩展不改写工作目录。
- 传输原始文件，不生成 Markdown/JSON 归档，不做语义化 JSONL 合并。并发编辑不是语义合并；自动三方合并按文件进行，双方修改同一文件时会中止。请协调多设备操作并查看诊断。
- 曾经同步过的文件被手动删除后，删除会传播：Push 从快照移除，Pull 会删除远端已移除的本地副本（删除前备份）。从未同步过的本地文件保留。每台设备用 `syncedPaths` 基线记录已同步路径，避免把“远端有、本机尚未 Pull”的文件误判为本地删除。首次启动时若没有基线，会从“本地和现有快照同时存在”的文件中初始化；本地独有和尚未 Pull 的远端文件不会进入基线。升级前已经发生的删除不会自动推断。同路径的不同内容以拉取数据为准，覆盖前备份；不得删除或覆盖活跃会话。恢复备份只处理当前纳管范围。
- **Prune orphan sessions**（操作项或 `/sync-prune`）扫描 `sessions/**/*.jsonl`，找出父会话不存在或父会话本身也被清理的子代理会话。父文件按 basename 不区分大小写比对，名字匹配 `type#8hex`；最近 10 分钟内修改过的文件和当前活跃会话会跳过；预览显示条数、体积和前几条名称；先提交快照删除，再删本地文件。仓库有暂存或未提交修改时拒绝执行，不删本地文件。`--yes` 跳过确认。**Prune before push** 会在手动、命令和自动 Push 前执行；清理失败只警告，不阻断 Push。
- 网络 Git 操作（`clone`、`fetch`、`pull`、`push`）超时为 10 分钟，本地 Git 操作为 60 秒。被超时或取消终止的进程一律视为失败，即使 Pi 返回 exit code 0，也不会写入完成时间。能快进时 Pull 直接快进，否则在快照仓库中执行干净的三方合并；冲突会中止合并且不应用任何文件。Push 被非快进拒绝时会 fetch、在不 rebase、不 force 的前提下整合远端历史，并重试一次；Push 整合的文件在下一次 Pull 时应用。
- Git 操作强制 `core.autocrlf=false`、`core.eol=lf`，快照仓库使用本地 `* -text` 属性，避免 Git 转换原始字节。已有 CRLF/LF 混合历史不会被自动改写；统一换行需要显式的手动迁移和 repack。Windows 优先使用原生 OpenSSH（`System32/OpenSSH/ssh.exe`），支持中文用户目录；不存在时及其他平台使用 `ssh`。保留非交互模式、连接超时及主机密钥验证，不复用自定义 `core.sshCommand`。
- 备份位于 agent 数据目录下的 `amox-pi-sync-backups`。Pull 和恢复只备份本次会被替换或删除的本地文件，并在清单中记录；只新增文件的 Pull 不创建备份。手动 **Create backup** 仍是完整纳管数据快照。Cleanup 仅在手动预览/确认后删除本地备份，按完整备份目录计数，不按单个文件计数。默认数量上限 20 份、最长 180 天；超龄或超量的备份纳入清理候选，不自动删除，不清理 sessions 或 missions。
- 新设置文件为 `amox-pi-sync.json`；不存在时可读取旧 `pi-sync-suite.json` 迁移。保存新设置前不改旧文件，保存时写入新文件。迁移使用独立的 `amox-pi-sync-repo` 目录，不复用旧快照。

不包含原版的配置同步/settings 合并、Markdown/JSON 归档、Environment Tools 和 Local Packages。环境部署和机器专属配置交给 `amox-agent-bootstrap` 等部署流程，阅读版导出使用 Pi 原生 `/export`；同步器保留原始数据选择、备份恢复和手动备份清理。各项原因与后续维护边界见[功能取舍](MAINTENANCE.md#功能取舍与维护边界)。这是选择性跟进上游的独立 fork，不是调用原版运行时的包装，也不是原版全功能替代品。每日审查上游正式发布，仅移植保留范围内有价值的改动；舍弃功能跳过，不能判断时由 ntfy 请维护者决定，不自动恢复原版模块。
