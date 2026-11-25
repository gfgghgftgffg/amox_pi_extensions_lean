export const HIGH_LEVEL_ENTRY = "high-level";
export const DEFAULT_TIMEOUT_MS = 18_000;
export const DEFAULT_MAX_TOKENS = 320;
export const MIN_ANSWER_CHARS = 160;
export const MIN_ANSWER_LINES = 4;
export const DEFAULT_AUTO_MIN_CHARS = 1_200;
export const DEFAULT_AUTO_MIN_LINES = 28;
export const MAX_COLLAPSED_LINES = 5;
export const MAX_PROMPT_CHARS = 8_000;

export const SUMMARY_MODES = ["manual", "auto", "minChars", "minLines"] as const;
export type SummaryMode = (typeof SUMMARY_MODES)[number];

export const SUMMARY_THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;
export type SummaryThinking = (typeof SUMMARY_THINKING_LEVELS)[number];
export const DEFAULT_SUMMARY_THINKING: SummaryThinking = "minimal";

/** Pi's default thinking budgets, also used to size the summary output ceiling. */
export const DEFAULT_THINKING_BUDGETS = {
	minimal: 1_024,
	low: 2_048,
	medium: 8_192,
	high: 16_384,
} as const;

const THINKING_ORDER: readonly SummaryThinking[] = [
	"off",
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
	"max",
];

/** Match Pi's clamping so budgets use the level the provider will actually run. */
export function clampSummaryThinking(
	thinking: SummaryThinking,
	map?: Record<string, string | null | undefined>,
): SummaryThinking {
	if (!map) return thinking;
	const supported = THINKING_ORDER.filter((level) => {
		const mapped = map[level];
		if (mapped === null) return false;
		if ((level === "xhigh" || level === "max") && mapped === undefined) return false;
		return true;
	});
	if (supported.includes(thinking)) return thinking;
	const index = THINKING_ORDER.indexOf(thinking);
	for (let i = index; i < THINKING_ORDER.length; i += 1) {
		if (supported.includes(THINKING_ORDER[i]!)) return THINKING_ORDER[i]!;
	}
	for (let i = index - 1; i >= 0; i -= 1) {
		if (supported.includes(THINKING_ORDER[i]!)) return THINKING_ORDER[i]!;
	}
	return supported[0] ?? "off";
}

/**
 * A provider's output cap includes reasoning tokens on some APIs. Reserve the
 * normal answer budget on top of the thinking budget, then clamp to the model.
 */
export function summaryMaxTokens(
	thinking: SummaryThinking,
	modelMaxTokens?: number,
): number {
	if (thinking === "off") return DEFAULT_MAX_TOKENS;
	const level = thinking === "xhigh" || thinking === "max" ? "high" : thinking;
	const ceiling = DEFAULT_MAX_TOKENS + DEFAULT_THINKING_BUDGETS[level];
	return modelMaxTokens && modelMaxTokens > 0 ? Math.min(ceiling, modelMaxTokens) : ceiling;
}

const MARKER = "+hl";
const LABEL = " high-level ";
const SHORT_LABEL = " hl ";
const QUESTION_LIMIT = 1_200;
const ANSWER_LIMIT = 16_000;
const LIGHTWEIGHT_MODEL_RE = /\b(?:haiku|flash|mini|nano|instant)\b/iu;

export type SummaryTrigger = "marked" | "manual" | "auto";

export interface ChatMessage {
	id?: string;
	role?: string;
	content?: unknown;
	stopReason?: string;
}

export interface TurnExchange {
	question: string;
	answer: string;
	targetEntryId?: string;
}

export interface AutoSummaryConfig {
	minChars: number;
	minLines: number;
}

export interface HighLevelConfig {
	model?: string;
	thinking: SummaryThinking;
	mode: SummaryMode;
	timeoutMs: number;
	auto: AutoSummaryConfig;
	/** Inline replacement for the built-in summary instructions. */
	prompt?: string;
	/** Use Pi's native select menus when pi-starline is unavailable. */
	fallbackMenu: boolean;
}

export interface HighLevelCard {
	summary: string;
	model?: string;
	durationMs?: number;
	sourceChars?: number;
	targetEntryId?: string;
	trigger?: SummaryTrigger;
	timestamp?: number;
}

