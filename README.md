# amox-pi-extensions-lean

三个 Pi 扩展的 lean 版本：`pi-web-access`、`rpiv-todo` 和 `pi-subagents`。按此前已接受快照的字符数估算，工具提示词与 schema 的总上下文占用减少约 **94.4%**（非实际计费 token）。本次候选固定 subagents 0.21.0、todo/i18n 2.13.8，web-access 保持 0.39.0；新的字符统计与测试结果由独立验证任务生成，审查记录见 [maintenance/agent-review.md](maintenance/agent-review.md)。

基于 [kunkun9527 的 lean 指南](https://github.com/kunkun9527/my-lean-pi-setup/blob/main/docs/make-your-own-lean.zh-CN.md)和原作者的 lean 扩展：精简工具描述与 schema，合并同类工具，完整说明按需获取；实际执行仍调用上游代码，不复制或修改上游实现。

配置模型凭据后，GitHub Actions 每天检查上游，由 agent 按原指南审查并做最小适配，再在 macOS、Windows、Linux 上独立测试、测量并生成 PR。你审查合并后自动发布，**不自动合并**。配置见 [Actions 设置](docs/actions-setup.md)，流程与失败处理见 [维护说明](docs/maintenance.md)。

## 分开安装

macOS、Windows、Linux 使用相同的安装命令。需要 Pi `>=1.1.0`、Node `>=22.19.0`、npm 和 Git。先下载一次仓库：

```bash
git clone https://github.com/gfgghgftgffg/amox_pi_extensions_lean.git
cd amox_pi_extensions_lean
```

**只执行你需要的那一条**，每个扩展独立安装，不会加载另外两个：

```bash
node scripts/install-extension.mjs pi-web-access-lean
node scripts/install-extension.mjs rpiv-todo-lean
node scripts/install-extension.mjs pi-subagents-lean
```

不需要在仓库根目录运行 `npm ci`。升级时先 `git pull --ff-only`，再重跑所需扩展的安装命令。固定版本可先切换到已发布的 tag。

如果维护者已启用 npm 发布且对应包已发布，也可直接分别安装：

```bash
pi install npm:@gfgghgftgffg/pi-web-access-lean
pi install npm:@gfgghgftgffg/rpiv-todo-lean
pi install npm:@gfgghgftgffg/pi-subagents-lean
```

若之前装过整个仓库，先用 `pi list` 找到旧 Git 来源并 `pi remove <旧来源>`。同一个扩展请只选一种安装方式，也不要同时加载其上游或旧的 `@ssk_dev/*-lean`，以免重复注册工具。
