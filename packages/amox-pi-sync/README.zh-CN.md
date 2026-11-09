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
| `/sync-settings` | 打开设置与维护操作 |
| `/sync-status` | 查看状态和操作；未安装 Starline 时也可使用 |

设置菜单保留 **View Status**、**Sync Mode**（`auto`、`manual`、`off`）、**Sync Paths**（包含/排除任意安全的 agent 数据相对路径）、**Backups**（创建/列表/恢复）、**Diagnostics**（doctor/diff/log）和 **Cleanup**（Preview、Run、Delete Selected Backup、Retention）。默认路径为 `sessions` 和 `missions`。`manual` 和 `off` 模式仍可手动上传、拉取。

manual/off 启动不访问网络。auto 启动先计算本地 fingerprint，再启动定时器并发起后台拉取，不等待网络完成。`/sync-setup` 只保存配置并停止定时器；已启用 auto 时需 reload 激活。安装 Starline 时，优先点击状态胶囊打开详情，执行 Check status、Push、Pull 或 Settings。状态 key 保留为 `pi-sync`，兼容原 Starline placement；pill bridge 优先于旧 `extensionStatuses.commands`，无需修改 Starline 配置。没有三行 widget。`/sync-status`、点击胶囊、设置和子菜单统一使用底栏上方居中的 Starline 气泡，确认操作也使用相同样式；文本输入仍使用 Pi 输入框。标签、数值和异常使用 Pi 主题色区分，可选操作使用粗体并保留 Starline 自带的选中对比度。State 直接显示 Manual、Auto 或 Off；执行中显示 Push／Pull，另列当前模式，不追加 idle。未安装 Starline 时回退原生界面，状态输出保留纯文本。

## 数据与安全

> [!WARNING]
> 会话、missions 及其他选中文件可能包含秘密。请使用**私有 SSH 仓库**，检查同步路径，并保护远端和本地备份。私有 Git 不提供加密或秘密清除。

- 路径相对于 Pi agent 数据目录，不是当前项目。可包含/排除任意安全的数据相对路径；扩展不改写工作目录。
- 传输原始文件，不生成 Markdown/JSON 归档，不合并 JSONL。并发编辑不是语义合并；请协调多设备操作并查看诊断。
- 保留本地独有文件，不传播删除；同路径的不同内容以拉取数据为准，覆盖前备份；不得覆盖活跃会话。恢复备份只处理当前纳管范围。
- Git 操作关闭自动换行转换，避免 Windows 的 `core.autocrlf` 改写原始会话。SSH 使用系统 `ssh` 的非交互模式及连接超时，不复用自定义 `core.sshCommand`。
- 备份位于 agent 数据目录下的 `amox-pi-sync-backups`。Cleanup 仅在手动预览/确认后删除本地备份，按完整备份目录计数，不按单个文件计数。默认数量上限 20 份、最长 180 天；超龄或超出最新 20 份的备份纳入清理候选，不自动删除，不清理 sessions 或 missions。
- 新设置文件为 `amox-pi-sync.json`；不存在时可读取旧 `pi-sync-suite.json` 迁移。保存新设置前不改旧文件，保存时写入新文件。迁移使用独立的 `amox-pi-sync-repo` 目录，不复用旧快照。

不包含原版的配置同步/settings 合并、Markdown/JSON 归档、Environment Tools 和 Local Packages。环境部署和机器专属配置交给 `amox-agent-bootstrap` 等部署流程，阅读版导出使用 Pi 原生 `/export`；同步器保留原始数据选择、备份恢复和手动备份清理。各项原因与后续维护边界见[功能取舍](MAINTENANCE.md#功能取舍与维护边界)。这是选择性跟进上游的独立 fork，不是调用原版运行时的包装，也不是原版全功能替代品。每日审查上游正式发布，仅移植保留范围内有价值的改动；舍弃功能跳过，不能判断时由 ntfy 请维护者决定，不自动恢复原版模块。
