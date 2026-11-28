# @gfgghgftgffg/pi-web-access-lean

[![npm](https://img.shields.io/npm/v/@gfgghgftgffg/pi-web-access-lean?style=flat-square)](https://www.npmjs.com/package/@gfgghgftgffg/pi-web-access-lean)
[![Pi](https://img.shields.io/badge/Pi-%3E%3D1.1.0-4f46e5?style=flat-square)](https://npmjs.com/package/@earendil-works/pi-coding-agent)
[![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](LICENSE)

**面向 [`pi-web-access`](https://github.com/nicobailon/pi-web-access) 的单工具轻量封装，减少约 87% 的常驻工具声明文本。**

[English](README.md)

将联网搜索、事实核验、网页与本地 PDF 抓取以及缓存结果续取收敛为单一 `web_access` 工具，底层执行完全复用上游 `pi-web-access` 引擎。

## 核心特性

- **单一 `web_access` 入口** — 统一调度 `search`、`check`、`fetch`、`get` 和 `help` 五类操作，避免重复注册上游的多套工具定义。
- **低频参数按需展开** — 冷门选项与当前可用搜索 Provider 保留在 `help` 中，需要时以 JSON 对象字符串形式写入 `input` 透传，显式 Provider 选择完全遵循上游配置。
- **本地 PDF 直读提取** — 支持本地 `.pdf` 路径与 `file:///` 地址直接提取并保存 Markdown，返回文件路径、正文内容、字符数及页数（引擎可解析时）。
- **多模态页面问答** — 搭配支持图像输入的模型时，远端图片与视频帧提问自动走上游 `answer` 模式返回文字解答，同时保留通过 `get` 读取原始页面内容的能力。

## 安装

推荐直接从 npm 安装（无需锁定版本号）：

```bash
pi install npm:@gfgghgftgffg/pi-web-access-lean
pi update --extensions
```

如需从单仓本地 checkout 回退安装，在仓库根目录执行：

```bash
node scripts/install-extension.mjs pi-web-access-lean
```

> [!IMPORTANT]
> 请勿与原版 `pi-web-access` 或其他同类封装同时加载，以免重复注册工具。本地 Git 安装需通过拉取仓库代码并重新运行 `install-extension.mjs` 更新（`pi update` 不会更新本地目录）。切换为 npm 安装前，请先备份配置，根据 `pi list` 移除精确的旧来源后再安装 npm 包。

## 使用方法

调用 `web_access` 时显式指定 `op`，并将搜索词、待核验陈述、URL、本地 PDF 路径、响应 ID 或 JSON 参数串填入 `input`。

**联网搜索：**

```json
{ "op": "search", "input": "Pi coding agent extensions" }
```

**核验事实陈述：**

```json
{ "op": "check", "input": "The paper was published in 2024" }
```

**抓取网页或读取本地 PDF：**

```json
{ "op": "fetch", "input": "https://example.com/page" }
```

**按响应 ID 续取已缓存结果：**

```json
{ "op": "get", "input": "response-id" }
```

**查询指定操作的完整参数与可用 Provider：**

```json
{ "op": "help", "input": "fetch" }
```

**通过 JSON 字符串传入高级参数：**

```json
{ "op": "fetch", "input": "{\"url\":\"https://example.com/page\",\"redirects\":\"same-origin\"}" }
```

> [!TIP]
> 当工具返回结果提示使用 `get_search_content` 翻页或读取缓存时，请改用 `web_access` 的 `op: "get"` 并传入对应的响应 ID（如需附加检索字段，可在 `input` 中传入 JSON 字符串）。抓取正文原样透传，不做正则改写。

## 配置与限制

- **沿用上游配置** — 搜索服务商、API 密钥、路由策略与抓取参数均读取 `~/.pi/agent/web-search.json` 及上游环境变量；配置方式、支持的服务与计费规则详见[上游配置文档](https://github.com/nicobailon/pi-web-access#configuration)。
- **外部服务调用与费用** — 搜索词和页面内容可能发往所配置的第三方服务并产生费用，启用前请核对服务配置。
- **代理策略** — 代理配置（含可选 `lockProxy`）完全沿用上游；日常调用省略 `proxy` 字段即可走默认配置路由。
- **本地与远端 PDF 差异** — 本地 PDF 直读仅提取 Markdown，不支持上游结构化 `extract` 字段提取；远端 PDF 仍走上游标准处理流程。
- **常驻直接注册** — `web_access` 在启动时直接注册，上游的动态延迟暴露设置（`toolExposure` / `toolActivation`）不会隐藏或推迟该入口。

## 上下文占用（字符代理）

<!-- amox-measurement:start -->
| Package | Registered character proxy |
| --- | ---: |
| @gfgghgftgffg/pi-web-access-lean | 149 |
| pi-web-access | 1110 |

Fixed ceil(characters / 4), not provider billing tokens.
<!-- amox-measurement:end -->

## 来源与开发

门面源自 [kunkun9527/pi-web-access-lean](https://github.com/kunkun9527/pi-web-access-lean)，底层运行时依赖 [Nico Bailon 的 `pi-web-access`](https://github.com/nicobailon/pi-web-access)，在 [amox-pi-extensions-lean](https://github.com/gfgghgftgffg/amox_pi_extensions_lean/blob/main/README.zh-CN.md) 中持续跟随上游发布，不复制引擎源码。两者均采用 MIT 许可证，保留原始 `LICENSE`。

仓库校验流程与适配记录详见[开发检查与维护策略](https://github.com/gfgghgftgffg/amox_pi_extensions_lean/blob/main/docs/maintenance.md)及包内 [MAINTENANCE.md](MAINTENANCE.md)。
