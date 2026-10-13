# 本次 staged upstream 审查

## 结论

候选消费固定脚本已暂存的 pi-web-access 0.40.0 与 pi-subagents 0.22.0，rpiv-todo / rpiv-i18n 保持 2.13.8。两包本地 index.ts 完整阅读后均未修改：既有门面可以通过 help 与 JSON input 暴露新高级参数，并继续透传上游行为。保留所有既有测试断言，只新增一个与 redirect 参数有关的真实门面离线回归。不复制上游实现、不修改 node_modules、依赖版本、CI 或检查脚本。

## 来源与 lean 作者审查

精确源码来自提供的 sources.json，不把远端 HEAD 当 npm stable：

| 包 | before | after | 未采用的较新远端 |
| --- | --- | --- | --- |
| pi-web-access | 0.39.0 / 8e812826269624406458531f9231b679547f5a3a | 0.40.0 / 9861ad72a11c9af419b39f9b00860708407f7025 | 目标即远端 |
| pi-subagents | 0.21.0 / 26c23bb7db7b181ff3f4233cdc4e5bc9fefb6f04 | 0.22.0 / 85a704cb8f35c96c0cabfa665b572bab296942e5 | bd5980ac2fd0b12f438d964c575b0a8310e80259 |
| rpiv-todo / rpiv-i18n | 2.13.8 / afc21bc25f7d07cae9fb3103dc309240a16b9f49 | 相同 | dd73f9756f8fde569d8bbfe6a082c2d9545ed095 |

先读三个 MAINTENANCE.md。规划器确认三个 lean 作者 commit 均未变化：web db083e9119fe5cf080d2ee8d61ef58349042239b；todo ec463cd90fbae962122fff2e0619955a8f17df1a；subagents 83f1454b26c32dd2a674385df55955ac9d3a45c3。库存只有两个变化引擎的 before/after，没有独立 lean 作者候选或 todo 新版源码；不声称读取不存在的材料，无作者改动复用／拒绝项。todo 的远端新提交没有对应新版 npm，保持当前 pin 并由既有测试验证。

## Web access

对比两版 CHANGELOG / package.json、index.ts 注册／执行面（含 fetch/check/get schemas）、fetch-params.ts、web-tool-contract.ts；阅读两版 web-tool-core.ts 的 fetch、structuredContent 与初始分页、extract.ts 策略入口、ssrf-protection.ts 配置与 redirect loop、video-extract.ts 上传路径、content-find.ts 摘录格式。审查范围为门面相关边界，不宣称逐文件审计整个上游。

- 工具不增删，仍为 web_search/source_check/fetch_content/get_search_content；五参数 execute 与现有默认名路由保持兼容，loader 仍由门面丢弃。prepareArguments 的已有真实回归保留。
- 唯一新增工具参数是 fetch 的可选 redirects，只接受 same-origin，默认未启用；配置 fetchContent.redirects 也能启用。其余审查面 fields/required、readable 默认与运行依赖/peer 范围不变。
- Redirect loop 比较原请求 origin，在接触跨源目标前拒绝；正文为空、不走 fallback。不能观察 redirect chain 的托管、Jina、GitHub、YouTube 等提取路径在启用策略时不可用。冷门参数直接进入 help，输入 JSON 原样转交；常驻 op/input schema 不增长。
- answer mode 允许带 thumbnail 的文字 transcript，但拒绝 image mimeType / frames；视频上传返回的 URL 通过 rewriteUploadUrlOrigin 使用配置网关。分页切片使用 pageEnd，findText 中单独 surrogate 用替代字符表示。上述修复由依赖承接，未复制实现或添加不相关的视频／网关内部测试。
- 真实返回形状先从 contract/core 阅读：content 是展示文本块，可能另带 responseId/存储提示；structuredContent.urls[].content 是正文或 answer 数据。回归分别断言这些层次，拒绝时也检查 isError。

新增 packages/pi-web-access-lean/tests/upstream-040-regression.test.mjs：在上游导入前安装离线 DNS/fetch mock，用绝对 https URL，通过真实门面验证 help 包含新字段、JSON 参数生效、跨源不请求目标、同源成功、非法值无请求、单工具身份与 op/input Schema。不降低任何基线断言。

本地 PDF 是门面独立直读分支；远端策略不宣称适用于本地文件。既有 PDF 导出／大小／disabled／execute 路径由已有回归和生产加载检查覆盖。

## Subagents

对比两版 CHANGELOG / package.json、src/index.ts 的 Agent / workflow / result / steer schema、execute/render、resultConsumed、join batch、shutdown；完整对比 invocation-config.ts；对比 custom-agents.ts 发现层与 workflow/saved.ts 解析，阅读新增 completion-outbox.ts 和 package-resources.ts 的声明/trust/gate/枚举路径。

- 四个工具不增删，参数、类型、required、约束、调用默认值不变。Agent 的 prompt/description/subagent_type 必填；高级字段仍在 input/help。result 的 wait/verbose 默认 false；inherit_context 默认 false；顶层默认后台；isolation 默认 off。
- typebox v1 / instancePath、启动时类型描述模板正则、五参数执行与渲染委派、usage 透传兼容。门面通知描述仍准确，无须改 prompt 或 schema。
- 默认 join 名称仍是 smart，但 smart/async 不再等待兄弟任务：busy 父会话在 turn_end 一次收到 batch 已完成项，idle 父会话约 200 ms 内聚合。group 按父 turn 分组，单个 spawn 和不同 turn 不分组。Esc/error 暂不 flush，run 结束后可发通知并开启新 turn。读取完成结果调用 outbox.cancel(record.id)，在发送前任何时刻都可取消。
- 已安装 Pi 包声明 pi.subagents / pi-subagents 的 agents/workflows，packageAgents/packageWorkflows 默认开启，可 false 或 allowlist。只枚举 Pi 配置且已安装的包，不扫描项目 node_modules；不信任项目配置的包不可见。包资源低于自己的定义，Agent UI 只读并提供 Eject/Disable。
- trust 激活时 seed、session_start 校正；门面类型名单仍一次生成，变更包设置/trust 后须 reload。未自行变更发现规则、动态名单或工具身份。
- shutdown 新增 widget/groupJoin/outbox dispose，由门面 pi.on 透传承接。不新增与门面变化无关的上游内部测试；已有集成/schema/通知/usage/作用域/隔离断言全部保留。

## 文档与验证边界

更新两包中英文 README、MAINTENANCE.md 与本报告，明确新参数使用方式和 subagents 可能影响既有工作流的 join/Esc 行为。旧维护章节保留为历史记录，旧阶段的未运行说明不代表当前候选结果。

调用 check 实际捕获 contracts、字符代理与更新测量文档，运行类型检查、回归、contract check、三个全新生产安装和两项安全审计。结果以工具输出及检查报告为准，未预先声称通过；失败必须在同一候选修复。字符代理是 ceil(chars / 4)，不是模型计费 token。

无待决定的门面规则删减、工具合并或实现兼容问题。真实 provider/gateway/video、模型/MCP、键盘 UI 与父会话通知调度端到端不在离线检查覆盖内，不能把依赖修复说明解读为这些服务经过实测。普通三平台 CI 及人工审查合并后才可发布；本阶段不推 main 或发版。
