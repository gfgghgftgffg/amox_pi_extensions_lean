# amox-high-level

为 Pi 提供高层总结卡片：把长回复压缩成一张可回看的卡片，同时不把摘要带进下一轮上下文。

本项目基于 [z472421519/pi-high-level](https://github.com/z472421519/pi-high-level) 维护。原始设计与实现归 z472421519；本版本增加总结模式、思考等级、历史浏览和 pi-starline 状态菜单。

## 为什么

长回答往往只在当下有用，之后就是噪音。`amox-high-level` 在你指定的回复旁记录一张简短卡片，并让这张卡片不进入后续模型上下文。需要时能回看，不需要时不增加每轮成本。

## 功能

- 只用于展示的总结卡片，保存在当前 session。
- 四种总结模式：手动、自动、最小字符数、最小行数。
- 总结请求可单独选择思考等级。
- 内联自定义 Prompt，支持 `{{question}}` 和 `{{answer}}`。
- Session 历史：可打开原始回复或重新生成摘要。
- pi-starline 中的 `HL` 状态 pill，点击打开状态和操作菜单。
- 没有 pi-starline 时回退到 Pi 原生菜单。
- 所有设置集中在扩展自己的配置文件；不修改任何 Pi 全局设置。

## 安装

需要 Pi 1.6.0 或更新版本，以及至少一个已认证模型。pi-starline 可选。

从 npm 安装：

```bash
pi install npm:@gfgghgftgffg/amox-high-level
pi update --extensions
```

从 monorepo 源码安装：

```bash
git clone https://github.com/gfgghgftgffg/amox_pi_extensions_lean.git
cd amox_pi_extensions_lean
node scripts/install-extension.mjs amox-high-level
```

维护边界见 [MAINTENANCE.md](MAINTENANCE.md)。

安装后执行 `/reload`。

## 快速开始

在需要总结的提示末尾加上 `+hl`：

```text
Refactor the parser and explain the trade-offs +hl
```

标记会在发送前移除。回复完成后，Pi 会在当前 session 中保存一张高层总结卡片。

也可以在回复结束后手动总结最新一条：

```text
/hl
```

浏览已有卡片：

```text
/hl-history
```

`/hl-status` 查看当前状态和操作；`/hl-settings` 修改模式、模型、思考等级、阈值、超时和 Prompt。

### 示例（English example）

Input:

```text
We need to cut cold-start latency in the image pipeline. Compare the two caching
approaches and recommend one, with the main trade-off. +hl
```

原始回复可能很长，卡片保持简短：

```text
- Moved the decoded-image cache from disk to an in-process LRU.
- Cold starts now skip repeated decode work; memory grows with the active set.
- Trade-off: faster warm starts for a bounded increase in RSS.
```

用 `/hl-history` 可以查看完整卡片、回到原始回复，或按当前设置重新生成摘要。

## 命令

| 命令 | 作用 |
| --- | --- |
| `/hl` | 总结最新回复；已有卡片时在历史中打开它 |
| `/hl-status` | 查看总结状态并打开操作菜单 |
| `/hl-history` | 浏览当前 session 的卡片，包括其他分支上的卡片 |
| `/hl-settings` | 设置模式、模型、思考等级、阈值、超时、Prompt 和回退菜单 |

`+hl` 有三种用法：

- `你的提示 +hl`：总结这条提示的回复。
- Pi 运行时单独输入 `+hl`：为当前回复挂载或取消总结。
- 空闲时单独输入 `+hl`：总结最新回复。

少于 160 字符且少于 4 个非空行的回复会跳过。

## 总结模式

| 模式 | 行为 |
| --- | --- |
| `manual` | 只在 `/hl` 或 `+hl` 时总结 |
| `auto` | 完成后，字符数或行数任一达到阈值即总结 |
| `minChars` | 只在字符数达到阈值时总结 |
| `minLines` | 只在行数达到阈值时总结 |

字符阈值最低 200，行数阈值最低 4。

## 思考等级

总结请求可以单独选择 `off`、`minimal`、`low`、`medium`、`high`、`xhigh` 或 `max`。

部分 Provider 会把思考 token 计入输出上限。本扩展在思考预算之外额外保留 320 个回答 token（`minimal` 1024、`low` 2048、`medium` 8192、`high` 16384），再按模型上限截断。`xhigh` 和 `max` 使用 `high` 预算；模型不支持的等级会收敛到最近的可用等级。这些预算只属于本扩展。

## 设置

所有设置存放在 `~/.pi/agent/pi-high-level.json`。可通过 `PI_CODING_AGENT_DIR` 更换 Pi agent 目录。

```json
{
  "model": "auto",
  "thinking": "minimal",
  "mode": "manual",
  "timeoutMs": 18000,
  "auto": {
    "minChars": 1200,
    "minLines": 28
  },
  "prompt": "用三条要点总结。\n\n{{answer}}",
  "fallbackMenu": true
}
```

- `model`：省略或 `current` 使用会话模型；`auto` 优先选择已认证的 Haiku、Flash、Mini、Nano 或 Instant；`provider/id` 指定模型。
- `thinking`：总结请求的思考等级。
- `mode`：`manual`、`auto`、`minChars`、`minLines`。
- `timeoutMs`：限制在 3–120 秒。
- `auto.minChars` / `auto.minLines`：当前模式使用的阈值。
- `prompt`：可选的内联总结指令。
- `fallbackMenu`：没有 pi-starline 时是否使用 Pi 原生菜单，默认 `true`。

旧配置中的 `auto.enabled` 会自动迁移为 `mode`。

单次启动可用 flag 覆盖模型、模式和思考等级：

```bash
pi --hl-model auto --hl-auto 1200c --hl-thinking low
```

## 历史

`/hl-history` 只列当前 session 的卡片，包括其他分支上的卡片。即使没有卡片也会打开空列表弹窗。

选中卡片后可以：

- **Open original**：回到卡片之前的原始 assistant 回复。这会移动 session 当前位置，之后的新提示从该位置继续。
- **Regenerate**：按当前设置重新总结该回复。

卡片支持 `Ctrl+O` 展开；fullscreen 模式下也可以左键点击展开或收起。

## pi-starline 菜单

安装 pi-starline 时，点击 `HL` 状态 pill 会打开包含当前状态和操作的气泡：

- 总结最新回复
- History
- Settings

没有 pi-starline 时，通过 Pi 原生菜单提供相同操作。把 `fallbackMenu` 设为 `false` 可关闭原生回退菜单；此时相关命令只显示信息。

## 自定义 Prompt

内置指令为：

```text
Summarize the assistant's final answer at a high level.
Write 3 to 5 concise lines or bullets in the answer's language.
Focus on the conclusion, key decision/trade-off, and concrete change or next step.
Do not repeat intermediate steps, code blocks, or long file lists.
Do not add a title or preamble.
```

内联 Prompt 可写 `{{question}}` 和 `{{answer}}`。两个占位符都没写时，会自动追加对应的 XML 内容块。问题最多 1200 字符，回答最多 16000 字符，自定义指令最多 8000 字符。

## 工作方式

每次总结都会向所选 Provider 额外发起一次请求。问题和回答会发送给该 Provider，可能产生费用，并适用其数据策略。只有生成的卡片不进入后续主对话上下文；原始回复仍保留在 session 中。

## 兼容性

- Pi 1.6.0 或更新版本。
- 需要 `registerEntryRenderer`、`navigateTree` 和已认证模型。
- 支持 Pi 运行所在的 Linux、macOS 和 Windows 终端。
- 状态 pill 需要 pi-starline 0.13.0 或更新版本，但非必需。

## 开发

在本包目录：

```bash
npm run check
```

在仓库根目录：

```bash
npm test
```

测试通过 `jiti` 加载 TypeScript，可在 Node 22.19 或更新版本运行。

## 致谢

原始项目：[z472421519/pi-high-level](https://github.com/z472421519/pi-high-level)，MIT License，Copyright (c) 2025 z472421519。

本维护版本与新增功能：gfgghgftgffg。
