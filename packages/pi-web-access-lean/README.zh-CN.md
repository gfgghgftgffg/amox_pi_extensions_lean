# @gfgghgftgffg/pi-web-access-lean

隶属于 [`amox-pi-extensions-lean`](https://github.com/gfgghgftgffg/amox_pi_extensions_lean/blob/main/README.zh-CN.md) 单仓。基于
[`pi-web-access`](https://github.com/nicobailon/pi-web-access) 的精简封装：完整保留上游检索与抓取引擎，
将四个对模型可见的工具合并为一个 `web_access` 工具。运行时随上游更新。

原 lean 封装作者 [kunkun9527](https://github.com/kunkun9527/pi-web-access-lean)，上游引擎作者
[Nico Bailon](https://github.com/nicobailon/pi-web-access)。两者均为 MIT 协议，本包保留原始 `LICENSE`。

## 核心特性

* 将上游搜索、核验、抓取和已存结果工具路由到 `web_access`，不重复注册。
* 本地 PDF 直读支持 Unix/Windows 路径和 `file:///`，返回 Markdown、页数与字符数。
* 高级参数按需展开：`help` 返回已安装上游的完整描述与 Schema。

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

## 使用方法

| `op` | 说明 | `input` |
| --- | --- | --- |
| `search` | 网页搜索 | 查询字符串 |
| `check` | 事实或来源核验 | 待核验内容 |
| `fetch` | 抓取 URL 或本地 PDF | URL 或本地 PDF 路径 |
| `get` | 续取已缓存结果 | Response ID |
| `help` | 查看上游完整参数 | 操作名 |

```json
{ "op": "search", "input": "Pi coding agent extensions" }
```

显式传入 `op` 和字符串 `input`；批量或高级参数须序列化为 JSON 对象字符串，例如：

```json
{ "op": "fetch", "input": "{\"url\":\"https://example.com/page\",\"redirects\":\"same-origin\"}" }
```

不清楚参数时，用 `help` 并将 `input` 设为对应操作名，读取已安装运行时的完整描述与 Schema。
上游结果中的工具提示需换成对应的 `web_access` 操作；页面正文不改写。

## 配置与限制

Provider、凭据、搜索路由和抓取选项沿用上游的 `web-search.json`，通常位于 `~/.pi/agent/`；
配置路径、环境变量、支持的服务和计费规则见[上游文档](https://github.com/nicobailon/pi-web-access#configuration)。
外部服务可能接收查询和页面内容并产生费用，使用前检查对应服务的配置。

本地 PDF 直读仅提取 Markdown，不支持上游结构化 `extract` 模式；远端 PDF 由上游处理。
`web_access` 始终直接注册，上游的动态工具加载设置不会延迟或移除这个入口。

## 上下文占用（字符代理）

<!-- amox-measurement:start -->
| Package | Registered character proxy |
| --- | ---: |
| @gfgghgftgffg/pi-web-access-lean | 149 |
| pi-web-access | 1110 |

Fixed ceil(characters / 4), not provider billing tokens.
<!-- amox-measurement:end -->

## 开发

[开发检查与维护策略](https://github.com/gfgghgftgffg/amox_pi_extensions_lean/blob/main/docs/maintenance.md)；适配细节见 [MAINTENANCE.md](MAINTENANCE.md)。
