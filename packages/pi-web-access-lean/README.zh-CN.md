# @gfgghgftgffg/pi-web-access-lean

[English](README.md)

## 优点

为 [`pi-web-access`](https://github.com/nicobailon/pi-web-access) 提供更轻量的封装。搜索、核验、抓取和续取收成一个 `web_access`，首轮就要带上的工具注册文本大约少 87%。

## 功能

- 一个工具覆盖 `search`、`check`、`fetch`、`get` 和 `help`。执行仍走上游引擎，不把上游那几个工具再注册一遍。
- 本地 PDF 路径和 `file:///` 返回已保存的 Markdown 及路径。元数据含 Markdown 字符数，引擎提供时也含页数。这条路径只提取 Markdown，不是上游的结构化 extract。
- 冷门参数留在 `help` 里，包括允许的搜索 Provider。调用时把它们写成 JSON 对象字符串放进 `input`；显式 Provider 选择沿用上游配置。
- 远端图片和视频帧问答走上游 answer 模式，需要支持图片输入的模型。回复包含文字回答；续取存储结果返回原始来源内容。

## 来源

门面来自 [kunkun9527/pi-web-access-lean](https://github.com/kunkun9527/pi-web-access-lean)。引擎是 [Nico Bailon 的 pi-web-access](https://github.com/nicobailon/pi-web-access)。本包跟随上游发布，不复制引擎。两者都是 MIT，本包保留原始 `LICENSE`。它属于 [amox-pi-extensions-lean](https://github.com/gfgghgftgffg/amox_pi_extensions_lean/blob/main/README.zh-CN.md)。

## 使用方法

调用 `web_access` 时显式传入 `op`，并将搜索词、待核验的说法、URL、本地 PDF 路径或响应 ID 放入 `input`。

搜索：

```json
{ "op": "search", "input": "Pi coding agent extensions" }
```

核验一句话：

```json
{ "op": "check", "input": "The paper was published in 2024" }
```

抓取网页或本地 PDF：

```json
{ "op": "fetch", "input": "https://example.com/page" }
```

续取上次的结果。`input` 填之前返回的 response id：

```json
{ "op": "get", "input": "response-id" }
```

查看某个操作的全部参数：

```json
{ "op": "help", "input": "fetch" }
```

更多字段写进 `input` 字符串里的 JSON：

```json
{ "op": "fetch", "input": "{\"url\":\"https://example.com/page\",\"redirects\":\"same-origin\"}" }
```

如果结果提示调用 `get_search_content`，请用返回的响应 ID 调用 `web_access` 的 `op: "get"`。其他续取字段放在 `input` 的 JSON 字符串里。页面正文不改写。

## 安装

这是公开的 npm 包，安装时不固定版本：

```bash
pi install npm:@gfgghgftgffg/pi-web-access-lean
pi update --extensions
```

需要 Git 回退安装时，在仓库 checkout 根目录执行：

```bash
node scripts/install-extension.mjs pi-web-access-lean
```

本地 Git 安装通过拉取 checkout 并重跑安装脚本更新，`pi update` 不更新本地内容。只保留一种安装来源。迁移时先备份 settings，移除 `pi list` 显示的精确旧来源，再安装 npm 来源。

请勿与其它 `pi-web-access` 包装扩展同时加载，以防重复注册工具。

## 配置与限制

Provider、凭据、搜索路由和抓取选项沿用上游的 `web-search.json`，通常位于 `~/.pi/agent/`；
配置路径、环境变量、支持的服务和计费规则见[上游文档](https://github.com/nicobailon/pi-web-access#configuration)。
外部服务可能接收查询和页面内容并产生费用，使用前检查对应服务的配置。
代理策略（包括可选 `lockProxy`）沿用上游；省略调用中的 `proxy` 以使用配置的路由。

本地 PDF 直读仅提取 Markdown，不支持上游结构化 `extract` 模式；远端 PDF 由上游处理。
`web_access` 始终直接注册，上游的动态工具加载设置不会延迟或移除这个入口。

## 注册工具文本（字符代理）

<!-- amox-measurement:start -->
| 包 | 全部注册工具（字符代理） |
| --- | ---: |
| @gfgghgftgffg/pi-web-access-lean | 149 |
| pi-web-access | 1110 |

统计全部已注册工具声明；固定按 `ceil(字符数 / 4)` 估算，不是服务商计费 token。
<!-- amox-measurement:end -->

## 开发

[开发检查与维护策略](https://github.com/gfgghgftgffg/amox_pi_extensions_lean/blob/main/docs/maintenance.md)；适配细节见 [MAINTENANCE.md](MAINTENANCE.md)。