export interface BranchEntryLike {
	id?: string;
	type: string;
	customType?: string;
	message?: ChatMessage;
	data?: unknown;
}

export interface ModelCandidate {
	provider: string;
	id: string;
}

export function defaultConfig(): HighLevelConfig {
	return {
		model: undefined,
		thinking: DEFAULT_SUMMARY_THINKING,
		mode: "manual",
		timeoutMs: DEFAULT_TIMEOUT_MS,
		auto: {
			minChars: DEFAULT_AUTO_MIN_CHARS,
			minLines: DEFAULT_AUTO_MIN_LINES,
		},
		fallbackMenu: true,
	};
}

export function normalizeConfig(raw: unknown): HighLevelConfig {
	const base = defaultConfig();
	if (!raw || typeof raw !== "object") return base;
	const record = raw as Record<string, unknown>;

	if (typeof record.model === "string" && record.model.trim()) {
		const model = record.model.trim();
		base.model = model === "current" || model === "default" ? undefined : model;
	}
	const thinking = typeof record.thinking === "string" ? parseThinkingLevel(record.thinking) : undefined;
	if (thinking) base.thinking = thinking;
	const mode = typeof record.mode === "string" ? parseSummaryMode(record.mode) : undefined;
	if (mode) base.mode = mode;
	if (typeof record.fallbackMenu === "boolean") base.fallbackMenu = record.fallbackMenu;
	if (typeof record.timeoutMs === "number" && Number.isFinite(record.timeoutMs)) {
		base.timeoutMs = Math.min(120_000, Math.max(3_000, Math.round(record.timeoutMs)));
	}
	if (record.auto && typeof record.auto === "object") {
		const auto = record.auto as Record<string, unknown>;
		// Configs written before the mode selector used `auto.enabled` alone.
		if (!mode && typeof auto.enabled === "boolean") base.mode = auto.enabled ? "auto" : "manual";
		if (typeof auto.minChars === "number" && Number.isFinite(auto.minChars) && auto.minChars >= 200) {
			base.auto.minChars = Math.round(auto.minChars);
		}
		if (typeof auto.minLines === "number" && Number.isFinite(auto.minLines) && auto.minLines >= 4) {
			base.auto.minLines = Math.round(auto.minLines);
		}
	}
	if (typeof record.prompt === "string" && record.prompt.trim()) {
		base.prompt = record.prompt.trim().slice(0, MAX_PROMPT_CHARS);
	}
	return base;
}

export function parseSummaryMode(spec: string): SummaryMode | undefined {
	const value = spec.trim().toLowerCase();
	if (value === "manual") return "manual";
	if (value === "auto") return "auto";
	if (value === "minchars" || value === "min-chars" || value === "minimal characters" || value === "chars") {
		return "minChars";
	}
	if (value === "minlines" || value === "min-lines" || value === "minimal lines" || value === "lines") {
		return "minLines";
	}
	return undefined;
}

export function parseThinkingLevel(spec: string): SummaryThinking | undefined {
	const value = spec.trim().toLowerCase();
	return (SUMMARY_THINKING_LEVELS as readonly string[]).includes(value)
		? (value as SummaryThinking)
		: undefined;
}

export interface SummaryModeSettings {
	mode: SummaryMode;
	auto: AutoSummaryConfig;
}

/** Parse `--hl-auto` values: manual, auto, <N>c, or <N>l. */
export function parseModeSpec(spec: string, current: SummaryModeSettings): SummaryModeSettings | undefined {
	const value = spec.trim().toLowerCase();
	if (!value) return undefined;
	if (value === "manual" || value === "off" || value === "false" || value === "0") {
		return { ...current, mode: "manual" };
	}
	if (value === "auto" || value === "on" || value === "true") {
		return { ...current, mode: "auto" };
	}
	const charMatch = value.match(/^(\d+)\s*c(?:hars?)?$/u);
	if (charMatch) {
		const minChars = Number.parseInt(charMatch[1], 10);
		if (minChars >= 200) {
			return { mode: "minChars", auto: { ...current.auto, minChars } };
		}
		return undefined;
	}
	const lineMatch = value.match(/^(\d+)\s*l(?:ines?)?$/u);
	if (lineMatch) {
		const minLines = Number.parseInt(lineMatch[1], 10);
		if (minLines >= MIN_ANSWER_LINES) {
			return { mode: "minLines", auto: { ...current.auto, minLines } };
		}
		return undefined;
	}
	if (/^\d+$/u.test(value)) {
		const amount = Number.parseInt(value, 10);
		if (amount >= 200) return { mode: "minChars", auto: { ...current.auto, minChars: amount } };
		if (amount >= MIN_ANSWER_LINES) return { mode: "minLines", auto: { ...current.auto, minLines: amount } };
	}
	return undefined;
}

