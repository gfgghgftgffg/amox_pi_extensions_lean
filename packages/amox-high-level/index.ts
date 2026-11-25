import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	type EntryRenderOptions,
	type ExtensionAPI,
	type ExtensionCommandContext,
	type ExtensionContext,
	type Theme,
} from "@earendil-works/pi-coding-agent";
import {
	Container,
	Markdown,
	type MarkdownTheme,
	MouseRegion,
	SelectList,
	type SelectItem,
	Text,
	truncateToWidth,
	visibleWidth,
} from "@earendil-works/pi-tui";
import {
	type BranchEntryLike,
	BUILTIN_SUMMARY_INSTRUCTIONS,
	buildSummaryPrompt,
	type ChatMessage,
	collectHighLevelHistory,
	defaultConfig,
	extractTurnExchange,
	formatCardMeta,
	frameLines,
	HIGH_LEVEL_ENTRY,
	type HighLevelCard,
	type HighLevelConfig,
	type HighLevelHistoryItem,
	hasExistingCardForLatestReply,
	hasToolCalls,
	isAnswerTooShort,
	MAX_COLLAPSED_LINES,
	type ModelCandidate,
	clampSummaryThinking,
	messageText,
	MIN_ANSWER_LINES,
	normalizeConfig,
	parseModeSpec,
	parseThinkingLevel,
	pickSummaryModel,
	RunTracker,
	shouldAutoSummarize,
	summaryMaxTokens,
	type SummaryMode,
	SUMMARY_MODES,
	SUMMARY_THINKING_LEVELS,
	type SummaryThinking,
	type SummaryTrigger,
	stripHighLevelMarker,
	type TurnExchange,
} from "./core.ts";

interface ModelLike extends ModelCandidate {
	api?: string;
	maxTokens?: number;
	thinkingLevelMap?: Record<string, string | null | undefined>;
}

interface PillAnchor {
	key?: string;
	startColumn?: number;
	endColumn?: number;
	centerColumn: number;
	terminalWidth: number;
	background: string;
	foreground: string;
}

type PillBubbleLine = string | { text: string; onSelect: () => void; current?: boolean };
type PillBubbleContent = { title?: string; body: PillBubbleLine[]; hint?: string };
type PillBubbleHandle = {
	refresh(): void;
	close(): void;
	onClose(callback: () => void): void;
};
type PillApi = {
	version: number;
	register(key: string, action: (input: { ctx: ExtensionContext; pill?: PillAnchor }) => void): () => void;
	showBubble(
		ctx: ExtensionContext,
		source: PillBubbleContent | (() => PillBubbleContent),
		pill?: PillAnchor,
	): PillBubbleHandle | undefined;
};

type Tone = "text" | "muted" | "dim" | "accent" | "success" | "warning" | "error";
type DetailRow = { label: string; value: string; tone?: Tone };
type SelectChoice = { value: string; label: string };

const STATUS_KEY = HIGH_LEVEL_ENTRY;
const MENU_HINT = "↑↓ Enter Esc";
const MODE_LABELS: Record<SummaryMode, string> = {
	manual: "Manual",
	auto: "Auto",
	minChars: "Minimal characters",
	minLines: "Minimal lines",
};
const THINKING_LABELS: Record<SummaryThinking, string> = {
	off: "Off",
	minimal: "Minimal",
	low: "Low",
	medium: "Medium",
	high: "High",
	xhigh: "Extra high",
	max: "Max",
};
const pillAPI = () =>
	(globalThis as Record<symbol, unknown>)[Symbol.for("pi-starline.pill-api.v1")] as PillApi | undefined;
const menuAPI = (ctx: ExtensionContext) => (ctx.mode === "rpc" ? undefined : pillAPI());

function resolveConfigPath(): string {
	const dir = process.env.PI_CODING_AGENT_DIR?.trim() || path.join(os.homedir(), ".pi", "agent");
	return path.join(dir, "pi-high-level.json");
}

function loadConfig(): HighLevelConfig {
	try {
		return normalizeConfig(JSON.parse(fs.readFileSync(resolveConfigPath(), "utf8")));
	} catch {
		return defaultConfig();
	}
}

function saveConfig(config: HighLevelConfig): boolean {
	try {
		const filePath = resolveConfigPath();
		fs.mkdirSync(path.dirname(filePath), { recursive: true });
		const payload: Record<string, unknown> = {
			...(config.model ? { model: config.model } : {}),
			thinking: config.thinking,
			mode: config.mode,
			timeoutMs: config.timeoutMs,
			auto: config.auto,
			fallbackMenu: config.fallbackMenu,
			...(config.prompt ? { prompt: config.prompt } : {}),
		};
		fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
		return true;
	} catch {
		return false;
	}
}

function markdownTheme(theme: Theme): MarkdownTheme {
	return {
		heading: (text) => theme.fg("accent", text),
		link: (text) => theme.fg("accent", text),
		linkUrl: (text) => theme.fg("muted", text),
		code: (text) => theme.fg("accent", text),
		codeBlock: (text) => theme.fg("muted", text),
		codeBlockBorder: (text) => theme.fg("border", text),
		quote: (text) => theme.fg("muted", text),
		quoteBorder: (text) => theme.fg("border", text),
		hr: (text) => theme.fg("border", text),
		listBullet: (text) => theme.fg("accent", text),
		bold: (text) => theme.bold(text),
		italic: (text) => theme.italic(text),
		strikethrough: (text) => theme.strikethrough(text),
		underline: (text) => theme.underline(text),
	};
}

