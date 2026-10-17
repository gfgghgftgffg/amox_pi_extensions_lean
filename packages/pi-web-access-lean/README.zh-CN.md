# @gfgghgftgffg/pi-web-access-lean

隶属于 [`amox-pi-extensions-lean`](../../README.md) 单仓。基于
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

从仓库根目录只安装本扩展（先按根 README 克隆仓库）：

```bash
node scripts/install-extension.mjs pi-web-access-lean
```

已发布到 npm 后，也可用 `pi install npm:@gfgghgftgffg/pi-web-access-lean`。两种方式只选一种。

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

## 本次审查：0.40.0 → 0.41.0

在 `web-search.json` 设置 `fetchContent.userAgent` 可指定直接 HTTP 页面抓取的 User-Agent：

```json
{ "fetchContent": { "userAgent": "My Reader/1.0" } }
```

未设或 null 保留 `OpenAI File Downloader, XaiImageApiFetch/1.0`。合法字符串会 trim；空白、非字符串、
非 ASCII 或 CR/LF 会在远端请求及 Provider 回退前报错。这是配置项，不是工具参数，常驻 Schema 与
操作 help 无需扩充。配置在 `localhost`、`127.0.0.0/8` 或 `::1` 的 SearXNG 现在不必全局放行
`ssrf.allowRanges`；豁免不允许跳转到其它本地 origin，也不允许普通页面 fetch 访问本地服务。
新增真实门面回归使用离线 DNS/fetch mock 覆盖这些行为。

另已逐项审查 lean 作者更新：argument hook 和 subagents typebox 修复本仓已有；未采用全量结果文本
正则重写或 RPC todo Plan 快照，具体理由见各包 MAINTENANCE。上游输出提示保留原工具名：将
`get_search_content({ ... })` 换为 `web_access` 的 `op: "get"`，同一参数对象序列化进 `input`；
search/fetch 提示分别使用 `op: "search"`／`"fetch"`。页面字面正文保持原样。

## 历史审查：0.39.0 → 0.40.0

按需限制重定向时，将高级 JSON 放入 `input`：

```json
{ "op": "fetch", "input": "{\"url\":\"https://example.com/page\",\"redirects\":\"same-origin\"}" }
```

`help` 的 `fetch` 会展示新参数，精简 Schema 仍只有 `op` 与 `input`。
也可在 `web-search.json` 设置 `fetchContent.redirects: "same-origin"`。
每次重定向都必须保持原始 URL 的协议、主机名和有效端口；拒绝时不返回页面正文，也不尝试
Provider 回退。启用策略后，无法观察重定向链的提取路径（包括托管提取、Jina、GitHub、YouTube）
不可用。默认未启用该策略。

上游还修复了带缩略图的视频文字回答、Gemini 视频上传经配置网关发送，以及存储内容分页的 Unicode
边界（摘录边缘的半个字符用替代字符表示）。lean 入口无需改动。新增离线门面回归覆盖 help、JSON
透传、跨源拒绝、同源成功和非法参数；真实网关／视频 Provider 不在该测试范围内。

## 最新 lean 作者审查

已审查作者 `ae54d0d` → `c2beefc`：完整入口和包元数据一致，中英文基准文档仅将 Pi 1.2.0
改为 1.3.0，估算数值未变。无工具、参数、默认值或运行行为变化；引擎仍锁定 0.41.0。
本仓字符代理由候选 check 重新统计，这不代表已验证 Pi 1.3 兼容性。
精确源码证据和保留的适配决定见 [MAINTENANCE.md](MAINTENANCE.md)。

## 上下文占用（字符代理）

<!-- amox-measurement:start -->
| Package | Version | Registered character proxy |
| --- | --- | ---: |
| @gfgghgftgffg/pi-web-access-lean | 0.1.4 | 149 |
| pi-web-access | 0.41.0 | 2739 |

Fixed ceil(characters / 4), not provider billing tokens.
<!-- amox-measurement:end -->

## 版本

* 包装层：`0.1.4`
* 上游运行时：锁定 `pi-web-access@0.41.0`（精确版本）
* 已测试 Pi 宿主：`1.1.0`；Node `22.22.1`

## 开发

在仓库根目录运行：`npm ci`、`npm run check`、`npm run contracts:check`。

## 维护说明

适配点、上游元数据、升级步骤与限制见 [MAINTENANCE.md](MAINTENANCE.md)。

## 协议与致谢

MIT。本项目封装 MIT 协议的 [`pi-web-access`](https://github.com/nicobailon/pi-web-access)；上游代码以固定
npm 依赖方式使用，未复制进本仓库。