export function stripHighLevelMarker(input: string): { text: string; marked: boolean } {
	const text = input.replace(/\s+$/u, "");
	const lineBreak = text.lastIndexOf("\n");
	const lastLine = (lineBreak === -1 ? text : text.slice(lineBreak + 1)).trim();
	if (lastLine === MARKER) {
		const body = lineBreak === -1 ? "" : text.slice(0, lineBreak).replace(/\s+$/u, "");
		return { text: body, marked: true };
	}

	const token = text.match(/^(.*?)(?:^|\s)\+hl$/u);
	if (token) {
		return { text: token[1].replace(/\s+$/u, ""), marked: true };
	}

	return { text: input, marked: false };
}

export function messageText(content: unknown): string {
	if (typeof content === "string") {
		return content.trim();
	}
	if (!Array.isArray(content)) {
		return "";
	}

	const parts: string[] = [];
	for (const block of content) {
		if (!block || typeof block !== "object") continue;
		const record = block as { type?: unknown; text?: unknown };
		if (record.type === "text" && typeof record.text === "string") {
			const text = record.text.trim();
			if (text) parts.push(text);
		}
	}
	return parts.join("\n\n");
}

export function hasToolCalls(content: unknown): boolean {
	if (!Array.isArray(content)) return false;
	return content.some(
		(block) => Boolean(block && typeof block === "object" && (block as { type?: unknown }).type === "toolCall"),
	);
}

export function extractTurnExchange(messages: readonly ChatMessage[]): TurnExchange {
	let userIndex = -1;
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		if (messages[index]?.role === "user") {
			userIndex = index;
			break;
		}
	}

	const rawQuestion = userIndex >= 0 ? messageText(messages[userIndex]?.content) : "";
	const question = stripHighLevelMarker(rawQuestion).text.trim();
	const replySlice = userIndex >= 0 ? messages.slice(userIndex + 1) : messages;
	const assistantEntries = replySlice
		.filter((message) => message.role === "assistant")
		.map((message) => ({
			id: message.id,
			text: messageText(message.content),
			toolTurn: message.stopReason === "toolUse" || hasToolCalls(message.content),
		}))
		.filter((item) => item.text.length > 0);

	if (assistantEntries.length === 0) {
		return { question, answer: "" };
	}

	const last = assistantEntries[assistantEntries.length - 1]!;
	if (assistantEntries.length === 1 || !isAnswerTooShort(last.text)) {
		return { question, answer: last.text, targetEntryId: last.id };
	}

	// If the final turn was just a short post-tool confirmation ("Tests pass.") after an
	// earlier substantive explanation in the same turn, keep that substantive explanation
	// while still dropping short procedural tool-call chatter ("Let me read core.ts...").
	const substantiveEarlier = assistantEntries
		.slice(0, -1)
		.filter((item) => !isAnswerTooShort(item.text))
		.map((item) => item.text);
	if (substantiveEarlier.length > 0) {
		const prev = substantiveEarlier[substantiveEarlier.length - 1]!;
		return {
			question,
			answer: `${prev}\n\n${last.text}`,
			targetEntryId: last.id,
		};
	}

	return { question, answer: last.text, targetEntryId: last.id };
}

export function answerSinceLastUser(messages: readonly ChatMessage[]): string {
	return extractTurnExchange(messages).answer;
}

export function nonEmptyLineCount(text: string): number {
	const trimmed = text.trim();
	if (!trimmed) return 0;
	return trimmed
		.split(/\r?\n/u)
		.map((line) => line.trim())
		.filter(Boolean).length;
}

export function isAnswerTooShort(answer: string): boolean {
	const trimmed = answer.trim();
	if (!trimmed) return true;
	return trimmed.length < MIN_ANSWER_CHARS && nonEmptyLineCount(trimmed) < MIN_ANSWER_LINES;
}