function selectTheme(theme: Theme) {
	return {
		selectedPrefix: (text: string) => theme.fg("accent", text),
		selectedText: (text: string) => theme.fg("accent", text),
		description: (text: string) => theme.fg("muted", text),
		scrollInfo: (text: string) => theme.fg("dim", text),
		noMatch: (text: string) => theme.fg("warning", text),
	};
}

function expandHintText(options: Partial<EntryRenderOptions> | undefined): string {
	if (options && typeof options.keyHint === "function") {
		const hint = options.keyHint("app.tools.expand", "to expand");
		if (hint) return hint;
	}
	return "ctrl+o to expand";
}

function renderCard(card: HighLevelCard, options: Partial<EntryRenderOptions> | undefined, theme: Theme) {
	const textStyle =
		typeof theme.fg === "function"
			? { color: (text: string) => theme.fg("customMessageText", text) }
			: undefined;
	const markdown = new Markdown(card.summary, 0, 0, markdownTheme(theme), textStyle);
	let expanded = Boolean(options?.expanded);
	const meta = formatCardMeta(card);
	const paintBg =
		typeof theme.bg === "function" ? (line: string) => theme.bg("customMessageBg", line) : undefined;

	const component = {
		invalidate() {
			markdown.invalidate();
		},
		render(width: number) {
			const columns = Math.floor(width);
			if (columns <= 0) return [];
			const inner = Math.max(1, columns < 6 ? columns : columns - 4);
			const rawLines = markdown.render(inner).map((line) => truncateToWidth(line, inner, "", false));

			let body: string[];
			if (!expanded && rawLines.length > MAX_COLLAPSED_LINES) {
				const hiddenCount = rawLines.length - MAX_COLLAPSED_LINES;
				const hint = truncateToWidth(`… +${hiddenCount} lines (${expandHintText(options)})`, inner, "…", false);
				body = [...rawLines.slice(0, MAX_COLLAPSED_LINES), theme.fg("dim", hint)];
			} else if (expanded && meta) {
				const metaLine = truncateToWidth(meta, inner, "…", false);
				body = [...rawLines, theme.fg("dim", metaLine)];
			} else {
				body = rawLines;
			}

			return frameLines(body, columns, (text) => theme.fg("borderAccent", text), visibleWidth, paintBg);
		},
	};

	return new MouseRegion(component, (event) => {
		if (event.type !== "click" || event.button !== "left") return undefined;
		expanded = !expanded;
		return { handled: true, render: true };
	});
}

function sessionEntries(ctx: ExtensionContext, options: { all?: boolean; fromId?: string } = {}): BranchEntryLike[] {
	const rawEntries = options.all
		? ctx.sessionManager.getEntries()
		: ctx.sessionManager.getBranch(options.fromId);
	return rawEntries.map((entry) => {
		if (entry.type === "message" && "content" in entry.message) {
			const msg = entry.message as { role?: string; content?: unknown; stopReason?: string };
			return {
				id: "id" in entry && typeof entry.id === "string" ? entry.id : undefined,
				type: entry.type,
				message: {
					id: "id" in entry && typeof entry.id === "string" ? entry.id : undefined,
					role: msg.role,
					content: msg.content,
					stopReason: msg.stopReason,
				},
			};
		}
		return {
			id: "id" in entry && typeof entry.id === "string" ? entry.id : undefined,
			type: entry.type,
			customType: "customType" in entry && typeof entry.customType === "string" ? entry.customType : undefined,
			data: "data" in entry ? entry.data : undefined,
		};
	});
}

function branchMessages(entries: readonly BranchEntryLike[]): ChatMessage[] {
	return entries.flatMap((entry) => (entry.type === "message" && entry.message ? [entry.message] : []));
}

function resolveModel(ctx: ExtensionContext, modelSpec: string | undefined) {
	const active = ctx.model as (ModelLike & NonNullable<ExtensionContext["model"]>) | undefined;
	const registry = ctx.modelRegistry as ExtensionContext["modelRegistry"] & {
		getAll?: () => ModelLike[];
		find?: (provider: string, id: string) => ModelLike | undefined;
	};

	const candidates: ModelLike[] = [];
	if (modelSpec && modelSpec.includes("/") && typeof registry.find === "function") {
		const slash = modelSpec.indexOf("/");
		const direct = registry.find(modelSpec.slice(0, slash), modelSpec.slice(slash + 1));
		if (direct) candidates.push(direct);
	}
	if (typeof registry.getAll === "function") {
		for (const item of registry.getAll()) {
			if (!candidates.some((existing) => existing.provider === item.provider && existing.id === item.id)) {
				candidates.push(item);
			}
		}
	}
	if (active && !candidates.some((existing) => existing.provider === active.provider && existing.id === active.id)) {
		candidates.push(active);
	}

	const normalizedActive = active ? { ...active, provider: active.provider ?? "default" } : undefined;
	const normalizedCandidates = candidates.map((item) => ({ ...item, provider: item.provider ?? "default" }));
	return pickSummaryModel(
		modelSpec,
		normalizedActive,
		normalizedCandidates,
		(candidate) => registry.hasConfiguredAuth(candidate as NonNullable<ExtensionContext["model"]>),
	) as NonNullable<ExtensionContext["model"]> | undefined;
}

