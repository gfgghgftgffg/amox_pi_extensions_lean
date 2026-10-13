# MAINTENANCE — pi-web-access-lean

本文件记录本包与原 lean 基线的差异、锁定的上游版本、依赖的上游内部细节、升级步骤与已知限制。

## 来源与基线

- 上游引擎：`pi-web-access`（npm），作者 Nico Bailon，仓库
  <https://github.com/nicobailon/pi-web-access>，MIT。
- 本包代码基线：kunkun9527 的 lean 仓库 <https://github.com/kunkun9527/pi-web-access-lean>，
  基线 commit `db083e9119fe5cf080d2ee8d61ef58349042239b`（tracked 文件整体复制，未复制上游代码）。
- 机器可读记录：仓库根 `maintenance/manifest.json`（`id: pi-web-access-lean`）。

## 锁定的上游版本

- `pi-web-access@0.40.0`（精确固定；`dependencies`；此前为 0.39.0）。
- Pi 宿主 peer：`@earendil-works/pi-ai`、`@earendil-works/pi-coding-agent`、`@earendil-works/pi-tui`
  均为 `>=1.1.0`，`typebox` 为 `*`（由宿主提供，`node_modules` 不安装）。
- 开发/测试依赖：Pi 1.1.0、typebox 1.3.27、jiti 2.7.0、TypeScript 5.9.3。

## 相对基线的精确改动（最小适配）

| 位置 | 改动 |
| --- | --- |
| `index.ts` | 仅在 facade `execute` 调用上游工具前增加 `prepareArguments` 透传（4 行）。上游 0.36+ 用它在校验前把字符串形式的 `provider`/`queries`/`domainFilter` 归一化为数组；facade 直接调 `tool.execute`，必须补上这一步。其余代码与基线一致。 |
| `package.json` | 改名 `@gfgghgftgffg/pi-web-access-lean`、版本 `0.1.0`、仓库 `directory`、contributors 归属上游作者、依赖升级到 0.39.0、peer 下限改 1.1.0、devDeps 对齐；新增 `MAINTENANCE.md` 到 `files`。 |
| `tests/facade.test.mjs` | 原有 12 个测试与断言全部保留；顶部增加 `PI_CODING_AGENT_DIR`/session 目录隔离；新增 4 个测试：3 个真实上游测试（help 当前 provider/参数面、无网络 execute 路径、真实 0.39 `prepareArguments` 对字符串数组 `provider`/`queries`/`domainFilter` 的归一化与非法 JSON 抛错）和 1 个仿上游 hook 的透传测试（验证 facade 调用了注册工具的 `prepareArguments` 并把其返回值交给 `execute`）。 |
| `README*.md` | 重写为单仓说明、重新测量的字符代理数据与新版本号。 |
| `LICENSE` | 原样保留（MIT，Copyright kunkun9527）。 |
| `package-lock.json` | 删除；版本由单仓根 `package-lock.json` 统一锁定。 |
| `tsconfig.json`、`tests/types/*.d.ts` | 未改动。 |

## 依赖的上游内部细节

- `pi-web-access/index.ts` 默认导出为扩展函数；`pi-web-access/pdf-extract.ts` 导出
  `extractPDFToMarkdown(buffer, url, { signal })` 与 `loadPDFConfig()`（读取 `enabled`、`maxSizeMB`）。
- 工具名固定读取 `web_search`、`source_check`、`fetch_content`、`get_search_content`，执行签名
  `execute(callId, params, signal, onUpdate, ctx)`。
- 懒惰工具激活：上游注册 `web_enable` 并调用 `setActiveTools`；facade 丢弃该加载器并拦截
  `setActiveTools`，保证工具列表整场会话不变。
- 0.36+ 的 `web_search.prepareArguments` 归一化（本包已透传）。
- 上游配置里 `toolNames` 可以改名（0.35 起即有）。facade 按默认名路由，改名后的配置不受支持（见限制）。

## 本次审查：0.39.0 → 0.40.0

- 精确 before/after 来自 `sources.json`：`8e812826269624406458531f9231b679547f5a3a` →
  `9861ad72a11c9af419b39f9b00860708407f7025`（目标与远端 HEAD 相同）。原 lean 作者仍为
  `db083e9119fe5cf080d2ee8d61ef58349042239b`，无新作者差异可复用；本地入口完整阅读后未改。