export function shouldAutoSummarize(
	answer: string,
	auto: AutoSummaryConfig,
	mode: SummaryMode = "auto",
): boolean {
	if (mode === "manual" || isAnswerTooShort(answer)) return false;
	const trimmed = answer.trim();
	if (mode === "minChars") return trimmed.length >= auto.minChars;
	const totalLines = trimmed.split(/\r?\n/u).length;
	if (mode === "minLines") return totalLines >= auto.minLines;
	return trimmed.length >= auto.minChars || totalLines >= auto.minLines;
}

export function clipText(text: string, limit: number): { text: string; clipped: boolean } {
	if (text.length <= limit) {
		return { text, clipped: false };
	}
	const half = Math.floor(limit / 2);
	const head = text.slice(0, half);
	const tail = text.slice(-half);
	return {
		text: `${head}\n\n[...middle omitted...]\n\n${tail}`,
		clipped: true,
	};
}

export function clipAnswer(answer: string): { text: string; clipped: boolean } {
	return clipText(answer, ANSWER_LIMIT);
}

export const BUILTIN_SUMMARY_INSTRUCTIONS = [
	"Summarize the assistant's final answer at a high level.",
	"Write 3 to 5 concise lines or bullets in the answer's language.",
	"Focus on the conclusion, key decision/trade-off, and concrete change or next step.",
	"Do not repeat intermediate steps, code blocks, or long file lists.",
	"Do not add a title or preamble.",
];

interface SummarySource {
	rawQuestion: string;
	safeQuestion: string;
	safeAnswer: string;
}

function summarySource(input: string | { question?: string; answer: string }): SummarySource {
	const rawQuestion = typeof input === "string" ? "" : (input.question ?? "").trim();
	const rawAnswer = typeof input === "string" ? input : input.answer;
	return {
		rawQuestion,
		safeQuestion: rawQuestion
			? clipText(rawQuestion, QUESTION_LIMIT).text.replaceAll("</question>", "</ question>")
			: "",
		safeAnswer: clipAnswer(rawAnswer).text.replaceAll("</answer>", "</ answer>"),
	};
}

function appendExchange(lines: string[], source: SummarySource): string[] {
	if (source.rawQuestion) {
		lines.push("", "<question>", source.safeQuestion, "</question>");
	}
	lines.push("", "<answer>", source.safeAnswer, "</answer>");
	return lines;
}

/**
 * `template` replaces the built-in instructions. `{{question}}` and `{{answer}}`
 * insert the clipped exchange. A template that uses neither placeholder still
 * receives both blocks after the instructions.
 */
export function buildSummaryPrompt(
	input: string | { question?: string; answer: string },
	template?: string,
): string {
	const source = summarySource(input);
	const custom = template?.trim() ?? "";
	if (!custom) {
		return appendExchange([...BUILTIN_SUMMARY_INSTRUCTIONS], source).join("\n");
	}

	const bounded = custom.length > MAX_PROMPT_CHARS ? custom.slice(0, MAX_PROMPT_CHARS) : custom;
	const hasQuestion = bounded.includes("{{question}}");
	const hasAnswer = bounded.includes("{{answer}}");
	const filled = bounded.replaceAll("{{question}}", source.safeQuestion).replaceAll("{{answer}}", source.safeAnswer);
	if (hasQuestion || hasAnswer) return filled;
	return appendExchange([filled], source).join("\n");
}

export function pickSummaryModel<T extends ModelCandidate>(
	spec: string | undefined,
	activeModel: T | undefined,
	candidates: readonly T[],
	hasAuth: (model: T) => boolean,
): T | undefined {
	const trimmed = spec?.trim();
	if (trimmed && trimmed !== "current" && trimmed !== "default") {
		if (trimmed === "auto") {
			const sameProviderLight = activeModel
				? candidates.find(
						(m) => m.provider === activeModel.provider && LIGHTWEIGHT_MODEL_RE.test(m.id) && hasAuth(m),
					)
				: undefined;
			if (sameProviderLight) return sameProviderLight;

			const anyLight = candidates.find((m) => LIGHTWEIGHT_MODEL_RE.test(m.id) && hasAuth(m));
			if (anyLight) return anyLight;
		} else {
			const slash = trimmed.indexOf("/");
			if (slash > 0) {
				const provider = trimmed.slice(0, slash);
				const id = trimmed.slice(slash + 1);
				const exact = candidates.find((m) => m.provider === provider && m.id === id && hasAuth(m));
				if (exact) return exact;
			} else {
				const lower = trimmed.toLowerCase();
				const sameProviderExact = activeModel
					? candidates.find(
							(m) => m.provider === activeModel.provider && m.id.toLowerCase() === lower && hasAuth(m),
						)
					: undefined;
				if (sameProviderExact) return sameProviderExact;

				const exact = candidates.find((m) => m.id.toLowerCase() === lower && hasAuth(m));
				if (exact) return exact;

				const fuzzy = candidates.find(
					(m) => `${m.provider}/${m.id}`.toLowerCase().includes(lower) && hasAuth(m),
				);
				if (fuzzy) return fuzzy;
			}
		}
	}

	if (activeModel && hasAuth(activeModel)) {
		return activeModel;
	}
	return undefined;
}

