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

## 上下文占用（字符代理）

由 [`scripts/capture-contracts.mjs`](../../scripts/capture-contracts.mjs) 在隔离的 Pi 1.1.0 print 模式会话中测量
（原始数据见 [`maintenance/tool-contracts.json`](../../maintenance/tool-contracts.json)）。估算方式为固定字符代理
`ceil(字符数 / 4)`，**不是** 模型 tokenizer 计费值。

| 版本 | 注册工具 | 注册合计 | 绑定时激活 |
| --- | --- | ---: | ---: |
| Lean `@gfgghgftgffg/pi-web-access-lean@0.1.0` | `web_access` | **149** | **149** |
| 上游 `pi-web-access@0.39.0` | `web_search` 901 + `source_check` 607 + `fetch_content` 706 + `get_search_content` 389（另有 `web_enable` 66） | **2,669** | **2,603** |

## 版本

* 包装层：`0.1.0`
* 上游运行时：锁定 `pi-web-access@0.39.0`（精确版本）
* 已测试 Pi 宿主：`1.1.0`；Node `22.22.1`

## 开发

在仓库根目录运行：`npm ci`、`npm run check`、`npm run contracts:check`。

## 维护说明

适配点、上游元数据、升级步骤与限制见 [MAINTENANCE.md](MAINTENANCE.md)。

## 协议与致谢

MIT。本项目封装 MIT 协议的 [`pi-web-access`](https://github.com/nicobailon/pi-web-access)；上游代码以固定
npm 依赖方式使用，未复制进本仓库。
