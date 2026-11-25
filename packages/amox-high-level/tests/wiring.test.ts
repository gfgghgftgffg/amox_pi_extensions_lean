import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { EntryRenderOptions, ExtensionAPI, ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { DEFAULT_SUMMARY_PROMPT, HIGH_LEVEL_ENTRY, type HighLevelCard } from "../core.ts";
import extension from "../index.ts";

type Handler = (event: never, ctx: ExtensionContext) => Promise<unknown> | unknown;

const SUBSTANTIVE_ANSWER = [
	"We refactored the summary extension around an explicit RunTracker queue.",
	"- Passed ctx.signal + an 18s timeout and cacheRetention=none to streamSimple.",
	"- Kept armed state intact when agent_before_settle continues for another turn.",
	"- Included <question> context and filtered out intermediate tool-call chatter.",
].join("\n");

function withTempAgentDir(fn: (dir: string) => Promise<void>) {
	return async () => {
		const prev = process.env.PI_CODING_AGENT_DIR;
		const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pi-hl-test-"));
		process.env.PI_CODING_AGENT_DIR = tmp;
		try {
			await fn(tmp);
		} finally {
			if (prev === undefined) delete process.env.PI_CODING_AGENT_DIR;
			else process.env.PI_CODING_AGENT_DIR = prev;
			fs.rmSync(tmp, { recursive: true, force: true });
		}
	};
}

function install(flags: Record<string, string | boolean | undefined> = {}) {
	const handlers = new Map<string, Handler>();
	const commands = new Map<string, { handler: (args: string, ctx: ExtensionContext) => Promise<void> }>();
	let renderer:
		| ((
				entry: { data?: HighLevelCard },
				options: Partial<EntryRenderOptions>,
				theme: Theme,
		  ) => { render: (width: number) => string[]; handleMouse?: (event: any) => any } | undefined)
		| undefined;
	const appended: { type: string; data: HighLevelCard }[] = [];
	const sent: string[] = [];

	const pi = {
		on(event: string, handler: Handler) {
			handlers.set(event, handler);
			return () => undefined;
		},
		registerCommand(name: string, options: { handler: (args: string, ctx: ExtensionContext) => Promise<void> }) {
			commands.set(name, options);
		},
		registerFlag() {},
		getFlag(name: string) {
			return flags[name];
		},
		registerEntryRenderer(_type: string, render: NonNullable<typeof renderer>) {
			renderer = render;
		},
		appendEntry(type: string, data: HighLevelCard) {
			appended.push({ type, data });
		},
		sendUserMessage(text: string) {
			sent.push(text);
		},
	};

	extension(pi as unknown as ExtensionAPI);
	return { handlers, commands, appended, sent, render: () => renderer };
}

function theme(withBg = true): Theme {
	const identity = (text: string) => text;
	return {
		fg: (_color: string, text: string) => text,
		...(withBg ? { bg: (_color: string, text: string) => `\u001b[48;5;236m${text}\u001b[49m` } : {}),
		bold: identity,
		italic: identity,
		underline: identity,
		strikethrough: identity,
	} as unknown as Theme;
}

function context(
	overrides: Partial<ExtensionContext> & {
		branch?: unknown[];
		summaryLines?: string;
		availableModels?: { provider: string; id: string; api?: string; authed?: boolean }[];
	} = {},
) {
	const notices: string[] = [];
	const statuses: (string | undefined)[] = [];
	const streamCalls: { model: { provider?: string; id: string }; prompt: string; options: Record<string, unknown> }[] = [];
	const models = overrides.availableModels ?? [
		{ provider: "anthropic", id: "claude-opus-4-6", authed: true },
		{ provider: "anthropic", id: "claude-haiku-4-5", authed: true },
	];
	const branch = overrides.branch ?? [
		{ id: "u-1", type: "message", message: { role: "user", content: "How did we improve pi-high-level?" } },
		{ id: "a-1", type: "message", message: { role: "assistant", content: [{ type: "text", text: SUBSTANTIVE_ANSWER }] } },
	];

	const ctx = {
		hasUI: true,
		model: models[0],
		signal: undefined,
		modelRegistry: {
			getAll: () => models,
			getAvailable: () => models.filter((m) => m.authed !== false),
			find: (provider: string, id: string) => models.find((m) => m.provider === provider && m.id === id),
			hasConfiguredAuth: (m: { authed?: boolean }) => m.authed !== false,
			streamSimple: (
				model: { provider?: string; id: string },
				req: { messages: { content: { text: string }[] }[] },
				options: Record<string, unknown>,
			) => {
				streamCalls.push({
					model,
					prompt: req.messages[0]?.content[0]?.text ?? "",
					options,
				});
				return {
					result: async () => ({
						content: [
							{
								type: "text",
								text: overrides.summaryLines ?? "- Added abortable, timed summary requests.\n- Preserved queue state across multi-turn flows.",
							},
						],
						stopReason: "stop",
					}),
				};
			},
		},
		ui: {
			theme: theme(false),
			notify: (message: string) => {
				notices.push(message);
			},
			setStatus: (_key: string, value: string | undefined) => {
				statuses.push(value);
			},
		},
		isIdle: () => true,
		sessionManager: {
			getBranch: (fromId?: string) => {
				if (!fromId) return branch;
				const index = branch.findIndex((entry) => (entry as { id?: string }).id === fromId);
				return index < 0 ? [] : branch.slice(0, index + 1);
			},
			getEntries: () => branch,
		},
		...overrides,
		notices,
		statuses,
		streamCalls,
		get calls() {
			return streamCalls.length;
		},
	};
	return ctx as unknown as ExtensionContext & {
		notices: string[];
		statuses: (string | undefined)[];
		streamCalls: typeof streamCalls;
		calls: number;
	};
}

test(
	"a marked prompt passes <question>, cacheRetention=none, signal, and renders narrow/expanded boxes cleanly",
	withTempAgentDir(async () => {
		const { handlers, render } = install({ "hl-model": "auto" });
		const ctx = context({
			summaryLines: "Line 1\nLine 2\nLine 3\nLine 4\nLine 5\nLine 6\nLine 7",
		});

		const input = await handlers.get("input")?.(
			{ source: "interactive", text: "How did we improve pi-high-level? +hl", images: undefined } as never,
			ctx,
		);
		assert.deepEqual(input, { action: "transform", text: "How did we improve pi-high-level?", images: undefined });
		assert.equal(ctx.statuses.at(-1), "HL: armed");

		await handlers.get("before_agent_start")?.({ messageType: "user", prompt: "How did we improve pi-high-level?" } as never, ctx);

		// Another extension asks for one continuation turn (`continue: true`): must wait!
		const midContinue = await handlers.get("agent_before_settle")?.(
			{
				outcome: "completed",
				continue: true,
				entries: [],
				context: {
					pendingMessages: [],
					contextMessages: [
						{ role: "user", content: "How did we improve pi-high-level?" },
						{ role: "assistant", content: SUBSTANTIVE_ANSWER },
					],
				},
			} as never,
			ctx,
		);
		assert.equal(midContinue, undefined);
		assert.equal(ctx.calls, 0);

		// Final settle runs with lightweight model + question + signal/options
		const settled = await handlers.get("agent_before_settle")?.(
			{
				outcome: "completed",
				continue: false,
				entries: [{ type: "custom", customType: "other" }],
				context: {
					pendingMessages: [],
					contextMessages: [
						{ role: "user", content: "How did we improve pi-high-level?" },
						{ role: "assistant", stopReason: "toolUse", content: [{ type: "text", text: "Let me inspect index.ts..." }, { type: "toolCall", name: "read" }] },
						{ id: "a-final", role: "assistant", stopReason: "stop", content: [{ type: "thinking", text: "hidden" }, { type: "text", text: SUBSTANTIVE_ANSWER }] },
					],
				},
			} as never,
			ctx,
		);

		assert.equal(ctx.calls, 1);
		assert.equal(ctx.streamCalls[0]?.model.id, "claude-haiku-4-5");
		assert.equal(ctx.streamCalls[0]?.options.reasoning, "minimal");
		assert.equal(ctx.streamCalls[0]?.options.cacheRetention, "none");
		assert.equal(ctx.streamCalls[0]?.options.toolChoice, "none");
		assert.equal(ctx.streamCalls[0]?.options.maxTokens, 1_344);
		assert.ok(ctx.streamCalls[0]?.options.signal instanceof AbortSignal);
		assert.match(ctx.streamCalls[0]?.prompt ?? "", /<question>\nHow did we improve pi-high-level\?\n<\/question>/);
		assert.doesNotMatch(ctx.streamCalls[0]?.prompt ?? "", /Let me inspect index\.ts/);

		const result = settled as { entries: { type: string; customType: string; data: HighLevelCard }[] };
		assert.equal(result.entries.length, 2);
		const card = result.entries[1]!.data;
		assert.equal(card.model, "anthropic/claude-haiku-4-5");
		assert.equal(card.targetEntryId, "a-1");

		// Collapsed view truncates >5 lines and respects narrow widths (10 cols, 32 cols) without overflow
		const collapsed = render()?.({ data: card }, { expanded: false, keyHint: () => "ctrl+o to expand", keyText: () => "ctrl+o" }, theme(true));
		for (const width of [5, 10, 32]) {
			const lines = collapsed?.render(width) ?? [];
			assert.ok(lines.length > 0);
			for (const line of lines) {
				assert.equal(visibleWidth(line), width);
			}
		}
		assert.match((collapsed?.render(48) ?? []).join("\n"), /\+2 lines \(ctrl\+o to expand\)/);
		collapsed?.handleMouse?.({ type: "click", button: "left" });
		assert.match((collapsed?.render(64) ?? []).join("\n"), /Line 7/);
		collapsed?.handleMouse?.({ type: "click", button: "left" });
		assert.doesNotMatch((collapsed?.render(64) ?? []).join("\n"), /Line 7/);

		// Expanded view shows all 7 lines + model/duration metadata
		const expanded = render()?.({ data: card }, { expanded: true }, theme(false));
		const expandedText = (expanded?.render(64) ?? []).join("\n");
		assert.match(expandedText, /Line 7/);
		assert.match(expandedText, /anthropic\/claude-haiku-4-5/);
	}),
);

test(
	"Esc abort and request timeout unblock summarizeExchange immediately",
	withTempAgentDir(async (dir) => {
		const { commands, handlers } = install();
		const abortController = new AbortController();
		let abortedStream = false;

		const ctxAbort = context({
			signal: abortController.signal,
			modelRegistry: {
				hasConfiguredAuth: () => true,
				streamSimple: () => ({
					abort: () => {
						abortedStream = true;
					},
					result: () => new Promise(() => {}), // Hung provider stream
				}),
			} as unknown as ExtensionContext["modelRegistry"],
		});

		setTimeout(() => abortController.abort(), 15);
		await commands.get("hl")?.handler("", ctxAbort);
		assert.equal(abortedStream, true);
		assert.equal(ctxAbort.notices.length, 0); // Silent on user Esc abort

		fs.writeFileSync(path.join(dir, "pi-high-level.json"), JSON.stringify({ timeoutMs: 3_000 }));
		let timedOutStream = false;
		const ctxErr = context({
			modelRegistry: {
				hasConfiguredAuth: () => true,
				streamSimple: (_model: unknown, _req: unknown, opts: { signal: AbortSignal }) => ({
					abort: () => {
						timedOutStream = true;
					},
					result: () =>
						new Promise((_resolve, reject) => {
							opts.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
						}),
				}),
			} as unknown as ExtensionContext["modelRegistry"],
		});
		await handlers.get("session_start")?.({ reason: "startup" } as never, ctxErr);
		// The production timeout is unref'd; keep this isolated test process alive until it fires.
		const keepAlive = setTimeout(() => undefined, 3_100);
		await commands.get("hl")?.handler("", ctxErr);
		clearTimeout(keepAlive);
		assert.equal(timedOutStream, true);
		assert.match(ctxErr.notices.at(-1) ?? "", /timed out/);
	}),
);

test(
	"queued followUp with +hl summarizes the followUp reply rather than the earlier unmarked reply",
	withTempAgentDir(async () => {
		const { handlers } = install();
		const ctx = context();

		// 1. Idle unmarked prompt starts
		await handlers.get("input")?.({ source: "interactive", text: "first task" } as never, ctx);
		await handlers.get("before_agent_start")?.({ messageType: "user" } as never, ctx);
		await handlers.get("message_start")?.({ message: { role: "user", content: "first task" } } as never, ctx);

		// 2. While streaming, user queues a followUp WITH +hl
		const followUpInput = await handlers.get("input")?.(
			{ source: "interactive", text: "second task +hl", streamingBehavior: "followUp" } as never,
			ctx,
		);
		assert.deepEqual(followUpInput, { action: "transform", text: "second task", images: undefined });

		// 3. First task's turn ends while followUp is queued -> must NOT summarize first task!
		const turn1End = await handlers.get("turn_end")?.(
			{
				outcome: "completed",
				continue: false,
				entries: [],
				toolResults: [],
				message: { role: "assistant", stopReason: "stop", content: SUBSTANTIVE_ANSWER },
				context: {
					pendingMessages: [{ role: "user", content: "second task" }],
					contextMessages: [
						{ role: "user", content: "first task" },
						{ role: "assistant", content: SUBSTANTIVE_ANSWER },
					],
				},
			} as never,
			ctx,
		);
		assert.equal(turn1End, undefined);
		assert.equal(ctx.calls, 0);

		// 4. Queued followUp starts (`message_start` without `before_agent_start`) and settles -> summarizes!
		await handlers.get("message_start")?.({ message: { role: "user", content: "second task" } } as never, ctx);
		const settled = await handlers.get("agent_before_settle")?.(
			{
				outcome: "completed",
				continue: false,
				entries: [],
				context: {
					pendingMessages: [],
					contextMessages: [
						{ role: "user", content: "second task" },
						{ role: "assistant", content: SUBSTANTIVE_ANSWER },
					],
				},
			} as never,
			ctx,
		);
		assert.equal(ctx.calls, 1);
		assert.equal((settled as { entries: unknown[] }).entries.length, 1);
	}),
);

test(
	"short 1-2 sentence replies are skipped without calling the summary model",
	withTempAgentDir(async () => {
		const { commands, appended } = install();
		const ctx = context({
			branch: [
				{ id: "u-1", type: "message", message: { role: "user", content: "Should we use A or B?" } },
				{ id: "a-1", type: "message", message: { role: "assistant", content: "Use Option B." } },
			],
		});
		await commands.get("hl")?.handler("", ctx);
		assert.equal(ctx.calls, 0);
		assert.equal(appended.length, 0);
		assert.match(ctx.notices.at(-1) ?? "", /already brief/);
	}),
);

test(
	"duplicate /hl is blocked and a standalone +hl toggles the active reply without queuing input",
	withTempAgentDir(async () => {
		const { handlers, commands, appended, sent } = install();
		assert.deepEqual([...commands.keys()].sort(), ["hl", "hl-history", "hl-settings", "hl-status"]);
		const branch: unknown[] = [
			{ id: "u-1", type: "message", message: { role: "user", content: "Explain the change" } },
			{ id: "a-1", type: "message", message: { role: "assistant", content: SUBSTANTIVE_ANSWER } },
		];
		const ctx = context({ branch });

		await commands.get("hl")?.handler("", ctx);
		assert.equal(appended.length, 1);
		branch.push({ id: "c-1", type: "custom", customType: HIGH_LEVEL_ENTRY, data: appended[0]!.data });
		await commands.get("hl")?.handler("", ctx);
		assert.equal(appended.length, 1);
		assert.deepEqual(sent, ["/hl-history"]);

		const streamingCtx = context({ isIdle: () => false });
		for (const expected of ["HL: armed", undefined]) {
			const result = await handlers.get("input")?.(
				{ source: "interactive", text: "+hl", streamingBehavior: "followUp" } as never,
				streamingCtx,
			);
			assert.deepEqual(result, { action: "handled" });
			assert.equal(streamingCtx.statuses.at(-1), expected);
			assert.equal(streamingCtx.calls, 0);
		}
	}),
);

test(
	"auto mode loaded from settings summarizes long replies",
	withTempAgentDir(async (dir) => {
		fs.writeFileSync(path.join(dir, "pi-high-level.json"), JSON.stringify({ auto: { enabled: true, minChars: 300, minLines: 28 } }));
		const { handlers } = install();
		const ctx = context();
		await handlers.get("session_start")?.({ reason: "startup" } as never, ctx);

		await handlers.get("input")?.({ source: "interactive", text: "deep dive" } as never, ctx);
		await handlers.get("before_agent_start")?.({ messageType: "user" } as never, ctx);
		const settled = await handlers.get("agent_before_settle")?.(
			{
				outcome: "completed",
				continue: false,
				entries: [],
				context: {
					pendingMessages: [],
					contextMessages: [
						{ role: "user", content: "deep dive" },
						{ role: "assistant", content: "A".repeat(420) },
					],
				},
			} as never,
			ctx,
		);
		assert.equal(ctx.calls, 1);
		assert.equal((settled as { entries: { data: HighLevelCard }[] }).entries[0]?.data.trigger, "auto");
	}),
);

test(
	"session startup creates the default config and backfills the prompt in legacy configs",
	withTempAgentDir(async (dir) => {
		const { handlers } = install();
		const ctx = context({ mode: "tui" });
		const file = path.join(dir, "pi-high-level.json");
		const start = () => handlers.get("session_start")?.({ reason: "startup" } as never, ctx);
		await start();
		assert.equal(JSON.parse(fs.readFileSync(file, "utf8")).prompt, DEFAULT_SUMMARY_PROMPT);

		const legacy = { model: "auto", auto: { enabled: true, minChars: 700 }, fallbackMenu: false };
		fs.writeFileSync(file, JSON.stringify(legacy));
		await start();
		assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")), { ...legacy, prompt: DEFAULT_SUMMARY_PROMPT });
	}),
);

test(
	"summaries read prompt edits from JSON and settings can reset them",
	withTempAgentDir(async (dir) => {
		const { handlers, commands } = install();
		const ctx = context({ mode: "tui" });
		const file = path.join(dir, "pi-high-level.json");
		const custom = { prompt: "Extract the key decision.\n\n{{answer}}\n" };
		const original = JSON.stringify(custom);
		fs.writeFileSync(file, original);
		await handlers.get("session_start")?.({ reason: "startup" } as never, ctx);
		assert.equal(fs.readFileSync(file, "utf8"), original);

		fs.writeFileSync(file, JSON.stringify({ ...custom, prompt: "Summarize the next step.\n\n{{answer}}" }));
		await commands.get("hl")?.handler("", ctx);
		assert.match(ctx.streamCalls[0]?.prompt ?? "", /^Summarize the next step\./);

		const choices = ["Prompt: inline custom", "Reset to built-in prompt", "Done"];
		(ctx.ui as any).select = async () => choices.shift();
		await commands.get("hl-settings")?.handler("", ctx);
		assert.equal(JSON.parse(fs.readFileSync(file, "utf8")).prompt, DEFAULT_SUMMARY_PROMPT);
	}),
);

test(
	"Codex Responses summaries leave tool choice at the SDK default",
	withTempAgentDir(async () => {
		const model = { provider: "sub2api-mixed", id: "k3.1-pro", api: "openai-codex-responses" };
		const { commands } = install({ "hl-model": "sub2api-mixed/k3.1-pro" });
		const ctx = context({ availableModels: [model] });

		await commands.get("hl")?.handler("", ctx);
		assert.deepEqual(ctx.streamCalls[0]?.model, model);
		assert.equal(ctx.streamCalls[0]?.options.toolChoice, undefined);
	}),
);

test(
	"settings saves an inline prompt in the shared JSON and uses it for summaries",
	withTempAgentDir(async (dir) => {
		const { commands } = install();
		const ctx = context({ mode: "tui" });
		const choices = ["Prompt: built-in", "Edit inline prompt", "Done"];
		(ctx.ui as any).select = async () => choices.shift();
		(ctx.ui as any).editor = async () => "Summarize this answer in two bullets.\n\n{{answer}}";

		await commands.get("hl-settings")?.handler("", ctx);
		const saved = JSON.parse(fs.readFileSync(path.join(dir, "pi-high-level.json"), "utf8"));
		assert.equal(saved.prompt, "Summarize this answer in two bullets.\n\n{{answer}}");
		assert.equal("promptFile" in saved, false);

		await commands.get("hl")?.handler("", ctx);
		assert.match(ctx.streamCalls[0]?.prompt ?? "", /^Summarize this answer in two bullets\./);
		assert.doesNotMatch(ctx.streamCalls[0]?.prompt ?? "", /Summarize the assistant's final answer/);
	}),
);

test(
	"history lists only this session's cards and opens the original reply through tree navigation",
	withTempAgentDir(async () => {
		const { commands } = install();
		const branch = [
			{ id: "u-1", type: "message", message: { role: "user", content: "question" } },
			{ id: "a-1", type: "message", message: { role: "assistant", content: SUBSTANTIVE_ANSWER } },
			{ id: "c-1", type: "custom", customType: HIGH_LEVEL_ENTRY, data: { summary: "saved summary", targetEntryId: "a-1", model: "test/model" } },
		];
		const navigated: string[] = [];
		const ctx = context({
			branch,
			mode: "tui",
			navigateTree: async (targetId: string) => {
				navigated.push(targetId);
				return { cancelled: false };
			},
		} as any);
		const components: { handleInput(data: string): void; render(width: number): readonly string[] }[] = [];
		(ctx.ui as any).custom = (factory: any) => new Promise((resolve) => {
			components.push(factory({ requestRender() {} }, theme(false), {}, resolve));
		});

		const history = commands.get("hl-history")?.handler("", ctx);
		assert.equal(components.length, 1);
		assert.ok((components[0]?.render(60).length ?? 0) > 0);
		components[0]?.handleInput("\r");
		await new Promise((resolve) => setImmediate(resolve));
		assert.equal(components.length, 2);
		assert.ok((components[1]?.render(60).length ?? 0) > 0);
		components[1]?.handleInput("\r");
		await history;
		assert.deepEqual(navigated, ["a-1"]);
		assert.match(ctx.notices.at(-1) ?? "", /new prompts continue/);
	}),
);

test(
	"truncated summaries are rejected instead of being saved",
	withTempAgentDir(async () => {
		const { commands, appended } = install();
		const ctx = context({
			modelRegistry: {
				hasConfiguredAuth: () => true,
				streamSimple: () => ({ result: async () => ({ content: "incomplete", stopReason: "length" }) }),
			} as unknown as ExtensionContext["modelRegistry"],
		});
		await commands.get("hl")?.handler("", ctx);
		assert.equal(appended.length, 0);
		assert.match(ctx.notices.at(-1) ?? "", /truncated/);
	}),
);

test(
	"failed runs never call the summary model",
	withTempAgentDir(async () => {
		const { handlers } = install();
		const ctx = context();
		await handlers.get("input")?.({ source: "interactive", text: "explain +hl" } as never, ctx);
		await handlers.get("before_agent_start")?.({ messageType: "user" } as never, ctx);
		const failed = await handlers.get("agent_before_settle")?.(
			{ outcome: "error", continue: false, entries: [], context: { pendingMessages: [], contextMessages: [] } } as never,
			ctx,
		);
		assert.equal(failed, undefined);
		assert.equal(ctx.calls, 0);
	}),
);

test(
	"summary thinking level is selectable and used for the provider request",
	withTempAgentDir(async (dir) => {
		const { commands } = install();
		const ctx = context({ mode: "tui" });
		const choices = ["Summary thinking: Minimal", "High", "Done"];
		(ctx.ui as any).select = async () => choices.shift();

		await commands.get("hl-settings")?.handler("", ctx);
		const saved = JSON.parse(fs.readFileSync(path.join(dir, "pi-high-level.json"), "utf8"));
		assert.equal(saved.thinking, "high");
		assert.equal(saved.mode, "manual");

		await commands.get("hl")?.handler("", ctx);
		assert.equal(ctx.streamCalls[0]?.options.reasoning, "high");
	}),
);

test(
	"the settings mode picker saves a threshold-specific summary mode",
	withTempAgentDir(async (dir) => {
		const { commands } = install();
		const ctx = context({ mode: "tui" });
		const choices = ["Summary mode: Manual", "Minimal characters", "Done"];
		(ctx.ui as any).select = async () => choices.shift();
		(ctx.ui as any).input = async () => "500";

		await commands.get("hl-settings")?.handler("", ctx);
		const saved = JSON.parse(fs.readFileSync(path.join(dir, "pi-high-level.json"), "utf8"));
		assert.equal(saved.mode, "minChars");
		assert.equal(saved.auto.minChars, 500);
		assert.equal(saved.auto.minLines, 28);
	}),
);

test(
	"the starline pill opens a status bubble with settings and history actions",
	withTempAgentDir(async () => {
		const registered = new Map<string, (input: { ctx: ExtensionContext; pill?: unknown }) => void>();
		const bubbles: { content: { title?: string; body: unknown[] }; pill?: unknown }[] = [];
		const api = {
			version: 1,
			register(key: string, action: (input: { ctx: ExtensionContext; pill?: unknown }) => void) {
				registered.set(key, action);
				return () => registered.delete(key);
			},
			showBubble(
				_ctx: ExtensionContext,
				source: { title?: string; body: unknown[] } | (() => { title?: string; body: unknown[] }),
				pill?: unknown,
			) {
				bubbles.push({ content: typeof source === "function" ? source() : source, pill });
				return { refresh() {}, close() {}, onClose() {} };
			},
		};
		const symbol = Symbol.for("pi-starline.pill-api.v1");
		(globalThis as any)[symbol] = api;
		try {
			const { handlers } = install();
			const ctx = context({ mode: "tui" });
			await handlers.get("session_start")?.({ reason: "startup" } as never, ctx);

			assert.ok(registered.has("high-level"));
			assert.equal(ctx.statuses.at(-1), "HL: ready");

			registered.get("high-level")!({ ctx });
			assert.equal(bubbles.length, 1);
			const body = bubbles[0]!.content.body as (string | { text: string })[];
			const text = body.map((line) => (typeof line === "string" ? line : line.text)).join("\n");
			assert.match(text, /Mode:\s+Manual/);
			assert.match(text, /Thinking:\s+Minimal/);
			assert.match(text, /Summarize latest reply/);
			assert.match(text, /Settings/);

			const settings = body.find(
				(line): line is { text: string; onSelect: () => void } =>
					typeof line === "object" && line.text.includes("Settings"),
			);
			settings?.onSelect();
			await new Promise((resolve) => setImmediate(resolve));
			assert.equal(bubbles.length, 2);
			const settingsBody = bubbles[1]!.content.body as (string | { text: string })[];
			const settingsText = settingsBody
				.map((line) => (typeof line === "string" ? line : line.text))
				.join("\n");
			assert.match(settingsText, /Summary mode: Manual/);
			assert.match(settingsText, /Summary thinking: Minimal/);
		} finally {
			delete (globalThis as any)[symbol];
		}
	}),
);

test(
	"the native fallback menu can be disabled when pi-starline is absent",
	withTempAgentDir(async (dir) => {
		fs.writeFileSync(path.join(dir, "pi-high-level.json"), JSON.stringify({ fallbackMenu: false }));
		const { commands } = install();
		const ctx = context({ mode: "tui" });
		await commands.get("hl-settings")?.handler("", ctx);
		assert.match(ctx.notices.at(-1) ?? "", /menus are disabled/);
	}),
);

test(
	"slash commands submitted as plain prompts are handled by the input hook",
	withTempAgentDir(async () => {
		const { handlers, sent } = install();
		const ctx = context();
		(ctx.ui as any).select = async () => "Close";

		assert.deepEqual(
			await handlers.get("input")?.({ source: "rpc", text: "/hl-status" } as never, ctx),
			{ action: "handled" },
		);
		assert.deepEqual(
			await handlers.get("input")?.({ source: "extension", text: "/hl-history" } as never, ctx),
			{ action: "handled" },
		);
		assert.deepEqual(sent, ["/hl-history"]);

		assert.deepEqual(
			await handlers.get("input")?.({ source: "interactive", text: "/hl-history extra" } as never, ctx),
			{ action: "handled" },
		);
		assert.match(ctx.notices.at(-1) ?? "", /Usage: \/hl-history/);
	}),
);

test(
	"history opens an empty picker when the session has no high-level cards",
	withTempAgentDir(async () => {
		const { commands } = install();
		const ctx = context({ mode: "tui" });
		const components: { handleInput(data: string): void; render(width: number): readonly string[] }[] = [];
		(ctx.ui as any).custom = (factory: any) =>
			new Promise((resolve) => {
				components.push(factory({ requestRender() {} }, theme(false), {}, resolve));
			});

		const history = commands.get("hl-history")?.handler("", ctx);
		assert.equal(components.length, 1);
		const text = components[0]?.render(60).join("\n") ?? "";
		assert.match(text, /No high-level summaries in this session yet/);
		assert.match(text, /esc close/);
		components[0]?.handleInput("\u001b");
		await history;
	}),
);