export interface HighLevelHistoryItem {
	entryId: string;
	card: HighLevelCard;
}

/** Existing cards in one session, newest recorded entry first. */
export function collectHighLevelHistory(entries: readonly BranchEntryLike[]): HighLevelHistoryItem[] {
	const items: HighLevelHistoryItem[] = [];
	for (const entry of entries) {
		if (entry.type !== "custom" || entry.customType !== HIGH_LEVEL_ENTRY || !entry.id) continue;
		const card = entry.data as HighLevelCard | undefined;
		if (!card?.summary?.trim()) continue;
		items.push({ entryId: entry.id, card: { ...card, summary: card.summary.trim() } });
	}
	return items.reverse();
}

export function hasExistingCardForLatestReply(
	entries: readonly BranchEntryLike[],
	entryType = HIGH_LEVEL_ENTRY,
): boolean {
	let lastAssistantIndex = -1;
	for (let i = entries.length - 1; i >= 0; i -= 1) {
		const entry = entries[i];
		if (entry?.type !== "message") continue;
		if (entry.message?.role === "user") return false;
		if (entry.message?.role === "assistant" && messageText(entry.message.content)) {
			lastAssistantIndex = i;
			break;
		}
	}
	if (lastAssistantIndex === -1) return false;

	const targetId = entries[lastAssistantIndex]?.id;
	for (let i = lastAssistantIndex + 1; i < entries.length; i += 1) {
		const entry = entries[i];
		if (entry?.type === "custom" && entry.customType === entryType) {
			return true;
		}
	}
	if (targetId) {
		for (const entry of entries) {
			if (entry.type !== "custom" || entry.customType !== entryType) continue;
			const data = entry.data as HighLevelCard | undefined;
			if (data?.targetEntryId && data.targetEntryId === targetId) return true;
		}
	}
	return false;
}

export function formatCardMeta(card: HighLevelCard): string | undefined {
	const parts: string[] = [];
	if (card.model) parts.push(card.model);
	if (typeof card.durationMs === "number" && Number.isFinite(card.durationMs)) {
		parts.push(card.durationMs >= 1_000 ? `${(card.durationMs / 1_000).toFixed(1)}s` : `${Math.round(card.durationMs)}ms`);
	}
	if (typeof card.sourceChars === "number" && card.sourceChars > 0) {
		parts.push(`from ${card.sourceChars.toLocaleString("en-US")} chars`);
	}
	if (card.trigger && card.trigger !== "marked") {
		parts.push(card.trigger);
	}
	return parts.length > 0 ? parts.join(" · ") : undefined;
}

export class RunTracker {
	private idleArmed: SummaryTrigger | undefined;
	private steerQueue: (SummaryTrigger | undefined)[] = [];
	private followUpQueue: (SummaryTrigger | undefined)[] = [];
	private activeTrigger: SummaryTrigger | undefined;
	private awaitingInitialUserMessage = false;

	reset(): void {
		this.idleArmed = undefined;
		this.steerQueue.length = 0;
		this.followUpQueue.length = 0;
		this.activeTrigger = undefined;
		this.awaitingInitialUserMessage = false;
	}

	onInput(opts: {
		marked: boolean;
		source: "interactive" | "rpc" | "extension";
		streamingBehavior?: "steer" | "followUp";
	}): SummaryTrigger | undefined {
		const trigger: SummaryTrigger | undefined = opts.marked ? "marked" : undefined;
		if (opts.streamingBehavior === "steer") {
			this.steerQueue.push(trigger);
		} else if (opts.streamingBehavior === "followUp") {
			this.followUpQueue.push(trigger);
		} else {
			this.idleArmed = trigger;
		}
		return trigger;
	}

