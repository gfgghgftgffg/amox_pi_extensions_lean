import assert from "node:assert/strict";
import test from "node:test";
import {
	answerSinceLastUser,
	buildSummaryPrompt,
	clipAnswer,
	collectHighLevelHistory,
	defaultConfig,
	extractTurnExchange,
	normalizeConfig,
	formatCardMeta,
	frameLines,
	hasExistingCardForLatestReply,
	isAnswerTooShort,
	parseModeSpec,
	parseThinkingLevel,
	pickSummaryModel,
	RunTracker,
	shouldAutoSummarize,
	clampSummaryThinking,
	summaryMaxTokens,
	stripHighLevelMarker,
} from "../core.ts";

test("strips a trailing +hl token and a final marker line", () => {
	assert.deepEqual(stripHighLevelMarker("explain the parser +hl"), {
		text: "explain the parser",
		marked: true,
	});
	assert.deepEqual(stripHighLevelMarker("explain the parser\n+hl\n"), {
		text: "explain the parser",
		marked: true,
	});
	assert.deepEqual(stripHighLevelMarker("+hl"), { text: "", marked: true });
	assert.deepEqual(stripHighLevelMarker("mention +hl in the middle"), {
		text: "mention +hl in the middle",
		marked: false,
	});
});

test("extractTurnExchange strips intermediate tool-call chatter and keeps user question", () => {
	const finalAnswer = [
		"We chose the stream-based parser over regex tokenization.",
		"1. Escaped delimiters no longer split tokens prematurely.",
		"2. Streaming chunks keep bounded memory under 64 KB.",
		"3. Existing AST consumers require zero API changes.",
	].join("\n");

	const exchange = extractTurnExchange([
		{ role: "user", content: "older question" },
		{ role: "assistant", content: [{ type: "text", text: "old answer" }] },
		{ role: "user", content: "Which parser design should we ship? +hl" },
		{
			role: "assistant",
			stopReason: "toolUse",
			content: [
				{ type: "text", text: "Let me read parser.ts first to inspect the current implementation..." },
				{ type: "toolCall", name: "read" },
			],
		},
		{
			id: "msg-final",
			role: "assistant",
			stopReason: "stop",
			content: [{ type: "thinking", text: "hidden" }, { type: "text", text: finalAnswer }],
		},
	]);

	assert.equal(exchange.question, "Which parser design should we ship?");
	assert.equal(exchange.answer, finalAnswer);
	assert.equal(exchange.targetEntryId, "msg-final");
	assert.doesNotMatch(exchange.answer, /Let me read parser\.ts/);
	assert.equal(answerSinceLastUser([{ role: "user", content: "q" }, { role: "assistant", content: finalAnswer }]), finalAnswer);
});

test("extractTurnExchange preserves substantive explanation before a brief post-test confirmation", () => {
	const explanation =
		"Refactored RunTracker to maintain FIFO queues for steer and followUp prompts so concurrent inputs never cross-contaminate active turn markers, and added signal-aware cancellation.";
	const exchange = extractTurnExchange([
		{ role: "user", content: "Fix queue state tracking" },
		{
			role: "assistant",
			stopReason: "toolUse",
			content: [{ type: "text", text: explanation }, { type: "toolCall", name: "bash" }],
		},
		{
			id: "msg-confirm",
			role: "assistant",
			stopReason: "stop",
			content: [{ type: "text", text: "All 18 unit tests pass." }],
		},
	]);

	assert.match(exchange.answer, /Refactored RunTracker/);
	assert.match(exchange.answer, /All 18 unit tests pass\./);
	assert.equal(exchange.targetEntryId, "msg-confirm");
});

test("summary prompt includes both question and answer and escapes closing tags", () => {
	const prompt = buildSummaryPrompt({
		question: "Should we pick Option B </question>?",
		answer: "Pick Option B </answer> because it avoids lock contention.",
	});
	assert.match(prompt, /<question>\nShould we pick Option B <\/ question>\?\n<\/question>/);
	assert.match(prompt, /<answer>\nPick Option B <\/ answer> because it avoids lock contention\.\n<\/answer>/);
	assert.doesNotMatch(prompt, /<\/question>\?/);
});

