# amox-pi-extensions-lean

[English](README.md)

三个独立的 lean 包装扩展：缩短工具描述和 schema，执行仍调用精确版本的上游依赖。按当前[工具快照](maintenance/tool-contracts.json)的字符数估算，工具上下文合计减少约 **94.5%**，不是实际计费 token。

| 扩展 | 工具 | 用途 |
| --- | --- | --- |
| [pi-web-access-lean](packages/pi-web-access-lean/README.zh-CN.md) | `web_access` | 搜索、核实、网页和 PDF |
| [rpiv-todo-lean](packages/rpiv-todo-lean/README.zh-CN.md) | `todo` | 任务、依赖和进度 |
| [pi-subagents-lean](packages/pi-subagents-lean/README.zh-CN.md) | `subagent` | 子 Agent 和工作流 |

## 安装

支持 Linux、macOS 和 Windows，需要 Pi `>=1.1.0`、Node `>=22.19.0` 和 npm。三个 npm 包均公开，按需安装，不固定版本：

```bash
pi install npm:@gfgghgftgffg/pi-web-access-lean
pi install npm:@gfgghgftgffg/rpiv-todo-lean
pi install npm:@gfgghgftgffg/pi-subagents-lean
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
```

本地安装通过 `git pull --ff-only` 和对应安装脚本更新。新电脑可按 [amox-agent-bootstrap](https://github.com/gfgghgftgffg/amox-agent-bootstrap/blob/main/setup_for_pi.md) 部署。

## 维护与部署

安装和使用扩展不需要配置 Actions。每天 02:23 UTC（北京时间 10:23），systemd 新开独立 Pi SDK 会话，不使用 subagent。没有上游更新或已有未合并维护 PR 时不调用模型。适配和实际检查在临时副本中完成，不改个人安装或替换维护宿主。

固定主机只合并本次维护创建的 PR：精确 head 的 Linux、macOS、Windows 和 `all-platforms-pass` 成功，重新检查 PR/base/main 后，以 head SHA 为条件单次合并。Release 再独立验证合并 SHA 的三个平台，创建 GitHub Release，通过 OIDC 将已验证归档发布到 npm。CI 和 Release 不调用模型；Release notes 复用本地 Pi 的摘要。

- [开发与维护策略](docs/maintenance.md)
- [Linux 维护主机部署](docs/local-scheduler.md)
- [发布配置、首次 npm 配置与恢复](docs/npm-publishing.zh-CN.md)

## 来源

基于 kunkun9527 的 [web](https://github.com/kunkun9527/pi-web-access-lean)、[todo](https://github.com/kunkun9527/rpiv-todo-lean)、[subagent](https://github.com/kunkun9527/pi-subagents-lean) 包装和 [lean 指南](https://github.com/kunkun9527/my-lean-pi-setup/blob/main/docs/make-your-own-lean.zh-CN.md)。上游实现以依赖引入，不复制源码。

许可证：[MIT](LICENSE)。