function raceWithAbort<T>(promise: Promise<T>, signal: AbortSignal, onAbort?: () => void): Promise<T> {
	if (signal.aborted) {
		onAbort?.();
		return Promise.reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
	}
	return new Promise<T>((resolve, reject) => {
		const abortHandler = () => {
			onAbort?.();
			reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
		};
		signal.addEventListener("abort", abortHandler, { once: true });
		promise.then(
			(value) => {
				signal.removeEventListener("abort", abortHandler);
				resolve(value);
			},
			(error) => {
				signal.removeEventListener("abort", abortHandler);
				reject(error);
			},
		);
	});
}

export default function (pi: ExtensionAPI) {
	const tracker = new RunTracker();
	let config = loadConfig();
	let summarizing = false;
	let pillAnchor: PillAnchor | undefined;
	let pillUnregister: (() => void) | undefined;
	let bubble: PillBubbleHandle | undefined;

	pi.registerFlag?.("hl-model", {
		type: "string",
		description: "Summary model for pi-high-level (provider/id, id, auto, or current)",
	});
	pi.registerFlag?.("hl-auto", {
		type: "string",
		description: "Summary mode (manual, auto, <N>c, or <N>l)",
	});
	pi.registerFlag?.("hl-thinking", {
		type: "string",
		description: `Thinking level for summaries (${SUMMARY_THINKING_LEVELS.join(", ")})`,
	});

	function effectiveConfig(): HighLevelConfig {
		const flagModel = typeof pi.getFlag === "function" ? pi.getFlag("hl-model") : undefined;
		const flagMode = typeof pi.getFlag === "function" ? pi.getFlag("hl-auto") : undefined;
		const flagThinking = typeof pi.getFlag === "function" ? pi.getFlag("hl-thinking") : undefined;
		const parsedMode =
			typeof flagMode === "string" && flagMode.trim()
				? parseModeSpec(flagMode, { mode: config.mode, auto: config.auto })
				: undefined;
		const model =
			typeof flagModel === "string" && flagModel.trim()
				? flagModel.trim() === "current"
					? undefined
					: flagModel.trim()
				: config.model;
		const thinking =
			(typeof flagThinking === "string" && parseThinkingLevel(flagThinking)) || config.thinking;
		return {
			...config,
			model,
			thinking,
			mode: parsedMode?.mode ?? config.mode,
			auto: parsedMode?.auto ?? config.auto,
		};
	}

	function updateConfig(ctx: ExtensionContext, next: HighLevelConfig, success: string): boolean {
		const normalized = normalizeConfig(next);
		if (!saveConfig(normalized)) {
			ctx.ui.notify("Could not save high-level settings", "error");
			return false;
		}
		config = normalized;
		ctx.ui.notify(success, "info");
		bubble?.refresh();
		return true;
	}

	function syncStatus(ctx: ExtensionContext): void {
		if (summarizing) ctx.ui.setStatus(STATUS_KEY, "HL: summarizing");
		else if (tracker.isArmed()) ctx.ui.setStatus(STATUS_KEY, "HL: armed");
		else if (menuAPI(ctx)) ctx.ui.setStatus(STATUS_KEY, "HL: ready");
		else ctx.ui.setStatus(STATUS_KEY, undefined);
		bubble?.refresh();
	}

	async function summarizeExchange(
		ctx: ExtensionContext,
		exchange: TurnExchange,
		trigger: SummaryTrigger,
	): Promise<HighLevelCard | undefined> {
		if (!exchange.answer.trim()) {
			if (trigger !== "auto") ctx.ui.notify("High-level needs an answer to summarize", "warning");
			return undefined;
		}
		if (isAnswerTooShort(exchange.answer)) {
			if (trigger !== "auto") ctx.ui.notify("Reply is already brief; skipped high-level summary", "info");
			return undefined;
		}

		const cfg = effectiveConfig();
		const model = resolveModel(ctx, cfg.model);
		if (!model) {
			ctx.ui.notify(
				ctx.model ? "No credentials for the high-level summary model" : "No model selected for the high-level summary",
				"warning",
			);
			return undefined;
		}

		const timeoutController = new AbortController();
		let timedOut = false;
		const timer = setTimeout(() => {
			timedOut = true;
			timeoutController.abort(new Error("High-level summary timed out"));
		}, cfg.timeoutMs);
		timer.unref?.();
		const signal = ctx.signal
			? AbortSignal.any([ctx.signal, timeoutController.signal])
			: timeoutController.signal;

		const thinking = clampSummaryThinking(cfg.thinking, (model as ModelLike).thinkingLevelMap);
		const startedAt = Date.now();
		summarizing = true;
		syncStatus(ctx);
		try {
			const stream = ctx.modelRegistry.streamSimple(
				model,
				{
					messages: [
						{
							role: "user",
							content: [{ type: "text", text: buildSummaryPrompt(exchange, cfg.prompt) }],
							timestamp: startedAt,
						},
					],
				},
				{
					reasoning: thinking === "off" ? undefined : thinking,
					toolChoice: "none",
					cacheRetention: "none",
					maxTokens: summaryMaxTokens(thinking, (model as ModelLike).maxTokens),
					disableContinuation: true,
					timeoutMs: cfg.timeoutMs,
					signal,
				},
			) as {
				result: () => Promise<{ content: unknown; errorMessage?: string; stopReason?: string }>;
				abort?: () => void;
			};

			const response = await raceWithAbort(stream.result(), signal, () => stream.abort?.());
			if (response.stopReason === "aborted") {
				if (timedOut && !ctx.signal?.aborted) ctx.ui.notify("High-level summary timed out", "warning");
				return undefined;
			}
			if (response.errorMessage || response.stopReason === "error") {
				ctx.ui.notify(response.errorMessage || "High-level summary failed", "error");
				return undefined;
			}
			if (response.stopReason === "length") {
				ctx.ui.notify("High-level summary was truncated; try a lower thinking level", "warning");
				return undefined;
			}

			const summary = messageText(response.content);
			if (!summary) {
				ctx.ui.notify("High-level summary was empty", "warning");
				return undefined;
			}
			return {
				summary,
				model: model.provider ? `${model.provider}/${model.id}` : model.id,
				durationMs: Math.max(0, Date.now() - startedAt),
				sourceChars: exchange.answer.length,
				targetEntryId: exchange.targetEntryId,
				trigger,
				timestamp: Date.now(),
			};
		} catch (error) {
			if (ctx.signal?.aborted) return undefined;
			if (timedOut) {
				ctx.ui.notify("High-level summary timed out", "warning");
				return undefined;
			}
			ctx.ui.notify(`High-level summary failed: ${error instanceof Error ? error.message : String(error)}`, "error");
			return undefined;
		} finally {
			clearTimeout(timer);
			summarizing = false;
			syncStatus(ctx);
		}
	}

	function framedOverlay(theme: Theme, child: Container) {
		const paintBg = typeof theme.bg === "function"
			? (line: string) => theme.bg("customMessageBg", line)
			: undefined;
		return {
			invalidate: () => child.invalidate(),
			render(width: number) {
				const columns = Math.floor(width);
				const inner = Math.max(1, columns - 4);
				return frameLines(
					child.render(inner),
					columns,
					(text) => theme.fg("borderAccent", theme.bold(text)),
					visibleWidth,
					paintBg,
				);
			},
		};
	}

	async function pickHistoryItem(
		ctx: ExtensionContext,
		items: HighLevelHistoryItem[],
		focusTarget?: string,
	): Promise<HighLevelHistoryItem | undefined> {
		return ctx.ui.custom<HighLevelHistoryItem | undefined>((tui, theme, _kb, done) => {
			const container = new Container();
			container.addChild(new Text(theme.fg("accent", theme.bold("High-level history · this session")), 1, 0));
			const selectItems: SelectItem[] = items.map(({ entryId, card }) => ({
				value: entryId,
				label: card.summary.split(/\r?\n/u).find((line) => line.trim())?.trim() || "High-level summary",
				description: formatCardMeta(card),
			}));
			const listTheme = items.length > 0
				? selectTheme(theme)
				: {
						...selectTheme(theme),
						noMatch: () => theme.fg("muted", "  No high-level summaries in this session yet"),
					};
			const list = new SelectList(selectItems, Math.min(10, items.length), listTheme);
			const focused = focusTarget
				? items.findIndex(({ card }) => card.targetEntryId === focusTarget)
				: -1;
			if (focused >= 0) list.setSelectedIndex(focused);
			list.onSelect = (item) => done(items.find(({ entryId }) => entryId === item.value));
			list.onCancel = () => done(undefined);
			container.addChild(list);
			container.addChild(
				new Text(theme.fg("dim", items.length > 0 ? "↑↓ navigate · enter view · esc close" : "esc close"), 1, 0),
			);
			const view = framedOverlay(theme, container);
			return {
				capturesViewportInput: list.capturesViewportInput,
				render: (width) => view.render(width),
				invalidate: () => view.invalidate(),
				handleInput(data) {
					list.handleInput(data);
					tui.requestRender();
				},
			};
		}, { overlay: true, blocked: { kind: "question", message: "Choose a high-level summary" } });
	}

	async function pickHistoryAction(
		ctx: ExtensionContext,
		item: HighLevelHistoryItem,
	): Promise<"open" | "regenerate" | "back"> {
		const targetAvailable = Boolean(item.card.targetEntryId);
		return ctx.ui.custom((tui, theme, _kb, done) => {
			const container = new Container();
			container.addChild(new Text(theme.fg("accent", theme.bold("High-level summary")), 1, 0));
			container.addChild(new Markdown(item.card.summary, 1, 0, markdownTheme(theme)));
			const meta = formatCardMeta(item.card);
			if (meta) container.addChild(new Text(theme.fg("dim", meta), 1, 0));
			const actions = [
				...(targetAvailable ? [{ value: "open", label: "Open original (moves the session position)" }] : []),
				...(targetAvailable ? [{ value: "regenerate", label: "Regenerate this summary" }] : []),
				{ value: "back", label: "Back to history" },
			];
			const list = new SelectList(actions, actions.length, selectTheme(theme));
			list.onSelect = (action) => done(action.value as "open" | "regenerate" | "back");
			list.onCancel = () => done("back");
			container.addChild(list);
			const view = framedOverlay(theme, container);
			return {
				capturesViewportInput: list.capturesViewportInput,
				render: (width) => view.render(width),
				invalidate: () => view.invalidate(),
				handleInput(data) {
					list.handleInput(data);
					tui.requestRender();
				},
			};
		}, { overlay: true, blocked: { kind: "question", message: "Choose a high-level action" } });
	}

	async function showHistory(ctx: ExtensionCommandContext, focusTarget?: string): Promise<void> {
		if (ctx.mode !== "tui") {
			ctx.ui.notify("High-level history requires interactive mode", "warning");
			return;
		}
		let focused = focusTarget;
		for (;;) {
			const items = collectHighLevelHistory(sessionEntries(ctx, { all: true }));
			const item = await pickHistoryItem(ctx, items, focused);
			if (!item) return;
			focused = item.card.targetEntryId;
			const action = await pickHistoryAction(ctx, item);
			if (action === "back") continue;
			const targetEntryId = item.card.targetEntryId;
			if (!targetEntryId) continue;

			if (action === "open") {
				try {
					const result = await ctx.navigateTree(targetEntryId, { summarize: false });
					if (!result.cancelled) {
						ctx.ui.notify("At the original reply; new prompts continue from this position", "info");
					}
				} catch (error) {
					ctx.ui.notify(`Could not open the original reply: ${error instanceof Error ? error.message : String(error)}`, "error");
				}
				return;
			}

			const exchange = extractTurnExchange(branchMessages(sessionEntries(ctx, { fromId: targetEntryId })));
			const card = await summarizeExchange(ctx, exchange, "manual");
			if (card) pi.appendEntry<HighLevelCard>(HIGH_LEVEL_ENTRY, card);
		}
	}

	function openHistory(ctx: ExtensionContext, focusTarget?: string): void {
		if (typeof (ctx as Partial<ExtensionCommandContext>).navigateTree === "function") {
			void showHistory(ctx as ExtensionCommandContext, focusTarget).catch((error) => notifyError(ctx, error));
			return;
		}
		// Event and pill contexts lack command-only navigation; reopen through the command.
		if (!ctx.isIdle()) {
			ctx.ui.notify("Finish the current run, then use /hl-history", "warning");
			return;
		}
		pi.sendUserMessage("/hl-history", { expandPromptTemplates: true });
	}

	async function summarizeLatestOnBranch(ctx: ExtensionContext, trigger: SummaryTrigger): Promise<void> {
		const entries = sessionEntries(ctx);
		const exchange = extractTurnExchange(branchMessages(entries));
		if (hasExistingCardForLatestReply(entries, HIGH_LEVEL_ENTRY)) {
			if (exchange.targetEntryId) openHistory(ctx, exchange.targetEntryId);
			else ctx.ui.notify("High-level summary already exists for the latest reply; use /hl-history to view it", "info");
			return;
		}
		const card = await summarizeExchange(ctx, exchange, trigger);
		if (card) pi.appendEntry<HighLevelCard>(HIGH_LEVEL_ENTRY, card);
	}

	function notifyError(ctx: ExtensionContext, error: unknown): void {
		ctx.ui.notify(
			`High-level: ${error instanceof Error ? error.message : String(error)}`,
			"error",
		);
	}

	function actionText(ctx: ExtensionContext, text: string): string {
		return ctx.ui.theme.bold(`• ${text}`);
	}

	function renderRows(ctx: ExtensionContext, rows: DetailRow[]): string[] {
		const theme = ctx.ui.theme;
		return rows.map(
			(row) =>
				theme.fg("muted", `${`${row.label}:`.padEnd(15)} `) +
				theme.fg(row.tone ?? "text", row.value),
		);
	}

	function statusRows(ctx: ExtensionContext): DetailRow[] {
		const cfg = effectiveConfig();
		const cards = collectHighLevelHistory(sessionEntries(ctx, { all: true })).length;
		const state = summarizing ? "Summarizing" : tracker.isArmed() ? "Armed" : "Ready";
		return [
			{ label: "State", value: state, tone: summarizing || tracker.isArmed() ? "accent" : "success" },
			{ label: "Mode", value: MODE_LABELS[cfg.mode] },
			{ label: "Model", value: cfg.model ?? "current session" },
			{ label: "Thinking", value: THINKING_LABELS[cfg.thinking] },
			{ label: "Thresholds", value: `≥ ${cfg.auto.minChars} chars · ≥ ${cfg.auto.minLines} lines` },
			{ label: "Cards", value: String(cards) },
			{ label: "Fallback menu", value: cfg.fallbackMenu ? "On" : "Off" },
		];
	}

	function showBubble(
		ctx: ExtensionContext,
		source: PillBubbleContent | (() => PillBubbleContent),
	): PillBubbleHandle | undefined {
		const api = menuAPI(ctx);
		if (!api || api.version !== 1 || !ctx.hasUI) return undefined;
		return api.showBubble(ctx, source, pillAnchor);
	}

	async function selectChoice(
		ctx: ExtensionContext,
		title: string,
		options: SelectChoice[],
		details: { description?: string; rows?: DetailRow[]; current?: string } = {},
	): Promise<string | undefined> {
		const nativeSelect = async () => {
			if (!config.fallbackMenu) return undefined;
			const label = await ctx.ui.select(title, options.map((option) => option.label));
			return options.find((option) => option.label === label)?.value;
		};
		const api = menuAPI(ctx);
		if (!api || api.version !== 1 || !ctx.hasUI) return nativeSelect();
		return new Promise((resolve) => {
			let selected = false;
			const handle = showBubble(ctx, () => ({
				title,
				body: [
					...(details.rows ? [...renderRows(ctx, details.rows), ""] : []),
					...(details.description ? [ctx.ui.theme.fg("muted", details.description), ""] : []),
					...options.map((choice) => ({
						text: actionText(ctx, choice.label),
						current: choice.value === details.current,
						onSelect: () => {
							selected = true;
							resolve(choice.value);
						},
					})),
				],
				hint: MENU_HINT,
			}));
			bubble = handle;
			if (handle) {
				// Starline closes the bubble before running the selected target.
				handle.onClose(() => queueMicrotask(() => {
					if (!selected) resolve(undefined);
				}));
			} else void nativeSelect().then(resolve);
		});
	}

	function panelContent(ctx: ExtensionContext): PillBubbleContent {
		return {
			title: "High-level",
			body: [
				...renderRows(ctx, statusRows(ctx)),
				"",
				ctx.ui.theme.fg("muted", "Actions"),
				{ text: actionText(ctx, "Summarize latest reply"), onSelect: () => { void summarizeLatestOnBranch(ctx, "manual"); } },
				{ text: actionText(ctx, "History"), onSelect: () => { openHistory(ctx); } },
				{ text: actionText(ctx, "Settings"), onSelect: () => { void showSettings(ctx).catch((error) => notifyError(ctx, error)); } },
			],
			hint: MENU_HINT,
		};
	}

	async function showNativeStatusMenu(ctx: ExtensionContext): Promise<void> {
		const summary = statusRows(ctx).map((row) => `${row.label}: ${row.value}`).join("\n");
		const picked = await ctx.ui.select(summary, [
			"Summarize latest reply",
			"History",
			"Settings",
			"Close",
		]);
		if (picked === "Summarize latest reply") await summarizeLatestOnBranch(ctx, "manual");
		else if (picked === "History") openHistory(ctx);
		else if (picked === "Settings") await showSettings(ctx);
	}

	function showStatus(ctx: ExtensionContext): void {
		const handle = showBubble(ctx, () => panelContent(ctx));
		if (handle) {
			bubble = handle;
			return;
		}
		if (config.fallbackMenu) {
			void showNativeStatusMenu(ctx).catch((error) => notifyError(ctx, error));
			return;
		}
		ctx.ui.notify(statusRows(ctx).map((row) => `${row.label}: ${row.value}`).join("\n"), "info");
	}

	async function chooseModel(ctx: ExtensionContext): Promise<void> {
		const available =
			(ctx.modelRegistry as ExtensionContext["modelRegistry"] & { getAvailable?: () => ModelCandidate[] })
				.getAvailable?.() ?? [];
		const choices: SelectChoice[] = [
			{ value: "current", label: "Current session model" },
			{ value: "auto", label: "Auto (lightweight model)" },
			...available.map((model) => ({
				value: `${model.provider}/${model.id}`,
				label: `${model.provider}/${model.id}`,
			})),
			{ value: "back", label: "Back" },
		];
		const picked = await selectChoice(ctx, "High-level summary model", choices, {
			current: config.model ?? "current",
		});
		if (!picked || picked === "back") return;
		updateConfig(
			ctx,
			{ ...config, model: picked === "current" ? undefined : picked },
			`High-level model set to ${picked === "current" ? "current session" : picked}`,
		);
	}

	async function chooseThinking(ctx: ExtensionContext): Promise<void> {
		const choices: SelectChoice[] = [
			...SUMMARY_THINKING_LEVELS.map((level) => ({ value: level, label: THINKING_LABELS[level] })),
			{ value: "back", label: "Back" },
		];
		const picked = await selectChoice(ctx, "High-level summary thinking", choices, {
			current: config.thinking,
		});
		if (!picked || picked === "back") return;
		updateConfig(
			ctx,
			{ ...config, thinking: picked as SummaryThinking },
			`High-level thinking set to ${THINKING_LABELS[picked as SummaryThinking]}`,
		);
	}

	async function askThreshold(ctx: ExtensionContext, kind: "chars" | "lines"): Promise<number | undefined> {
		const current = kind === "chars" ? config.auto.minChars : config.auto.minLines;
		const value = await ctx.ui.input(
			kind === "chars" ? "Minimal characters" : "Minimal lines",
			String(current),
		);
		if (value === undefined || !/^\d+$/u.test(value.trim())) return undefined;
		const amount = Number.parseInt(value.trim(), 10);
		if (kind === "chars" && amount < 200) {
			ctx.ui.notify("Character threshold must be at least 200", "warning");
			return undefined;
		}
		if (kind === "lines" && amount < MIN_ANSWER_LINES) {
			ctx.ui.notify("Line threshold must be at least 4", "warning");
			return undefined;
		}
		return amount;
	}

	async function chooseMode(ctx: ExtensionContext): Promise<void> {
		const picked = await selectChoice(
			ctx,
			"High-level summary mode",
			[
				{ value: "manual", label: "Manual" },
				{ value: "auto", label: "Auto" },
				{ value: "minChars", label: "Minimal characters" },
				{ value: "minLines", label: "Minimal lines" },
				{ value: "back", label: "Back" },
			],
			{
				current: config.mode,
				description: "Manual uses /hl or +hl. Auto, minimal characters, and minimal lines summarize completed replies automatically.",
			},
		);
		if (!picked || picked === "back") return;
		const mode = picked as SummaryMode;
		if (mode === "minChars" || mode === "minLines") {
			const kind = mode === "minChars" ? "chars" : "lines";
			const amount = await askThreshold(ctx, kind);
			if (amount === undefined) return;
			const auto = kind === "chars" ? { ...config.auto, minChars: amount } : { ...config.auto, minLines: amount };
			updateConfig(ctx, { ...config, mode, auto }, `High-level mode set to ${MODE_LABELS[mode]}`);
			return;
		}
		updateConfig(ctx, { ...config, mode }, `High-level mode set to ${MODE_LABELS[mode]}`);
	}

	async function editTimeout(ctx: ExtensionContext): Promise<void> {
		const current = Math.round(config.timeoutMs / 1000);
		const value = await ctx.ui.input("Timeout in seconds", String(current));
		if (value === undefined || !/^\d+$/u.test(value.trim())) return;
		const amount = Number.parseInt(value.trim(), 10);
		const next = normalizeConfig({ ...config, timeoutMs: amount * 1000 });
		updateConfig(ctx, next, `High-level timeout set to ${Math.round(next.timeoutMs / 1000)}s`);
	}

	async function editPrompt(ctx: ExtensionContext): Promise<void> {
		const picked = await selectChoice(ctx, "High-level prompt", [
			{ value: "builtin", label: "Use built-in prompt" },
			{ value: "inline", label: "Edit inline prompt" },
			{ value: "back", label: "Back" },
		]);
		if (picked === "builtin") {
			updateConfig(ctx, { ...config, prompt: undefined }, "High-level prompt reset to built-in");
			return;
		}
		if (picked !== "inline") return;
		const prompt = await ctx.ui.editor(
			"High-level inline prompt · {{question}} and {{answer}} are optional",
			config.prompt ?? BUILTIN_SUMMARY_INSTRUCTIONS.join("\n"),
		);
		if (prompt === undefined) return;
		updateConfig(
			ctx,
			{ ...config, prompt: prompt.trim() || undefined },
			prompt.trim() ? "High-level inline prompt saved" : "High-level prompt reset to built-in",
		);
	}

	async function showSettings(ctx: ExtensionContext): Promise<void> {
		if (ctx.mode !== "tui") {
			ctx.ui.notify("High-level settings require interactive mode; edit pi-high-level.json instead", "warning");
			return;
		}
		if (!menuAPI(ctx) && !config.fallbackMenu) {
			ctx.ui.notify(
				"High-level menus are disabled (fallbackMenu is off); edit pi-high-level.json instead",
				"warning",
			);
			return;
		}
		for (;;) {
			const choices: SelectChoice[] = [
				{ value: "mode", label: `Summary mode: ${MODE_LABELS[config.mode]}` },
				{ value: "model", label: `Summary model: ${config.model ?? "current"}` },
				{ value: "thinking", label: `Summary thinking: ${THINKING_LABELS[config.thinking]}` },
				{ value: "chars", label: `Minimal characters: ${config.auto.minChars}` },
				{ value: "lines", label: `Minimal lines: ${config.auto.minLines}` },
				{ value: "timeout", label: `Timeout: ${Math.round(config.timeoutMs / 1000)}s` },
				{ value: "prompt", label: `Prompt: ${config.prompt ? "inline custom" : "built-in"}` },
				{ value: "fallback", label: `Fallback menu: ${config.fallbackMenu ? "On" : "Off"}` },
				{ value: "done", label: "Done" },
			];
			const picked = await selectChoice(ctx, "High-level settings", choices, {
				rows: statusRows(ctx),
				current: "done",
			});
			if (!picked || picked === "done") return;
			if (picked === "mode") await chooseMode(ctx);
			else if (picked === "model") await chooseModel(ctx);
			else if (picked === "thinking") await chooseThinking(ctx);
			else if (picked === "chars") {
				const amount = await askThreshold(ctx, "chars");
				if (amount !== undefined) {
					updateConfig(ctx, { ...config, auto: { ...config.auto, minChars: amount } }, "High-level character threshold updated");
				}
			} else if (picked === "lines") {
				const amount = await askThreshold(ctx, "lines");
				if (amount !== undefined) {
					updateConfig(ctx, { ...config, auto: { ...config.auto, minLines: amount } }, "High-level line threshold updated");
				}
			} else if (picked === "timeout") await editTimeout(ctx);
			else if (picked === "prompt") await editPrompt(ctx);
			else if (picked === "fallback") {
				const enabled = !config.fallbackMenu;
				updateConfig(ctx, { ...config, fallbackMenu: enabled }, `High-level fallback menu ${enabled ? "enabled" : "disabled"}`);
			}
		}
	}

	pi.registerEntryRenderer<HighLevelCard>(HIGH_LEVEL_ENTRY, (entry, options, theme) => {
		const summary = entry.data?.summary?.trim();
		return summary ? renderCard({ ...entry.data, summary }, options, theme) : undefined;
	});

	pi.on("session_start", (_event, ctx) => {
		config = loadConfig();
		tracker.reset();
		summarizing = false;
		pillAnchor = undefined;
		bubble?.close();
		bubble = undefined;
		pillUnregister?.();
		const api = menuAPI(ctx);
		pillUnregister = api?.version === 1
			? api.register(STATUS_KEY, ({ ctx: current, pill }) => {
				if (pill) pillAnchor = pill;
				showStatus(current);
			})
			: undefined;
		syncStatus(ctx);
	});

	pi.on("session_shutdown", (_event, ctx) => {
		bubble?.close();
		bubble = undefined;
		pillUnregister?.();
		pillUnregister = undefined;
		pillAnchor = undefined;
		ctx.ui.setStatus(STATUS_KEY, undefined);
	});

	pi.on("input", async (event, ctx) => {
		// Some frontends submit slash commands as prompts with command expansion off.
		// Handle this extension's own commands here so they still work in those clients.
		const commandText = event.text.trim();
		const commandName = commandText.startsWith("/") ? commandText.slice(1).split(/\s+/u)[0] : "";
		if (commandName === "hl" || commandName === "hl-status" || commandName === "hl-history" || commandName === "hl-settings") {
			if (commandText !== `/${commandName}`) {
				ctx.ui.notify(`Usage: /${commandName}`, "info");
				return { action: "handled" as const };
			}
			if (commandName === "hl") await summarizeLatestOnBranch(ctx, "manual");
			else if (commandName === "hl-status") showStatus(ctx);
			else if (commandName === "hl-history") openHistory(ctx);
			else await showSettings(ctx);
			return { action: "handled" as const };
		}

		const stripped = stripHighLevelMarker(event.text);
		if (stripped.marked && !stripped.text.trim()) {
			if (ctx.isIdle()) {
				await summarizeLatestOnBranch(ctx, "marked");
			} else {
				const armed = tracker.toggleActiveTurn();
				ctx.ui.notify(armed ? "High-level summary armed for this reply" : "High-level summary disarmed", "info");
			}
			syncStatus(ctx);
			return { action: "handled" as const };
		}

		tracker.onInput({
			marked: stripped.marked,
			source: event.source,
			streamingBehavior: event.streamingBehavior,
		});
		syncStatus(ctx);
		if (event.source === "extension" || !stripped.marked) return;
		return { action: "transform" as const, text: stripped.text, images: event.images };
	});

	pi.on("before_agent_start", (event, ctx) => {
		tracker.onBeforeAgentStart(event.messageType);
		syncStatus(ctx);
	});

	pi.on("message_start", (event, ctx) => {
		if ((event.message as { role?: string } | undefined)?.role === "user") {
			tracker.onUserMessageStart();
			syncStatus(ctx);
		}
	});

	pi.on("turn_end", async (event, ctx) => {
		const msg = event.message as { role?: string; content?: unknown; stopReason?: string };
		const hasTools =
			(event.toolResults?.length ?? 0) > 0 || msg.stopReason === "toolUse" || hasToolCalls(msg.content);
		const hasPending = (event.context?.pendingMessages?.length ?? 0) > 0;
		const trigger = tracker.consumeAtTurnEnd({
			completed: event.outcome === "completed",
			hasToolCalls: hasTools,
			willContinue: Boolean(event.continue),
			hasPendingMessages: hasPending,
		});
		syncStatus(ctx);

		const cfg = effectiveConfig();
		const exchange = extractTurnExchange(branchMessages(sessionEntries(ctx)));
		const effectiveTrigger =
			trigger ??
			(!hasTools && !event.continue && event.outcome === "completed" &&
			(tracker.hasQueuedUserTurns() || hasPending) && shouldAutoSummarize(exchange.answer, cfg.auto, cfg.mode)
				? "auto"
				: undefined);
		if (!effectiveTrigger) return;
		const card = await summarizeExchange(ctx, exchange, effectiveTrigger);
		if (!card) return;
		return { entries: [...event.entries, { type: "custom" as const, customType: HIGH_LEVEL_ENTRY, data: card }] };
	});

	pi.on("agent_before_settle", async (event, ctx) => {
		const hasPending = (event.context?.pendingMessages?.length ?? 0) > 0;
		const trigger = tracker.consumeBeforeSettle({
			completed: event.outcome === "completed",
			willContinue: Boolean(event.continue),
			hasPendingMessages: hasPending,
		});
		syncStatus(ctx);
		if (event.outcome !== "completed" || event.continue || hasPending) return;

		const exchange = extractTurnExchange(branchMessages(sessionEntries(ctx)));
		const cfg = effectiveConfig();
		const effectiveTrigger = trigger ?? (shouldAutoSummarize(exchange.answer, cfg.auto, cfg.mode) ? "auto" : undefined);
		if (!effectiveTrigger) return;
		const card = await summarizeExchange(ctx, exchange, effectiveTrigger);
		if (!card) return;
		return { entries: [...event.entries, { type: "custom" as const, customType: HIGH_LEVEL_ENTRY, data: card }] };
	});

	pi.on("agent_settled", (_event, ctx) => {
		tracker.reset();
		syncStatus(ctx);
	});

	pi.registerCommand("hl", {
		description: "Summarize the latest reply, or open its existing high-level card",
		handler: async (args, ctx) => {
			if (args.trim()) {
				ctx.ui.notify("Usage: /hl · use /hl-status, /hl-history, or /hl-settings; append +hl to a new prompt", "info");
				return;
			}
			await summarizeLatestOnBranch(ctx, "manual");
		},
	});

	pi.registerCommand("hl-status", {
		description: "Show high-level status and actions",
		handler: async (args, ctx) => {
			if (args.trim()) ctx.ui.notify("Usage: /hl-status", "info");
			else showStatus(ctx);
		},
	});

	pi.registerCommand("hl-history", {
		description: "Browse high-level cards in this session and open their original replies",
		handler: async (args, ctx) => {
			if (args.trim()) ctx.ui.notify("Usage: /hl-history", "info");
			else await showHistory(ctx);
		},
	});

	pi.registerCommand("hl-settings", {
		description: "Choose the summary mode, model, thinking level, thresholds, timeout, and prompt",
		handler: async (args, ctx) => {
			if (args.trim()) ctx.ui.notify("Usage: /hl-settings", "info");
			else await showSettings(ctx);
		},
	});
}