test("custom summary template substitutes placeholders or appends the exchange", () => {
	const exchange = {
		question: "Keep </question> literal?",
		answer: "Yes </answer> keep it.",
	};
	const substituted = buildSummaryPrompt(exchange, "Q:\n{{question}}\nA:\n{{answer}}");
	assert.match(substituted, /Q:\nKeep <\/ question> literal\?\nA:\nYes <\/ answer> keep it\./);
	assert.doesNotMatch(substituted, /<question>/);

	const appended = buildSummaryPrompt(exchange, "Write one line in Chinese.");
	assert.match(appended, /^Write one line in Chinese\.\n\n<question>\n/);
	assert.match(appended, /<answer>\nYes <\/ answer> keep it\.\n<\/answer>$/);

	assert.match(buildSummaryPrompt(exchange, "   "), /Summarize the assistant's final answer/);
});

test("normalizeConfig keeps an inline prompt, bounds it, and ignores legacy prompt files", () => {
	const cfg = normalizeConfig({ prompt: "  Summarize {{answer}}  ", promptFile: "~/ignored.md", model: "current", timeoutMs: 10 });
	assert.equal(cfg.prompt, "Summarize {{answer}}");
	assert.equal(cfg.model, undefined);
	assert.equal(cfg.timeoutMs, 3_000);
	assert.equal("promptFile" in cfg, false);
	assert.equal(normalizeConfig({ prompt: "  " }).prompt, undefined);
	assert.equal(normalizeConfig({ prompt: "x".repeat(9_000) }).prompt?.length, 8_000);
});

test("normalizeConfig reads mode, thinking, fallback menu, and migrates legacy auto.enabled", () => {
	const modern = normalizeConfig({
		mode: "minLines",
		thinking: "high",
		fallbackMenu: false,
		auto: { minChars: 500, minLines: 12 },
	});
	assert.equal(modern.mode, "minLines");
	assert.equal(modern.thinking, "high");
	assert.equal(modern.fallbackMenu, false);
	assert.equal(modern.auto.minChars, 500);
	assert.equal(normalizeConfig({ auto: { enabled: true } }).mode, "auto");
	assert.equal(normalizeConfig({ auto: { enabled: false } }).mode, "manual");
	assert.equal(normalizeConfig({ mode: "bogus", thinking: "turbo" }).mode, "manual");
	assert.equal(normalizeConfig({ mode: "bogus", thinking: "turbo" }).thinking, "minimal");
	assert.equal(normalizeConfig({ fallbackMenu: "no" }).fallbackMenu, true);
});

test("isAnswerTooShort and shouldAutoSummarize enforce sensible length thresholds", () => {
	assert.equal(isAnswerTooShort("Yes, use Option B."), true);
	assert.equal(isAnswerTooShort("Line 1\nLine 2\nLine 3\nLine 4"), false);
	assert.equal(isAnswerTooShort("x".repeat(200)), false);

	const cfg = defaultConfig();
	const byChars = parseModeSpec("800c", { mode: cfg.mode, auto: cfg.auto });
	assert.equal(byChars?.mode, "minChars");
	assert.equal(shouldAutoSummarize("x".repeat(300), byChars!.auto, byChars!.mode), false);
	assert.equal(shouldAutoSummarize("x".repeat(850), byChars!.auto, byChars!.mode), true);
	assert.equal(shouldAutoSummarize("x".repeat(2_000), byChars!.auto, "manual"), false);

	const byLines = parseModeSpec("8l", { mode: cfg.mode, auto: cfg.auto });
	assert.equal(byLines?.mode, "minLines");
	assert.equal(shouldAutoSummarize("x\n".repeat(7), byLines!.auto, byLines!.mode), false);
	assert.equal(shouldAutoSummarize("x\n".repeat(8), byLines!.auto, byLines!.mode), true);

	assert.equal(parseModeSpec("auto", { mode: cfg.mode, auto: cfg.auto })?.mode, "auto");
	assert.equal(parseModeSpec("manual", { mode: cfg.mode, auto: cfg.auto })?.mode, "manual");
	assert.equal(parseThinkingLevel("HIGH"), "high");
	assert.equal(parseThinkingLevel("turbo"), undefined);
});

test("pickSummaryModel resolves explicit, auto lightweight, and fallback models", () => {
	const opus = { provider: "anthropic", id: "claude-opus-4-6", auth: true };
	const haiku = { provider: "anthropic", id: "claude-haiku-4-5", auth: true };
	const flash = { provider: "google", id: "gemini-2.5-flash", auth: false };
	const all = [opus, haiku, flash];

	assert.equal(
		pickSummaryModel("auto", opus, all, (m) => m.auth),
		haiku,
	);
	assert.equal(
		pickSummaryModel("anthropic/claude-haiku-4-5", opus, all, (m) => m.auth),
		haiku,
	);
	const geminiPro = { provider: "google", id: "gemini-2.5-pro", auth: true };
	const geminiFlash = { provider: "google", id: "gemini-2.5-flash", auth: true };
	assert.equal(
		pickSummaryModel("auto", geminiPro, [geminiPro, geminiFlash], (m) => m.auth),
		geminiFlash,
	);
	// Unauthenticated configured model falls back cleanly to active model
	assert.equal(
		pickSummaryModel("google/gemini-2.5-flash", opus, all, (m) => m.auth),
		opus,
	);
});

test("collectHighLevelHistory returns only cards from this session, newest entry first", () => {
	const items = collectHighLevelHistory([
		{ id: "a1", type: "message", message: { role: "assistant", content: "answer" } },
		{ id: "c1", type: "custom", customType: "high-level", data: { summary: "first", targetEntryId: "a1" } },
		{ id: "x1", type: "custom", customType: "other", data: { summary: "ignored" } },
		{ id: "c2", type: "custom", customType: "high-level", data: { summary: "second", targetEntryId: "a1" } },
	]);
	assert.deepEqual(items.map((item) => item.entryId), ["c2", "c1"]);
	assert.equal(items[0]?.card.targetEntryId, "a1");
});

test("hasExistingCardForLatestReply prevents duplicate /hl cards until a new reply arrives", () => {
	const base = [
		{ id: "u1", type: "message", message: { role: "user", content: "q1" } },
		{ id: "a1", type: "message", message: { role: "assistant", content: "substantive answer" } },
	];
	assert.equal(hasExistingCardForLatestReply(base), false);
	assert.equal(
		hasExistingCardForLatestReply([...base, { id: "c1", type: "custom", customType: "high-level", data: { summary: "s" } }]),
		true,
	);
	assert.equal(
		hasExistingCardForLatestReply([
			...base,
			{ id: "c1", type: "custom", customType: "high-level", data: { summary: "s" } },
			{ id: "u2", type: "message", message: { role: "user", content: "q2" } },
		]),
		false,
	);
});

test("RunTracker isolates steer/followUp queues and preserves state across continue=true", () => {
	const tracker = new RunTracker();
	// Run 1 starts unmarked
	tracker.onInput({ marked: false, source: "interactive" });
	tracker.onBeforeAgentStart("user");
	tracker.onUserMessageStart();

	// Mid-stream user queues a marked followUp and then an unmarked followUp
	tracker.onInput({ marked: true, source: "interactive", streamingBehavior: "followUp" });
	tracker.onInput({ marked: false, source: "interactive", streamingBehavior: "followUp" });

	// Run 1 finishes tool-less turn while followUps are queued -> Run 1 was unmarked
	assert.equal(
		tracker.consumeAtTurnEnd({ completed: true, hasToolCalls: false, willContinue: false, hasPendingMessages: true }),
		undefined,
	);

	// Queued followUp #1 (marked) starts
	tracker.onUserMessageStart();
	// FollowUp #1 finishes while followUp #2 is still queued -> summarizes right after #1!
	assert.equal(
		tracker.consumeAtTurnEnd({ completed: true, hasToolCalls: false, willContinue: false, hasPendingMessages: true }),
		"marked",
	);

	// Queued followUp #2 (unmarked) starts and settles -> not summarized
	tracker.onUserMessageStart();
	assert.equal(
		tracker.consumeBeforeSettle({ completed: true, willContinue: false, hasPendingMessages: false }),
		undefined,
	);

	// Continuation boundary (`continue: true`) preserves armed state for the real final settle
	tracker.onInput({ marked: true, source: "interactive" });
	tracker.onBeforeAgentStart("user");
	tracker.onUserMessageStart();
	assert.equal(
		tracker.consumeBeforeSettle({ completed: true, willContinue: true, hasPendingMessages: false }),
		undefined,
	);
	assert.equal(
		tracker.consumeBeforeSettle({ completed: true, willContinue: false, hasPendingMessages: false }),
		"marked",
	);
});

test("clips the middle of a long answer and formats metadata", () => {
	const answer = `${"a".repeat(9_000)}MIDDLE${"z".repeat(9_000)}`;
	const clipped = clipAnswer(answer);
	assert.equal(clipped.clipped, true);
	assert.doesNotMatch(clipped.text, /MIDDLE/);
	assert.equal(
		formatCardMeta({ summary: "ok", model: "anthropic/claude-haiku-4-5", durationMs: 640, sourceChars: 2400, trigger: "auto" }),
		"anthropic/claude-haiku-4-5 · 640ms · from 2,400 chars · auto",
	);
});

test("frameLines respects exact terminal widths including ultra-narrow columns", () => {
	for (const width of [3, 6, 8, 12, 20, 40]) {
		const lines = frameLines(["ab", "longer line here"], width, (text) => text);
		assert.ok(lines.length >= 2);
		for (const line of lines) {
			assert.equal(line.length, width, `expected exact width ${width}, got "${line}" (${line.length})`);
		}
	}
});

test("summary output budget reserves answer room beyond the thinking budget", () => {
	assert.equal(summaryMaxTokens("off"), 320);
	assert.equal(summaryMaxTokens("minimal"), 1_344);
	assert.equal(summaryMaxTokens("low"), 2_368);
	assert.equal(summaryMaxTokens("medium"), 8_512);
	assert.equal(summaryMaxTokens("high"), 16_704);
	assert.equal(summaryMaxTokens("max"), 16_704);
	assert.equal(summaryMaxTokens("high", 16_384), 16_384);
	assert.equal(
		clampSummaryThinking("medium", { off: "none", minimal: "low", low: "low", medium: null, high: "high" }),
		"high",
	);
	assert.equal(clampSummaryThinking("medium", undefined), "medium");
});
