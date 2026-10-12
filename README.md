# amox-pi-extensions-lean

三个 Pi 扩展的 lean 版本：`pi-web-access`、`rpiv-todo` 和 `pi-subagents`。按当前快照的字符数估算，工具提示词与 schema 的总上下文占用减少约 **94.4%**（非实际计费 token）。

基于 [kunkun9527 的 lean 指南](https://github.com/kunkun9527/my-lean-pi-setup/blob/main/docs/make-your-own-lean.zh-CN.md)和原作者的 lean 扩展简化：在上游扩展外包一层，精简工具描述与参数 schema，合并同类工具，完整说明按需获取；实际执行仍调用上游代码，不复制或修改上游实现。

本仓库每天[自动跟踪](docs/actions-setup.md)上述扩展的上游版本，生成更新候选并进行校验；更新经[人工确认](docs/maintenance.md)后合并发布，不自动合并或发布。

## 安装

需要 Pi `>=1.1.0`，一条命令安装全部三个扩展：

```bash
pi install git:github.com/gfgghgftgffg/amox_pi_extensions_lean@main
```

如需固定版本，将 `main` 换成已发布的 tag 或完整 commit。

请勿同时加载对应的上游扩展或旧的 `@ssk_dev/*-lean`，以免重复注册工具。