	onBeforeAgentStart(messageType: "user" | "custom"): void {
		if (messageType === "user") {
			this.activeTrigger = this.idleArmed;
			this.idleArmed = undefined;
			this.awaitingInitialUserMessage = true;
		} else {
			this.activeTrigger = undefined;
			this.awaitingInitialUserMessage = false;
		}
	}

	onUserMessageStart(): void {
		if (this.awaitingInitialUserMessage) {
			this.awaitingInitialUserMessage = false;
			return;
		}
		if (this.steerQueue.length > 0) {
			this.activeTrigger = this.steerQueue.shift();
			return;
		}
		if (this.followUpQueue.length > 0) {
			this.activeTrigger = this.followUpQueue.shift();
			return;
		}
		this.activeTrigger = undefined;
	}

	toggleActiveTurn(): boolean {
		if (this.activeTrigger) {
			this.activeTrigger = undefined;
			return false;
		}
		this.activeTrigger = "marked";
		return true;
	}

	isArmed(): boolean {
		return Boolean(
			this.activeTrigger ||
				this.idleArmed ||
				this.steerQueue.some(Boolean) ||
				this.followUpQueue.some(Boolean),
		);
	}

	hasQueuedUserTurns(): boolean {
		return this.steerQueue.length > 0 || this.followUpQueue.length > 0;
	}

	consumeAtTurnEnd(opts: {
		completed: boolean;
		hasToolCalls: boolean;
		willContinue: boolean;
		hasPendingMessages: boolean;
	}): SummaryTrigger | undefined {
		if (!opts.completed || opts.hasToolCalls || opts.willContinue) {
			return undefined;
		}
		if (!this.hasQueuedUserTurns() && !opts.hasPendingMessages) {
			return undefined;
		}
		const trigger = this.activeTrigger;
		this.activeTrigger = undefined;
		return trigger;
	}

	consumeBeforeSettle(opts: {
		completed: boolean;
		willContinue: boolean;
		hasPendingMessages: boolean;
	}): SummaryTrigger | undefined {
		if (opts.willContinue || opts.hasPendingMessages) {
			return undefined;
		}
		const trigger = this.activeTrigger;
		this.activeTrigger = undefined;
		return opts.completed ? trigger : undefined;
	}
}

function fitPlainLine(line: string, targetWidth: number, measure: (line: string) => number): string {
	if (targetWidth <= 0) return "";
	if (measure(line) <= targetWidth || line.includes("\u001b")) return line;
	let end = Math.min(line.length, targetWidth);
	while (end > 0 && measure(line.slice(0, end)) > targetWidth) end -= 1;
	return line.slice(0, end);
}

export function frameLines(
	body: readonly string[],
	width: number,
	paint: (text: string) => string,
	measure: (line: string) => number = (line) => line.length,
	paintBg?: (line: string) => string,
): string[] {
	const columns = Math.floor(width);
	if (columns <= 0) return [];
	const wrapBg = (line: string) => (paintBg ? paintBg(line) : line);

	if (columns < 6) {
		return (body.length > 0 ? body : [""]).map((raw) => {
			const fitted = fitPlainLine(raw, columns, measure);
			const pad = Math.max(0, columns - measure(fitted));
			return wrapBg(`${fitted}${" ".repeat(pad)}`);
		});
	}

	let label = "";
	let prefix = "╭";
	if (columns >= LABEL.length + 4) {
		label = LABEL;
		prefix = "╭─";
	} else if (columns >= SHORT_LABEL.length + 4) {
		label = SHORT_LABEL;
		prefix = "╭─";
	}
	const dashes = Math.max(0, columns - prefix.length - label.length - 1);
	const top = wrapBg(paint(`${prefix}${label}${"─".repeat(dashes)}╮`));
	const bottom = wrapBg(paint(`╰${"─".repeat(columns - 2)}╯`));
	const inner = columns - 4;

	const lines = body.map((line) => {
		const fitted = fitPlainLine(line, inner, measure);
		const pad = Math.max(0, inner - measure(fitted));
		return wrapBg(`${paint("│ ")}${fitted}${" ".repeat(pad)}${paint(" │")}`);
	});
	return [top, ...lines, bottom];
}
