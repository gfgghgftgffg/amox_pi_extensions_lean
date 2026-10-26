# MAINTENANCE — pi-web-access-lean

本文件记录本包与原 lean 基线的差异、锁定的上游版本、依赖的上游内部细节、升级步骤与已知限制。

历史审查中的“未运行”“待 CI”或人工审批要求只记录当时阶段，不代表当前 CI/发布结果或现行审批要求。当前自动合并与 OIDC 发布规则见[维护者文档](https://github.com/gfgghgftgffg/amox_pi_extensions_lean/blob/main/docs/maintenance.md)。

## 来源与基线

- 上游引擎：`pi-web-access`（npm），作者 Nico Bailon，仓库
  <https://github.com/nicobailon/pi-web-access>，MIT。
- 本包代码基线：kunkun9527 的 lean 仓库 <https://github.com/kunkun9527/pi-web-access-lean>，
  基线 commit `db083e9119fe5cf080d2ee8d61ef58349042239b`（tracked 文件整体复制，未复制上游代码）。
- 机器可读记录：仓库根 `maintenance/manifest.json`（`id: pi-web-access-lean`）。

## 锁定的上游版本

- `pi-web-access@0.44.0`（精确固定；`dependencies`；此前为 0.43.0）。
- Pi 宿主 peer：`@earendil-works/pi-ai`、`@earendil-works/pi-coding-agent`、`@earendil-works/pi-tui`
  均为 `>=1.1.0`，`typebox` 为 `*`（由宿主提供，`node_modules` 不安装）。
- 开发/测试依赖：Pi 1.1.0、typebox 1.3.36、jiti 2.7.0、TypeScript 7.0.2。

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

## 本次审查：0.40.0 → 0.41.0 与 lean 作者更新

- 精确引擎 before/after：`9861ad72a11c9af419b39f9b00860708407f7025` →
  `d47dc040552505e3b135d0136a0b15eaf4bdba52`（npm stable 与远端相同）。对比两版
  CHANGELOG、package.json、fetch-params.ts、index.ts 的 source/fetch/get 注册执行面，
  extract.ts 的远端预检及 HTTP header 路径、ssrf-protection.ts 配置与 redirect 循环、完整 searxng.ts；
  阅读 web-tool-contract.ts 与 web-tool-core.ts 的返回对象。不是全仓安全审计。
- 无新增／删除工具、调用参数或调用默认值；fetch 参数归一化不变。新增的是配置
  `fetchContent.userAgent`，不是工具参数，不加入常驻 Schema 或宣称 help 会列出它。
  未设／null 保留 `OpenAI File Downloader, XaiImageApiFetch/1.0`，字符串 trim 后用于 HTTP header；
  空白、非字符串、非 ASCII 或 CR/LF 被拒绝（实际校验也允许 tab）。远端预检在所有 provider
  routing 前验证配置，因此非法配置返回空正文、isError，不尝试其它 provider。
- SearXNG 对显式 loopback endpoint 启用既有 allowLoopback；localhost、127/8、::1 由
  utils.isLoopbackHostname 判断。跨 origin redirect 移除该豁免，普通页面 fetch 仍拒绝本地服务。
  不需要 ssrf.allowRanges 全局放行。依赖／peer 范围不变。
- 内部契约继续成立：五参数 execute、prepareArguments、四默认路由、loader 丢弃、setActiveTools
  拦截与本地 PDF 独立分支保留。配置变更不要求修改本地 index.ts。
- 逐项审查作者入口 `db083e9119fe5cf080d2ee8d61ef58349042239b` →
  `ae54d0db6a3332744b0c20df7f15a25210b1b434`：prepareArguments 透传已在本仓实现；
  新 retrieval/404 文本重写未复用，因为 withFacadeHints 对所有 content 文本做正则替换，
  也会改写页面里合法的 `get_search_content({ responseId: "x", urlIndex: 0 })` 示例。
  保留现有原样返回，续取仍可手动用 op=get + input JSON（已知限制见 README）。
  作者新增的 hint rewrite 测试未引入；其 prepareArguments 回归已有本地等效覆盖。
- 作者 package.json 升至 0.40.1／引擎 0.40.0、README 改名 README_zh-CN.md 并更新测量，
  不复用其版本、打包列表、锁文件或 Pi 1.2 测量；本仓使用固定脚本和自己的中英文文档。
- 新增 tests/upstream-041-regression.test.mjs，仅测真实门面的 UA 配置／错误、默认值、
  页面字面内容保留、SearXNG 搜索及本地服务拒绝。导入前 mock DNS/fetch，使用绝对 URL，
  分别断言 rendered content、structuredContent、error 与请求集合，不增加引擎内部单元测试。
- check 实际生成当前字符代理／契约并执行验证，结果以其输出为准。字符代理为 ceil(chars/4)，
  非计费 token；真实网站与 SearXNG 服务未联网实测。历史审查章节的版本／未运行说明仅指当时阶段。

## 本次 lean-only 审查：基准环境文档更新

- 精确作者 before/after：`ae54d0db6a3332744b0c20df7f15a25210b1b434` →
  `c2beefc20ff6ed52a376d5ddaf9a91bcf3a7a09a`。完整对比 index.ts、package.json 和中英文 README；
  入口及包元数据一致，README 仅将测量环境 Pi 1.2.0 改为 1.3.0，数值未变。
- 无工具、参数、默认值或行为变化；prepareArguments、默认名路由、loader 拦截和 PDF 分支记录继续适用。
  两版都已有文本重写实现，先前不复用该实现的决定保留；本次没有新增该功能。
- 引擎仍为 0.41.0 / `d47dc040552505e3b135d0136a0b15eaf4bdba52`；远端
  `b3f676d8448ede197d8cd22589beeb9e44f1cf44` 未采用。本次库存仅有 lean 源码，不声称重审远端引擎。
- 不复制作者基准或改变宿主要求；本仓字符代理由 check 重新捕获，不宣称已验证 Pi 1.3。
  无门面变化，不新增测试；check 实际执行既有回归、契约、类型、生产安装与审计，结果以输出为准。

## 本次审查：0.41.0 → 0.42.0 与 lean 作者更新

- 精确发布源码：`d47dc040552505e3b135d0136a0b15eaf4bdba52` →
  `18e36f9e0fc2de3c9895a7fda8d39a62ce60f49e`（npm stable 与远端一致）。阅读新旧入口注册／执行面、
  CHANGELOG、package.json、gemini-search.ts provider 表与策略、page-query.ts、summary-review.ts
  的模型调用、summary-model-scope.ts、credential-source.ts、gemini-adc.ts 与返回契约／fetch core。
  审查范围为门面相关边界，并非全仓安全审计。
- 无工具增删、无调用字段增删；provider 枚举新增 deepseek，search/check help 从真实 schema 自动披露，
  input JSON 原样传入并保留 search.prepareArguments；不扩大常驻 op/input Schema。numResults 默认 5、
  fetch 默认 readable、workflow 默认 none 不变。依赖／peer 范围不变。
- DeepSeek 显式选择或配置 searchRouting，auto/all 不包含它；deepseekApiKey／DEEPSEEK_API_KEY 提供凭据。
  域名转 site:/-site:，recency 转 after:，包含过滤表达式的查询最多 128 Unicode 字符，超长在发请求前失败。
  POST https://api.deepseek.com/v1/tools/search 返回 results，summary 优先作为 snippet。
- 新配置 toolExposure 默认 direct，可选 deferred，后者强制 dynamic 且不兼容 toolActivation=eager。
  captured 工具新增 exposure，但本地新建的 web_access 不继承它；既有 loader 丢弃和 setActiveTools 拦截
  继续有效，保持门面直接可用。这是配置边界，不是新工具参数；中英文 README 明示。
- 页面回答与摘要优先 registry.streamSimple(...).result()，其次 registry.complete，最后 compat.complete；
  支持 virtual model，仍做 auth／scope 检查、透传 sessionId 与 cacheRetention=none。无本地模型调用实现复制。
- Windows !command 凭据优先 Git Bash 安装路径或 PATH bash.exe，排除旧 WSL launcher；缺失时 exec 默认 shell。
  增加 Windows 环境变量白名单，仍共享 5 秒预算／abort／输出限制。GCE ADC 无显式或默认文件时可用 metadata token，
  由 GCE_METADATA_HOST 或 Google BIOS 检测，METADATA_SERVER_DETECTION=none 禁用；metadata 请求禁止 redirect。
- 五参数 execute、四默认路由、PDF 独立分支继续成立；rendered content、structuredContent、存储正文分层保持。
  answer 的 structuredContent.urls[].content 是回答，get 取回的是原始页面；返回对象不做文本正则替换。
- 逐项作者复用审查 `c2beefc20ff6ed52a376d5ddaf9a91bcf3a7a09a` →
  `09262708ad57726d1a4b3c22b084fb84ea22281b`：完整入口一致，原有 hint rewrite 仍不复用；
  package.json 仅包装版本／description 测量／引擎 pin 更新，保留本仓脚本管理元数据和 peer/dev 基线。
  中英文 README 仅版本及测量更新，不复制其 Pi 1.3 数值。作者测试将 help 标题改 0.42 并补 deepseek 断言，
  本仓以新 focused 回归覆盖，不修改既有基线测试。
- 新增 upstream-042-regression.test.mjs：导入前 DNS/fetch mocks、绝对 URL、虚构凭据；覆盖 help、JSON
  stringified provider/domainFilter、实际请求、超长错误、deferred 下单一直接门面与无 active-list 变动、
  answer 对 host streamSimple 的透传及响应分层。无 ADC／Windows shell 内部测试或真实模型任务。
- check 捕获当前字符代理及契约并实际执行类型／测试／生产安装／审计；结果以输出为准。
  ceil(chars/4) 不是计费 token。真实 DeepSeek、GCE、Windows Git Bash 和虚拟模型服务端端到端未实测。

## 本次审查：0.42.0 → 0.43.0 与 lean 作者更新

- 发布源码以 sources.json 为准：`18e36f9e0fc2de3c9895a7fda8d39a62ce60f49e` →
  `7fcb1531fbc4b86cef12e8851f66b42e6385e0ce`；远端 `d0e323ac935e8753d11e1853b81c057e39dee4dc`
  未采用。对比 CHANGELOG、package.json、入口 search/check/fetch/get schema 与执行面、gemini-search.ts
  的 provider 表及数组路由、deepseek.ts、xai-search.ts 和 extract.ts 的路由／短正文分支；阅读新增
  linkup.ts 及 web-tool-contract.ts、web-tool-core.ts 的响应／内容存储路径。范围为门面兼容审查。
- 无工具增删、无调用字段增删；provider 枚举新增 linkup，help 自动披露，JSON input 完整透传。
  numResults 默认 5、workflow 默认 none、fetch 默认 readable 不变；运行时依赖和 peer 范围不变。
  Linkup 配置 linkupApiKey／LINKUP_API_KEY；linkupDepth 为 flash/fast/standard/deep，默认 fast。
  POST https://api.linkup.so/v1/search 支持过滤与 inlineContent；auto/all 不包含该付费 Provider。
- DeepSeek includeContent 发送 need_content=true，使用搜索返回的原始正文，不做 Fetch 的 Markdown
  去转义，也不重复抓取已覆盖 URL。DeepSeek Fetch POST /v1/tools/fetch 返回 title/content，需显式加入
  fetchRouting.providers 并允许远端托管；默认顺序没有它。仍做 SSRF／域名预检，同源重定向策略只允许 HTTP。
- 配置默认 provider 数组全失败且每项错误均符合 fallbackOn 时，继续 searchRouting 的未尝试 Provider；
  单次显式数组不回退。providerFromConfig 从 core／curator 透传；不是新增工具字段。
- xaiResponsesUrl 为绝对 HTTP(S) 配置，自定义端点绕过 Pi 登录凭据，仅用 xaiApiKey／XAI_API_KEY。
  xaiSearchTimeoutMs 为正整数，默认 60,000、封顶 600,000。均为配置，不加入 help 的工具 schema。
- 短静态 HTML 在 Readability 已提取非空内容、原始可见文本不足 500 且没有可执行脚本时不再报 incomplete；
  JSON-LD 等数据脚本不算可执行脚本。仍不完整时错误包含字符数；不把此修复宣称为任意空页面均成功。
- 五参数 execute、prepareArguments 归一化、默认名路由、web_enable 丢弃、setActiveTools 拦截及 PDF
  独立分支继续适用。search structuredContent 只含结果／snippet 与 fetchId；全文由 get 取回，get 的
  rendered text 含标题；fetch structuredContent.urls[].content 是正文，不能等同于完整工具文本。
- 作者完整入口 `09262708ad57726d1a4b3c22b084fb84ea22281b` →
  `e5e9954a3ec000132d794b2ad88314c71e51a82e` 新增 prepareFacadeArguments：推断缺省 op、序列化
  对象 input、合并顶层字段、拒绝冲突，以及提取纯路径判断；作者测试覆盖这些分支。作为可选容错扩展
  本次不复用：当前显式 op／字符串 input 已兼容 0.43，不扩大最小依赖更新的接受输入面。
  既有 broad hint rewrite 继续不复用，保留字面正文。作者包装版本 0.42.0 → 0.42.2，引擎仍为 0.42；
  不复制其包装版本、Pi 基准、锁文件或 README 的容错功能宣称；本地 index.ts 保持不变。
- 新增 upstream-043-regression.test.mjs，仅测真实门面的 Linkup help／JSON、DeepSeek inlineContent/get、
  配置数组与显式数组回退边界、短 HTML／托管 Fetch。导入前 DNS/fetch mocks、绝对 URL、虚构 key；
  分别断言 rendered text、structuredContent 与 stored body，已有断言全部保留。
- check 实际重测字符代理 ceil(chars/4)、契约、类型／测试、生产安装及审计，结果以输出为准；不是计费 token。
  没有真实 Linkup／DeepSeek／xAI 网关请求；跨平台与发布仍由固定后续流程验证。

## 本次审查：0.43.0 → 0.44.0

- 精确发布源码以 sources.json 为准：`7fcb1531fbc4b86cef12e8851f66b42e6385e0ce` →
  `d0e323ac935e8753d11e1853b81c057e39dee4dc`，目标与远端 HEAD 相同。先读三个包的维护记录，
  对比两版 CHANGELOG、package.json、index.ts 的初始化／search/check/fetch/get 注册执行面、
  utils.ts 网关与重定向实现、DeepSeek search/fetch、SerpApi、Jina search；核对 tool-activation.ts、
  web-tool-contract.ts、web-tool-core.ts 的配置／返回分层以及 PDF 配置接口。阅读新增上游网关测试
  作为行为证据，不复制其测试。范围为门面兼容边界，不是全仓安全审计。
- 四个业务工具、provider 选项、调用字段／required／默认值未增删；numResults=5、workflow=none、
  fetch=readable 保持。运行时依赖与 peer 范围不变。新配置不是工具参数，不加入常驻 op/input schema，
  也不宣称工具 help 会列出配置项。index.ts 无需修改。
- 新 resolveProviderApiUrl 通过 `<stem>BaseUrl` 或对应环境变量覆盖官方 origin，保留网关前缀并追加
  官方 endpoint pathname/search；环境变量优先。deepseek／ollama 仅读取 PI_DEEPSEEK_BASE_URL／
  PI_OLLAMA_BASE_URL，不使用其它客户端常设的普通名称。Jina 为 jinaSearchBaseUrl／JINA_SEARCH_BASE_URL，
  Mistral 为 mistralSearchBaseUrl／MISTRAL_SEARCH_BASE_URL。默认官方端点保持。
  共享校验要求 HTTPS（loopback 可 HTTP），禁止内嵌凭据、查询串、fragment，去掉尾部斜杠。
- 代表路径已逐项对比：DeepSeek search 与 hosted fetch 共用 deepseekBaseUrl；SerpApi /search.json
  使用 query api_key；Jina 追加编码查询，并在无其它过滤表达式时拒绝单独 .／..，避免路径逃逸。
  上游 CHANGELOG／gateway coverage 表还列出其它迁移 Provider；本次不宣称逐一端到端验证所有 Provider。
- fetchWithCredentialRedirects 已有 5 次上限与跨 origin header 去凭据逻辑；0.44 新增 query 凭据列表，
  SerpApi 传入 api_key，跨 origin 删除目标 URL 中全部同名项；上限错误也先去掉原 URL 中的凭据。
  301/302 POST 与 303 非 GET/HEAD 改 GET 并移除 body/content headers，307 保留 method/body。
  该 API 传输策略不等同于页面 fetch 的 redirects=same-origin；不夸大为所有重定向均被拒绝。
- toolActivation 新增 none，默认仍 auto；none 必须搭配 toolExposure=deferred，跳过 loader 注册，
  原生上游依赖 codemode/tool_search 访问。门面仍新建单一直接 web_access，不继承 exposure；
  loader 丢弃／setActiveTools 拦截保持，无需改变原 lean 精简规则。README 中英文明确这个配置边界。
- 默认工具名路由、五参数 execute、prepareArguments 字符串数组归一化与 PDF 独立分支继续适用。
  返回对象仍原样委派：search structuredContent 是 results/snippets，fetch 的 urls[].content 才是正文，
  rendered content 可能含标题、存储与续取提示；不以整个工具文本充当存储正文。
- 三个 lean 作者 HEAD 均未变化（web e5e9954a3ec000132d794b2ad88314c71e51a82e；todo
  f1e3fc7bcde2644a89803fa6a3a256fb7422d89f；subagents b084c51a7ec3fa6737b108ca3583e3d71075874f），
  无新增作者实现可复用，历史复用决定保持。todo/i18n 2.13.9、subagents 0.22.0 无发布升级，
  本次未提供其引擎快照，不声称审查未发布远端代码。
- 仅新增 tests/upstream-044-regression.test.mjs：真实门面 none/deferred 直接可用及非法组合、help、
  DeepSeek 网关前缀／环境优先／307 header 去凭据、SerpApi query 去凭据、Jina dot 拒绝。
  DNS/fetch 在导入前 mock、绝对 HTTPS URL、虚构 key、拒绝意外目标；分别断言 rendered 与 structured。
  不改基线断言，不添加无关上游内部测试。
- check 捕获字符代理 ceil(chars/4)、更新测量文档并实际执行类型／回归／契约、独立生产安装与两种审计；
  结果以工具输出为准，字符代理不是计费 token。无真实 Provider／网关请求；跨平台与发布由固定后续流程验证。

## 本次 lean-only 审查：作者同步 0.44.0

- 精确作者 before/after 来自 sources.json：`e5e9954a3ec000132d794b2ad88314c71e51a82e` →
  `6842095b34a3650163bfbbfd9da225ac3ac33e3d`。完整比较两版 index.ts、package.json、中英文 README
  和 tests/facade.test.mjs，并阅读本地入口与用法。两版入口逐行一致，无新增／删除工具、参数、默认值或执行行为。
- 作者 package.json 仅包装版本 0.42.2 → 0.44.0、引擎 pin 0.42.0 → 0.44.0；本仓已固定 0.44.0。
  peer/dev 未变，仍是作者旧 Pi 基线，不复制其版本、锁文件或开发依赖。README 更新引擎／包装版本、
  字符代理与测量环境 Pi 1.3 → 1.4；本仓使用 check 的实测代理，不采用其基准。作者 package description
  仍保留旧百分比，不能当作当前实测证据。
- 作者 facade 测试只将 help 标题 0.42 改 0.44 并增加 linkup 断言；本仓已有 0.43 Linkup focused
  回归及 0.44 网关回归，不复制重复测试或改动既有断言。
- 历史复用决定保持：不引入已有的 op 推断／对象 input／顶层字段合并，也不引入对 rendered content
  的全局 hint 正则改写。返回对象直接透传，structuredContent 正文和 rendered 工具提示继续区分。
  中英文 README 明确当前显式 op／字符串 input 用法；单一工具、prepareArguments 委派、loader 丢弃、
  setActiveTools 拦截和 PDF 独立分支均保留，本地 index.ts 不变。
- 本次库存仅有两个 lean 仓库快照，没有引擎 before/after 或 CHANGELOG。稳定引擎仍为 0.44.0 /
  `d0e323ac935e8753d11e1853b81c057e39dee4dc`；远端 `441fdf5e14d18b0a2ebd535bd3cf077d8ce5e92d`
  未采用，不声称重审该远端实现。内部引擎契约由固定版本及既有真实集成验证。
- 无本次门面行为变化，不新增测试。check 重新捕获契约／字符代理并实际执行类型、所有既有回归、
  三包独立生产安装与两种审计；结果以输出为准。ceil(chars/4) 非计费 token；真实服务和 Pi 1.4 未实测。

## 升级步骤

1. `npm view pi-web-access version` 确认目标稳定版本，对比 manifest 中当前固定版本/revision 与目标源码及 `CHANGELOG.md`。
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