- 对比新旧 CHANGELOG、package.json、index.ts 的注册／执行面、fetch-params.ts、web-tool-contract.ts、
  web-tool-core.ts 的 fetch／structuredContent／分页切片、extract.ts 的策略入口、ssrf-protection.ts
  配置和重定向循环、video-extract.ts 上传路径、content-find.ts 摘录格式。
- 四个工具名与五参数 execute 不变；无工具增删。新增 fetch 可选 `redirects`，唯一合法值为
  `same-origin`；未传时默认策略未启用，也可在配置 `fetchContent.redirects` 启用。
  其余已审查字段／required 和 readable 默认不变；provider 与依赖／peer 范围未变化。
- 策略比较原始 URL 的 origin（协议、主机名、有效端口），跨源跳转在联系目标前拒绝。
  拒绝正文为空，不做 fallback；不能观察跳转的路径不可用（托管／Jina／GitHub／YouTube 等）。
  冷门参数自动进入 help，JSON input 已完整透传，不加入常驻 Schema，不复制策略实现。
- answer 模式不再拒绝只带 thumbnail 的文字 transcript，但仍拒绝 image mimeType／frames。
  视频上传将返回的上传 URL 通过 rewriteUploadUrlOrigin 路由到配置网关。
  分页初始切片改用 pageEnd；findText 摘录中的单独 surrogate 用 U+FFFD 替代。
  修复由固定上游依赖承接，未新增与门面无关的网关／视频测试。
- `structuredContent.urls[].content` 是完整正文／回答数据；`content` 是含存储提示等信息的工具输出块，
  不能把整个工具文本当页面正文。返回对象仍原样透传。
- 保留 prepareArguments hook、默认名路由、web_enable 丢弃和 setActiveTools 拦截；本地 PDF
  仍是独立直读分支，不把远端重定向策略宣称为本地文件策略。既有 PDF／hook 测试保留。
- 新增 tests/upstream-040-regression.test.mjs，仅覆盖本次新参数在真实门面的 help／JSON／执行路径：
  DNS 和 fetch 在导入前 mock，使用绝对 https URL，同源成功、跨源拒绝、非法值无网络请求，
  分别断言工具文本、structuredContent 正文与错误标记，保持 op/input Schema 和单工具身份。
- `check` 负责当前候选的实际契约／字符代理捕获、类型与回归、生产安装及审计；不预先声称通过。
  字符代理为 ceil(chars / 4)，不是计费 token。真实视频服务与网关端到端未验证；三平台 CI 与人工审查仍须完成。

## 升级步骤

1. `npm view pi-web-access version` 确认新版本，阅读 0.35.0→目标版本的 `CHANGELOG.md`。
2. 更新根 `package.json` 与 `packages/pi-web-access-lean/package.json` 中的精确依赖，执行
   `npm install --ignore-scripts` 刷新根 lockfile。
3. 若上游改了工具名、执行签名、`pdf-extract.ts` 导出或 `prepareArguments` 行为，按上表同步最小适配；
   仅版本变化时不需要改 `index.ts`。
4. 运行 `npm run contracts`（重建 `maintenance/tool-contracts.json`）检查注册工具清单与 help 面；
   新 provider/新参数通常无需改代码，但建议在 `tests/facade.test.mjs` 的真实上游测试里补断言。
5. `npm test`、`npm run typecheck`、`npm run contracts:check`；用
   `node scripts/verify-production-install.mjs` 验证生产安装可加载。
6. 更新本文件与 `README*.md` 的版本号、字符代理数字；同步 `maintenance/manifest.json`。

## 已知限制

- 只保留单一 `web_access` facade；`op` 与 `input` 语义固定，帮助信息只在调用 `help` 时返回。
- 上游 `web-search.json` 中通过 `toolNames` 重命名工具时，facade 的默认路由找不到工具并报错。
- 本地 PDF 直读仅处理 `.pdf` 扩展名的本地路径；远端 URL 仍走上游 SSRF 防护。
- 字符代理值 `ceil(chars / 4)` 只用于横向比较，不代表真实模型计费 token。
