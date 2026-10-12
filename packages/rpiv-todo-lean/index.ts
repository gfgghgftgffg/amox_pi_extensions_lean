import type { ExtensionAPI, ExtensionContext, ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import todo from "@juicesharp/rpiv-todo";
import { replayFromBranch } from "@juicesharp/rpiv-todo/state/replay.js";
import { evictSession, getState, replaceState, sid } from "@juicesharp/rpiv-todo/state/store.js";
import { TOOL_NAME } from "@juicesharp/rpiv-todo/todo.js";
import { TodoOverlay } from "@juicesharp/rpiv-todo/todo-overlay.js";

const COLLAPSED_DISPLAY_SERVICE = Symbol.for(
	"@local/pi-collapsed-tools.display-service.v1",
);

type CollapsedDisplayTool = { name: string };
type CollapsedDisplayService = {
	readonly version: 1;
	decorate<T extends CollapsedDisplayTool>(tool: T): T;
};

function decorateWithCollapsedDisplay<T extends CollapsedDisplayTool>(tool: T): T {
	const services = globalThis as unknown as Record<PropertyKey, unknown>;
	const candidate = services[COLLAPSED_DISPLAY_SERVICE];
	if (!candidate || typeof candidate !== "object") return tool;
	const service = candidate as Partial<CollapsedDisplayService>;
	return service.version === 1 && typeof service.decorate === "function"
		? service.decorate(tool)
		: tool;
}

const TOOL_DESCRIPTION = "Task tracker. action is required: create|update|list|get|delete|clear; create needs subject; update/get/delete need id.";
const PROMPT_SNIPPET = "";
const PROMPT_GUIDELINES = [
	"todo: Use for multi-step tasks. update needs changed fields; list accepts status/includeDeleted; clear removes all; create supports blockedBy; update supports addBlockedBy/removeBlockedBy; keep one in_progress and complete tasks promptly.",
];

function prepareTodoArguments(args: unknown): unknown {
	if (!args || typeof args !== "object" || Array.isArray(args)) return args;
	const input = { ...(args as Record<string, unknown>) };
	if (input.action !== undefined) return input;
	const mutableFields = [
		"subject", "description", "activeForm", "status", "owner", "metadata", "addBlockedBy", "removeBlockedBy",
	];
	if (input.id !== undefined && mutableFields.some((field) => field in input)) input.action = "update";
	else if (typeof input.subject === "string") input.action = "create";
	return input;
}

function removeSchemaDescriptions(value: unknown, seen = new Set<object>(), isPropertiesMap = false): void {
	if (value === null || typeof value !== "object" || seen.has(value)) return;
	seen.add(value);
	if (!isPropertiesMap) delete (value as Record<string, unknown>).description;
	for (const [key, child] of Object.entries(value)) {
		removeSchemaDescriptions(child, seen, key === "properties");
	}
}

// Pi 1.1 invalidates the extension runner and throws this exact phrase from a
// dead ctx proxy; older Pi hosts used the shorter message. Match the stable
// substrings so unrelated replay bugs still propagate instead of being swallowed.
function isStaleCtxError(e: unknown): boolean {
	const message = e instanceof Error ? e.message : String(e);
	return message.includes("Session is no longer valid")
		|| message.includes("stale after session replacement");
}

/** Classify a ctx without letting a recognized stale error escape. */
function ctxKind(ctx: ExtensionContext | undefined): "rpc" | "other" | "stale" {
	if (!ctx) return "other";
	try {
		return ctx.mode === "rpc" ? "rpc" : "other";
	} catch (e) {
		if (!isStaleCtxError(e)) throw e;
		return "stale";
	}
}

/** `ctx.hasUI ? ctx.ui : undefined`, tolerant of a recognized stale ctx. */
function rpcUiContext(ctx: ExtensionContext): ExtensionUIContext | undefined {
	try {
		return ctx.hasUI ? ctx.ui : undefined;
	} catch (e) {
		if (!isStaleCtxError(e)) throw e;
		return undefined;
	}
}

interface RpcSessionEntry {
	sessionId: string;
	uiCtx: ExtensionUIContext | undefined;
	overlay: TodoOverlay;
	generation: number;
}

const rpcSessions = new Map<string, RpcSessionEntry>();

export function __resetRpcSessions(): void {
	rpcSessions.clear();
}

function createRpcSessionOverlay(sessionId: string): TodoOverlay {
	const overlay = new TodoOverlay();
	const host = overlay as unknown as {
		lastNextId?: number;
		resetCompletedDisplayState(): void;
		completedTaskIdsPendingHide: Set<number>;
		hiddenCompletedTaskIds: Set<number>;
		getSnapshot(): { tasks: any[]; nextId: number };
	};

	host.getSnapshot = function () {
		const state = getState(sessionId);
		if (this.lastNextId !== undefined && state.nextId < this.lastNextId) {
			this.resetCompletedDisplayState();
		}
		this.lastNextId = state.nextId;
		const completedTaskIds = new Set(
			state.tasks.filter((task: any) => task.status === "completed").map((task: any) => task.id),
		);
		for (const taskId of this.completedTaskIdsPendingHide) {
			if (!completedTaskIds.has(taskId)) this.completedTaskIdsPendingHide.delete(taskId);
		}
		for (const taskId of this.hiddenCompletedTaskIds) {
			if (!completedTaskIds.has(taskId)) this.hiddenCompletedTaskIds.delete(taskId);
		}
		return { tasks: [...state.tasks], nextId: state.nextId };
	};

	return overlay;
}

function getOrCreateRpcEntry(id: string, ui: ExtensionUIContext): RpcSessionEntry {
	let entry = rpcSessions.get(id);
	if (!entry) {
		entry = {
			sessionId: id,
			uiCtx: ui,
			overlay: createRpcSessionOverlay(id),
			generation: 0,
		};
		rpcSessions.set(id, entry);
	}
	if (entry.uiCtx !== ui) {
		entry.uiCtx = ui;
		entry.overlay.setUICtx(ui);
	}
	return entry;
}

async function handleSessionStart(
	event: unknown,
	ctx: ExtensionContext,
	upstreamHandler?: (event: unknown, ctx: ExtensionContext) => unknown,
): Promise<void> {
	const kind = ctxKind(ctx);
	if (kind !== "rpc") {
		if (kind === "other") await upstreamHandler?.(event, ctx);
		return;
	}

	let id: string;
	try {
		id = sid(ctx);
		replaceState(id, replayFromBranch(ctx as never));
	} catch (e) {
		if (!isStaleCtxError(e)) throw e;
		return;
	}

	const ui = rpcUiContext(ctx);
	if (!ui) return;

	const entry = getOrCreateRpcEntry(id, ui);
	entry.overlay.setUICtx(ui);
	entry.overlay.resetCompletedDisplayState();
	entry.generation++;
	entry.overlay.update();
}

async function handleToolExecutionEnd(
	event: any,
	ctx: ExtensionContext,
	upstreamHandler?: (event: unknown, ctx: ExtensionContext) => unknown,
): Promise<void> {
	const kind = ctxKind(ctx);
	if (kind !== "rpc") {
		if (kind === "other") await upstreamHandler?.(event, ctx);
		return;
	}

	if (event?.toolName !== TOOL_NAME || event?.isError) return;

	let id: string;
	try {
		id = sid(ctx);
	} catch (e) {
		if (!isStaleCtxError(e)) throw e;
		return;
	}

	const ui = rpcUiContext(ctx);
	if (!ui) return;

	const entry = getOrCreateRpcEntry(id, ui);
	entry.overlay.setUICtx(ui);
	entry.overlay.update();
}

async function handleSessionCompact(
	event: unknown,
	ctx: ExtensionContext,
	upstreamHandler?: (event: unknown, ctx: ExtensionContext) => unknown,
): Promise<void> {
	const kind = ctxKind(ctx);
	if (kind !== "rpc") {
		if (kind === "other") await upstreamHandler?.(event, ctx);
		return;
	}

	let id: string;
	try {
		id = sid(ctx);
		replaceState(id, replayFromBranch(ctx as never));
	} catch (e) {
		if (!isStaleCtxError(e)) throw e;
		return;
	}

	const entry = rpcSessions.get(id);
	if (entry) {
		entry.overlay.resetCompletedDisplayState();
		entry.overlay.update();
	}
}

async function handleSessionTree(
	event: unknown,
	ctx: ExtensionContext,
	upstreamHandler?: (event: unknown, ctx: ExtensionContext) => unknown,
): Promise<void> {
	const kind = ctxKind(ctx);
	if (kind !== "rpc") {
		if (kind === "other") await upstreamHandler?.(event, ctx);
		return;
	}

	let id: string;
	try {
		id = sid(ctx);
		replaceState(id, replayFromBranch(ctx as never));
	} catch (e) {
		if (!isStaleCtxError(e)) throw e;
		return;
	}

	const entry = rpcSessions.get(id);
	if (entry) {
		entry.overlay.resetCompletedDisplayState();
		entry.overlay.update();
	}
}

async function handleSessionShutdown(
	event: unknown,
	ctx: ExtensionContext,
	upstreamHandler?: (event: unknown, ctx: ExtensionContext) => unknown,
): Promise<void> {
	const kind = ctxKind(ctx);
	if (kind !== "rpc") {
		if (kind === "other") await upstreamHandler?.(event, ctx);
		return;
	}

	let id: string;
	try {
		id = sid(ctx);
	} catch (e) {
		if (!isStaleCtxError(e)) throw e;
		return;
	}

	evictSession(id);
	const entry = rpcSessions.get(id);
	if (entry) {
		entry.overlay.dispose();
		rpcSessions.delete(id);
	}
}

async function handleAgentStart(
	event: unknown,
	ctx: ExtensionContext,
	upstreamHandler?: (event: unknown, ctx: ExtensionContext) => unknown,
): Promise<void> {
	const kind = ctxKind(ctx);
	if (kind !== "rpc") {
		if (kind === "other") await upstreamHandler?.(event, ctx);
		return;
	}

	let id: string;
	try {
		id = sid(ctx);
	} catch (e) {
		if (!isStaleCtxError(e)) throw e;
		return;
	}

	const entry = rpcSessions.get(id);
	entry?.overlay.hideCompletedTasksFromPreviousTurn();
}

function handleShortcut(
	ctx: ExtensionContext,
	upstreamHandler?: (ctx: ExtensionContext) => unknown,
): void {
	const kind = ctxKind(ctx);
	if (kind === "other") {
		upstreamHandler?.(ctx);
		return;
	}
	if (kind === "stale") return;

	if (!rpcUiContext(ctx)) return;
	let id: string;
	try {
		id = sid(ctx);
	} catch (e) {
		if (!isStaleCtxError(e)) throw e;
		return;
	}

	const entry = rpcSessions.get(id);
	if (entry?.overlay.isRegistered()) {
		entry.overlay.toggleCollapse();
	}
}

export default function (pi: ExtensionAPI): void {
	const leanPi = new Proxy(pi, {
		get(target, property) {
			if (property === "registerTool") {
				return (tool: Parameters<ExtensionAPI["registerTool"]>[0]) => {
					if (tool.name === "todo") {
						removeSchemaDescriptions(tool.parameters);
						return target.registerTool(decorateWithCollapsedDisplay({
							...tool,
							description: TOOL_DESCRIPTION,
							promptSnippet: PROMPT_SNIPPET,
							promptGuidelines: PROMPT_GUIDELINES,
							prepareArguments: (args) => prepareTodoArguments(tool.prepareArguments?.(args) ?? args) as never,
						}));
					}
					return target.registerTool(decorateWithCollapsedDisplay(tool));
				};
			}

			if (property === "on") {
				return (event: string, handler: (event: unknown, ctx: ExtensionContext) => unknown) => {
					switch (event) {
						case "session_start":
							return target.on("session_start", (e, ctx) => handleSessionStart(e, ctx, handler));
						case "tool_execution_end":
							return target.on("tool_execution_end", (e, ctx) => handleToolExecutionEnd(e, ctx, handler));
						case "session_compact":
							return target.on("session_compact", (e, ctx) => handleSessionCompact(e, ctx, handler));
						case "session_tree":
							return target.on("session_tree", (e, ctx) => handleSessionTree(e, ctx, handler));
						case "session_shutdown":
							return target.on("session_shutdown", (e, ctx) => handleSessionShutdown(e, ctx, handler));
						case "agent_start":
							return target.on("agent_start", (e, ctx) => handleAgentStart(e, ctx, handler));
						default:
							return target.on(event as never, handler as never);
					}
				};
			}

			if (property === "registerShortcut") {
				return (key: string, shortcut: { description?: string; handler: (ctx: ExtensionContext) => unknown }) => {
					const wrappedShortcut = {
						...shortcut,
						handler: (ctx: ExtensionContext) => handleShortcut(ctx, shortcut.handler),
					};
					return target.registerShortcut(key as never, wrappedShortcut as never);
				};
			}

			if (property === "registerCommand") {
				return (name: string, command: { description?: string; handler: (args: string, ctx: ExtensionContext) => unknown }) => {
					if (name === "todos") {
						const wrappedCommand = {
							...command,
							handler: async (args: string, ctx: ExtensionContext) => {
								const kind = ctxKind(ctx);
								try {
									// Await the real upstream command inside the guard: a recognized
									// stale rejection settles here instead of escaping as an unhandled
									// rejection, unrelated async failures still reach the caller, and the
									// RPC overlay refresh stays ordered after upstream completion.
									await command.handler(args, ctx);
									if (kind !== "rpc") return;
									const ui = rpcUiContext(ctx);
									if (!ui) return;
									const id = sid(ctx);
									const entry = getOrCreateRpcEntry(id, ui);
									entry.overlay.update();
								} catch (e) {
									if (!isStaleCtxError(e)) throw e;
								}
							},
						};
						return target.registerCommand(name, wrappedCommand as never);
					}
					return target.registerCommand(name, command as never);
				};
			}

			const member = Reflect.get(target, property, target);
			return typeof member === "function" ? member.bind(target) : member;
		},
	});

	todo(leanPi);
}
