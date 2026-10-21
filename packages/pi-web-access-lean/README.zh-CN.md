# @gfgghgftgffg/pi-web-access-lean

隶属于 [`amox-pi-extensions-lean`](https://github.com/gfgghgftgffg/amox_pi_extensions_lean/blob/main/README.zh-CN.md) 单仓。基于
[`pi-web-access`](https://github.com/nicobailon/pi-web-access) 的精简封装：完整保留上游检索与抓取引擎，
将四个对模型可见的工具合并为一个 `web_access` 工具。

原 lean 封装作者 [kunkun9527](https://github.com/kunkun9527/pi-web-access-lean)，上游引擎作者
[Nico Bailon](https://github.com/nicobailon/pi-web-access)。两者均为 MIT 协议，本包保留原始 `LICENSE`。

## 核心特性

* 完整上游能力：网页搜索、结果翻页续取、事实与来源核验、网页抓取、GitHub/YouTube/PDF 提取、Provider
  路由、Curator、已存结果检索全部沿用上游实现。
* 单一工具入口：上游 `web_search`、`source_check`、`fetch_content`、`get_search_content` 被捕获后由
  `web_access` 路由，不会重复注册。
* 本地 PDF 直读：`op: "fetch"` 支持 Unix/Windows 路径与 `file:///`，提取 Markdown 并返回页数与字符数。
* 高级参数按需展开：`help` 返回当前上游完整描述与参数 Schema。
* 工具列表全程不变：丢弃上游 `web_enable` 加载器，并拦截上游的 `setActiveTools` 调用。

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

批量或高级参数请将 JSON 对象序列化为 `input` 字符串传入；仅在不清楚字段时调用 `help`。
DeepSeek 搜索使用高级 JSON，例如：

```json
{ "op": "search", "input": "{\"query\":\"Pi extensions\",\"provider\":\"deepseek\"}" }
```

在 `web-search.json` 设置 `deepseekApiKey`，或设置 `DEEPSEEK_API_KEY`。DeepSeek 按成功搜索计费，
需要显式选择（包括配置路由）；`auto` 与 `all` 不会使用它。域名与时间过滤表达式也计入 128 字符查询限制。
设置 `includeContent: true` 时，DeepSeek 返回的页面正文会保存供 `op: "get"` 读取，不再重复抓取已覆盖页面。
`help` 的 `search` 或 `check` 会列出当前 Provider 选项，包括 Linkup。在高级 JSON 中选择
`"provider":"linkup"`，并设置 `linkupApiKey` 或 `LINKUP_API_KEY`。Linkup 消耗账号额度，
`auto`/`all` 不包含它；`web-search.json` 的 `linkupDepth` 可选 `flash`、`fast`（默认）、`standard` 或 `deep`。

配置的默认 Provider 数组全部失败且每项错误均匹配 `fallbackOn` 时，可回退到尚未尝试的
`searchRouting.providers`；单次调用显式传入的 Provider 数组不回退。
xAI 网关可配置绝对 HTTP(S) 地址 `xaiResponsesUrl`，并设置 `xaiApiKey` 或 `XAI_API_KEY`；
自定义端点仅使用该 key，不使用 Pi 的 xAI 登录凭据。`xaiSearchTimeoutMs` 默认 60,000，
接受正整数并封顶 600,000。

即使上游设置 `toolExposure: "deferred"`，门面 `web_access` 仍直接可用；此配置不会延迟门面加载。
上游仍拒绝将其与 `toolActivation: "eager"` 组合。页面回答与搜索摘要在宿主支持时使用 registry 的
`streamSimple` 路径，支持虚拟模型。Windows 的 `!command` 凭据源优先使用 Git Bash 或 PATH 中的
`bash.exe`，缺失时回退默认命令 shell。Gemini 的 `geminiAuth: "adc"` 在未显式配置且不存在 ADC 文件时
可使用 GCE 附加服务账号；`GCE_METADATA_HOST` 可覆盖元数据主机，`METADATA_SERVER_DETECTION=none`
可禁用检测。

## 抓取配置

readable 抓取在已提取有效文本时接受完整的短静态 HTML 页面；运行脚本的页面仍可能被判为不完整，
并继续尝试配置的其它 Provider。启用 DeepSeek Fetch 托管回退时，在现有 `fetchRouting.providers`
加入 `"deepseek"`，设置 `fetchRouting.allowRemoteHostedProviders: true`，并使用搜索的同一个
DeepSeek key。目标 URL 会发送给 DeepSeek。默认抓取顺序不包含它，同源重定向限制开启时不可用。

在 `web-search.json` 设置 `fetchContent.userAgent` 可指定直接 HTTP 页面抓取的 User-Agent：

```json
{ "fetchContent": { "userAgent": "My Reader/1.0" } }
```

未设或 null 保留 `OpenAI File Downloader, XaiImageApiFetch/1.0`。字符串会 trim；空白、非字符串、
非 ASCII 或 CR/LF 会在远端请求及 Provider 回退前报错。这是配置项，不是工具参数。显式配置在
`localhost`、`127.0.0.0/8` 或 `::1` 的 SearXNG 不必全局放行 `ssrf.allowRanges`；
豁免不允许跳转到其它本地 origin，也不允许普通页面 fetch 访问本地服务。

按需限制同源重定向时，将高级 JSON 放入 `input`：

```json
{ "op": "fetch", "input": "{\"url\":\"https://example.com/page\",\"redirects\":\"same-origin\"}" }
```

也可在 `web-search.json` 设置 `fetchContent.redirects: "same-origin"`。每次重定向必须保持原始
URL 的协议、主机名和有效端口；拒绝时不返回页面正文，也不尝试 Provider 回退。启用后，无法观察
重定向链的路径（托管提取、Jina、GitHub、YouTube）不可用。默认没有这项限制；`help` 的 `fetch`
会说明这个高级参数。

页面字面正文保持原样。上游提示保留原工具名：将 `get_search_content({ ... })` 换为 `web_access`
的 `op: "get"`，同一参数对象序列化进 `input`；search/fetch 提示分别使用 `op: "search"` 或 `"fetch"`。

## 上下文占用（字符代理）

<!-- amox-measurement:start -->
| Package | Version | Registered character proxy |
| --- | --- | ---: |
| @gfgghgftgffg/pi-web-access-lean | 0.1.7 | 149 |
| pi-web-access | 0.43.0 | 2768 |

Fixed ceil(characters / 4), not provider billing tokens.
<!-- amox-measurement:end -->

## 版本

* 包装层：`0.1.7`
* 上游运行时：锁定 `pi-web-access@0.42.0`（精确版本）
* 已测试 Pi 宿主：`1.1.0`；Node `22.22.1`

## 开发

在仓库根目录运行：`npm ci`、`npm run check`、`npm run contracts:check`。

## 维护说明

适配点、上游元数据、升级历史、源码审查决定与限制见 [MAINTENANCE.md](MAINTENANCE.md)。
README 只说明当前用法，不记录逐次发布过程。

## 协议与致谢

MIT。本项目封装 MIT 协议的 [`pi-web-access`](https://github.com/nicobailon/pi-web-access)；上游代码以固定
npm 依赖方式使用，未复制进本仓库。
