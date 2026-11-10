// Derived from pi-sync-suite 0.1.1, Copyright (c) 2026 Murat (MIT).
// Upstream: https://github.com/MuratAitov/pi-sync
import { stripVTControlCharacters } from "node:util";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { SyncService, createConfig, defaultPaths, loadConfig, saveConfig, validatePath, type Config, type PruneResult } from "./core.ts";

type BubbleLine = string | { text: string; onSelect: () => void; current?: boolean };
type Tone = "text" | "muted" | "dim" | "accent" | "success" | "warning" | "error";
type DetailRow = { label: string; value: string; tone?: Tone };
type Choice = string | { value: string; label: string };
type SelectDetails = { description?: string; rows?: () => DetailRow[]; current?: string };
type BubbleContent = { title: string; body: BubbleLine[]; hint: string };
type BubbleHandle = { refresh(): void; close(): void; onClose?(callback: () => void): void };
type PillColors = { background: string; foreground: string };
type BubbleAnchor = PillColors & { key?: string; startColumn?: number; endColumn?: number; centerColumn: number; terminalWidth: number };
type PillAPI = {
  version: number;
  register(key: string, action: (input: { ctx: ExtensionContext; pill?: BubbleAnchor }) => void): () => void;
  showBubble(ctx: ExtensionContext, source: () => BubbleContent, pill?: BubbleAnchor): BubbleHandle | undefined;
};
const STATUS_KEY = "pi-sync";
const pillAPI = () => (globalThis as Record<symbol, unknown>)[Symbol.for("pi-starline.pill-api.v1")] as PillAPI | undefined;
const bubbleAPI = (context: ExtensionContext) => context.mode === "rpc" ? undefined : pillAPI();
const message = (error: unknown) => terminalText(error instanceof Error ? error.message : String(error));
const displayTime = (value?: string) => value ? new Date(value).toLocaleString() : "Never";
const modeLabel = (mode: Config["mode"]) => ({ manual: "Manual", auto: "Auto", off: "Off" })[mode];
const terminalText = (value: string) => stripVTControlCharacters(value).replace(/\r\n?/g, "\n").replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "");
const MAX_ROW_VALUE = 160;
const displayValue = (value: string) => {
  const text = terminalText(value);
  return text.length > MAX_ROW_VALUE ? `${text.slice(0, MAX_ROW_VALUE - 1)}…` : text;
};
const formatBytes = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1024 ** 2 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`;
const formatPruneResult = (result: PruneResult) =>
  `Pruned ${result.removed.length} local and ${result.repoRemoved} snapshot session(s)${result.skipped ? `; skipped ${result.skipped} recent/active` : ""}. Snapshot removal is committed locally; Push to publish.`;
const menuHint = "↑↓ Enter Esc";

export default function amoxPiSync(pi: ExtensionAPI): void {
  let ctx: ExtensionContext | undefined;
  let config: Config | null = null;
  let service: SyncService | undefined;
  let paths = defaultPaths(process.env.PI_CODING_AGENT_DIR);
  let busy: string | undefined;
  let inFlight: Promise<void> | undefined;
  let error: string | undefined;
  let notice: string | undefined;
  let bubble: BubbleHandle | undefined;
  let pillAnchor: BubbleAnchor | undefined;
  const colorChoices = [
    { value: "pill", label: "Follow pill" }, { value: "accent", label: "Theme accent" },
    { value: "success", label: "Theme success" }, { value: "warning", label: "Theme warning" },
    { value: "error", label: "Theme error" },
  ];
  // Keep Starline's cell geometry; only override its colours when requested.
  function bubbleAnchor(context: ExtensionContext): BubbleAnchor {
    const background = () => {
      const color = config?.bubbleColor ?? "pill";
      if (color === "pill" && pillAnchor?.background) return pillAnchor.background;
      return context.ui.theme.getFgAnsi(color === "pill" ? "accent" : color)
        .replace(/\x1b\[(3[0-7]|9[0-7]|38)(?=[;m])/g, (_, code: string) => `\x1b[${Number(code) + 10}`);
    };
    return {
      key: STATUS_KEY,
      centerColumn: (process.stdout.columns || 80) / 2,
      terminalWidth: process.stdout.columns || 80,
      ...pillAnchor,
      get background() { return background(); },
      get foreground() { return (config?.bubbleColor ?? "pill") === "pill" ? pillAnchor?.foreground ?? "" : ""; },
    };
  }
  let unregister: (() => void) | undefined;
  let pullTimer: ReturnType<typeof setInterval> | undefined;
  let watchTimer: ReturnType<typeof setInterval> | undefined;
  let debounce: ReturnType<typeof setTimeout> | undefined;
  let fingerprint: string | undefined;
  let watching = false;
  let generation = 0;

  const stateLabel = () => busy ?? (error ? "Error" : config ? modeLabel(config.mode) : "Not configured");
  const stateTone = (): Tone => error && !busy ? "error" : busy ? "accent" : config?.mode === "off" ? "muted" : config ? "accent" : "warning";
  const publish = () => {
    ctx?.ui.setStatus(STATUS_KEY, `Sync: ${stateLabel()}`);
    bubble?.refresh();
  };

  function stopTimers(): void {
    generation++;
    if (pullTimer) clearInterval(pullTimer);
    if (watchTimer) clearInterval(watchTimer);
    if (debounce) clearTimeout(debounce);
    pullTimer = watchTimer = debounce = undefined;
    fingerprint = undefined;
  }

  function makeService(): SyncService | undefined {
    service = config ? new SyncService(config, paths, async (args, cwd, timeoutMs) => {
      const result = await pi.exec("git", args, { cwd, timeout: timeoutMs });
      return { stdout: result.stdout, stderr: result.stderr, code: result.code, killed: result.killed };
    }) : undefined;
    if (service) service.activeSessionFile = ctx?.sessionManager.getSessionFile();
    return service;
  }

  async function run(label: string, action: (sync: SyncService) => Promise<unknown>, quiet = false): Promise<boolean> {
    if (!service || !config || !ctx) {
      if (!quiet) ctx?.ui.notify("Run /sync-setup <private-ssh-repository> first.", "warning");
      return false;
    }
    if (busy) {
      if (!quiet) ctx.ui.notify(`Sync is busy: ${busy}.`, "warning");
      return false;
    }
    const active = service;
    const context = ctx;
    active.activeSessionFile = context.sessionManager.getSessionFile();
    busy = label;
    let finish!: () => void;
    const settled = new Promise<void>(resolve => { finish = resolve; });
    inFlight = settled;
    error = undefined;
    publish();
    try {
      const pushedFingerprint = label === "Push" ? await active.fingerprint() : undefined;
      const result = await action(active);
      notice = `${label} completed`;
      // Mark only the pre-push snapshot as observed. Changes made while Git
      // runs must remain detectable by the next watcher pass.
      if (pushedFingerprint !== undefined) fingerprint = pushedFingerprint;
      if (!quiet) context.ui.notify(typeof result === "string" ? terminalText(result) : notice, "info");
      return true;
    } catch (failure) {
      error = message(failure);
      notice = `${label} failed`;
      context.ui.notify(`amox-pi-sync ${label}: ${error}`, "error");
      return false;
    } finally {
      busy = undefined;
      publish();
      finish();
      if (inFlight === settled) inFlight = undefined;
    }
  }

  async function pruneSessions(context: ExtensionContext, assumeYes = false): Promise<void> {
    if (busy) { context.ui.notify(`Sync is busy: ${busy}.`, "warning"); return; }
    if (!service || !config) { context.ui.notify("Run /sync-setup first.", "warning"); return; }
    let plan;
    try { plan = await service.planPruneSessions(); }
    catch (failure) { report(failure); return; }
    const count = plan.candidates.length;
    const bytes = plan.candidates.reduce((total, candidate) => total + candidate.bytes, 0);
    const skipped = plan.skipped ? `\nSkipped: ${plan.skipped} recent/active session(s).` : "";
    if (!count) { context.ui.notify(`No orphan subagent sessions to prune.${skipped}`, "info"); return; }
    const preview = plan.candidates.slice(0, 5).map(candidate => `• ${candidate.name} (${formatBytes(candidate.bytes)})`).join("\n");
    const more = count > 5 ? `\n… and ${count - 5} more` : "";
    const description = `${count} orphan subagent session(s), ${formatBytes(bytes)} total.\n${preview}${more}${skipped}\n\nSnapshot copies are committed locally first, then local files are deleted. Push afterwards to publish the deletion. Parent lookup is local; Pull first if another device may have the parent.`;
    if (assumeYes) context.ui.notify(`Pruning ${count} orphan session(s), ${formatBytes(bytes)}.${skipped}`, "info");
    else if (!await confirm(context, "Prune orphan sessions?", description)) return;
    await run("Prune", async sync => formatPruneResult(await sync.pruneOrphanSessions(plan.candidates.map(candidate => candidate.path))));
  }

  async function pushWithPrune(quiet = false): Promise<boolean> {
    if (busy) return await run("Push", sync => sync.push(), quiet);
    if (config?.pruneOrphanSessionsBeforePush && service && ctx) {
      try {
        const result = await service.pruneOrphanSessions();
        if (!quiet && (result.removed.length || result.repoRemoved)) ctx.ui.notify(formatPruneResult(result), "info");
      } catch (failure) {
        ctx.ui.notify(`amox-pi-sync prune: ${message(failure)}`, "warning");
      }
    }
    return await run("Push", sync => sync.push(), quiet);
  }

  async function startTimers(): Promise<void> {
    stopTimers();
    const token = generation;
    if (!config || !service || config.mode !== "auto") return;
    const active = service;
    try {
      fingerprint = await active.fingerprint();
    } catch (failure) {
      error = message(failure);
      ctx?.ui.notify(`amox-pi-sync watcher: ${error}`, "error");
      publish();
      return;
    }
    if (token !== generation) return;
    pullTimer = setInterval(() => {
      if (!busy) void run("Pull", sync => sync.pull(), true);
    }, config.pullIntervalMinutes * 60_000);
    watchTimer = setInterval(() => {
      if (busy || watching) return;
      watching = true;
      void active.fingerprint().then(next => {
        if (token !== generation || next === fingerprint || busy) return;
        if (debounce) clearTimeout(debounce);
        debounce = setTimeout(() => {
          if (token === generation && !busy) void pushWithPrune(true);
        }, config!.pushDebounceMs);
      }).catch(failure => {
        const text = message(failure);
        if (text !== error) ctx?.ui.notify(`amox-pi-sync watcher: ${text}`, "error");
        error = text;
        publish();
      }).finally(() => { watching = false; });
    }, config.watchIntervalMs);
    // Do not await network during session startup.
    void run("Pull", sync => sync.pull(), true);
  }

  function overviewRows(): DetailRow[] {
    if (!config || !service) return [
      { label: "State", value: stateLabel(), tone: stateTone() },
      { label: "Setup", value: "/sync-setup <private-ssh-repository>", tone: "accent" },
      ...(error ? [{ label: "Error", value: error, tone: "error" as const }] : []),
    ];
    return [
      { label: "State", value: stateLabel(), tone: stateTone() },
      ...(busy || error ? [{ label: "Mode", value: modeLabel(config.mode), tone: "muted" as const }] : []),
      { label: "Paths", value: config.paths.join(", ") || "None" },
      { label: "Remote", value: config.repoUrl },
    ];
  }

  function detailRows(): DetailRow[] {
    const rows = overviewRows();
    if (!config || !service) return rows;
    const status = service.status;
    const local = status.localChanges?.trim();
    const remoteChecked = Boolean(status.checkedAt) && status.remoteChanges !== undefined;
    return [
      ...rows,
      { label: "Last push", value: displayTime(config.lastPushAt), tone: config.lastPushAt ? "text" : "dim" },
      { label: "Last pull", value: displayTime(config.lastPullAt), tone: config.lastPullAt ? "text" : "dim" },
      { label: "Last check", value: displayTime(status.checkedAt), tone: status.checkedAt ? "text" : "dim" },
      { label: "Local changes", value: local || (status.checkedAt ? "None at last check" : "Not checked"), tone: local ? "warning" : status.checkedAt ? "success" : "dim" },
      { label: "Remote updates", value: remoteChecked ? String(status.remoteChanges) : "Not checked", tone: remoteChecked ? status.remoteChanges ? "warning" : "success" : "dim" },
      ...(config.lastResult ? [{ label: "Last sync", value: config.lastResult }] : []),
      ...(notice ? [{ label: "Last action", value: notice }] : []),
      ...(error ? [{ label: "Error", value: error, tone: "error" as const }] : []),
    ];
  }

  function detailLines(): string[] {
    return detailRows().map(row => `${row.label}: ${terminalText(row.value)}`);
  }

  function renderRows(context: ExtensionContext, rows: DetailRow[]): string[] {
    const theme = context.ui.theme;
    return rows.map(row => theme.fg("muted", `${`${row.label}:`.padEnd(15)} `)
      + theme.fg(row.tone ?? "text", row.label === "State" ? theme.bold(displayValue(row.value)) : displayValue(row.value)));
  }

  // Targets inherit Starline's foreground so a selected row remains legible on
  // its pill-coloured background. Bold adds hierarchy without overriding it.
  const actionText = (context: ExtensionContext, text: string) => context.ui.theme.bold(`• ${terminalText(text)}`);

  function content(context: ExtensionContext): BubbleContent {
    const body: BubbleLine[] = renderRows(context, detailRows());
    if (config && !busy) {
      body.push("", context.ui.theme.fg("muted", "Actions"),
        { text: actionText(context, "Check status"), onSelect: () => { void run("Check", sync => sync.check()); } },
        { text: actionText(context, "Push"), onSelect: () => { void pushWithPrune(); } },
        { text: actionText(context, "Pull"), onSelect: () => { void run("Pull", sync => sync.pull()); } },
        { text: actionText(context, "Prune orphan sessions"), onSelect: () => { void pruneSessions(context); } },
      );
    } else if (!busy) body.push("");
    if (!busy) body.push({ text: actionText(context, "Settings"), onSelect: () => settings(context).catch(report) });
    body.push("", context.ui.theme.fg("dim", "Values reflect the last check."));
    return { title: "Amox Pi Sync", body, hint: menuHint };
  }

  function showStatus(context: ExtensionContext): void {
    const api = bubbleAPI(context);
    if (api?.version === 1 && context.hasUI) {
      bubble = api.showBubble(context, () => content(context), bubbleAnchor(context));
    } else {
      context.ui.notify(detailLines().join("\n"), error ? "warning" : "info");
    }
  }

  async function select(context: ExtensionContext, title: string, options: Choice[], details: SelectDetails = {}): Promise<string | undefined> {
    const choices = options.map(option => typeof option === "string" ? { value: option, label: option } : option);
    const nativeSelect = async () => {
      const heading = details.description ? `${title}\n${terminalText(details.description)}` : title;
      const label = await context.ui.select(heading, choices.map(choice => terminalText(choice.label)));
      return choices.find(choice => terminalText(choice.label) === label)?.value;
    };
    const api = bubbleAPI(context);
    if (api?.version !== 1 || !context.hasUI) return nativeSelect();
    return new Promise(resolve => {
      let selected = false;
      const handle = api.showBubble(context, () => ({
        title,
        body: [
          ...(details.rows ? [...renderRows(context, details.rows()), ""] : []),
          ...(details.description ? [context.ui.theme.fg("muted", terminalText(details.description)), ""] : []),
          ...choices.map(choice => ({ text: actionText(context, choice.label), current: choice.value === details.current,
            onSelect: () => { selected = true; resolve(choice.value); } })),
        ],
        hint: menuHint,
      }), bubbleAnchor(context));
      bubble = handle;
      if (handle?.onClose) {
        // Starline closes the bubble before calling a target's onSelect.
        // Defer cancellation until that synchronous callback has run.
        handle.onClose(() => queueMicrotask(() => { if (!selected) resolve(undefined); }));
      } else {
        handle?.close();
        void nativeSelect().then(resolve);
      }
    });
  }

  async function confirm(context: ExtensionContext, title: string, description: string): Promise<boolean> {
    if (bubbleAPI(context)?.version !== 1 || !context.hasUI) return context.ui.confirm(title, description);
    return await select(context, title, ["Cancel", "Confirm"], { description, current: "Cancel" }) === "Confirm";
  }

  const report = (failure: unknown) => {
    error = message(failure);
    ctx?.ui.notify(`amox-pi-sync: ${error}`, "error");
    publish();
  };

  async function persist(next: Config): Promise<void> {
    if (busy) throw new Error(`Sync is busy: ${busy}; retry the settings change after it finishes.`);
    await saveConfig(next, paths);
    config = next;
    makeService();
    publish();
    await startTimers();
  }

  async function settings(context: ExtensionContext): Promise<void> {
    if (busy) { context.ui.notify(`Sync is busy: ${busy}.`, "warning"); return; }
    for (;;) {
      const choice = await select(context, "Sync settings", [
        { value: "status", label: "Status" },
        { value: "mode", label: `Mode: ${config ? modeLabel(config.mode) : "Not configured"}` },
        { value: "paths", label: `Paths: ${config?.paths.length ?? 0} configured` },
        { value: "prune", label: `Prune before push: ${config?.pruneOrphanSessionsBeforePush ? "On" : "Off"}` },
        ...(bubbleAPI(context)?.version === 1 ? [{ value: "color", label: `Bubble colour: ${colorChoices.find(choice => choice.value === (config?.bubbleColor ?? "pill"))!.label}` }] : []),
        "Backups", "Cleanup", "Diagnostics", "Back",
      ], { rows: overviewRows });
      if (!choice || choice === "Back") return;
      if (choice === "status") { showStatus(context); return; }
      if (!config || !service) { context.ui.notify("Run /sync-setup first.", "warning"); continue; }
      if (choice === "prune") {
        const next = { ...config, pruneOrphanSessionsBeforePush: !config.pruneOrphanSessionsBeforePush };
        await persist(next);
      } else if (choice === "color") {
        const selected = await select(context, "Sync bubble colour", [...colorChoices, "Back"], { current: config.bubbleColor ?? "pill" });
        if (!selected || selected === "Back") continue;
        const next = { ...config, bubbleColor: selected as NonNullable<Config["bubbleColor"]> };
        await saveConfig(next, paths);
        config.bubbleColor = next.bubbleColor;
        publish();
      } else if (choice === "mode") {
        const selected = await select(context, "Sync mode", ["Manual", "Auto", "Off", "Back"], {
          current: modeLabel(config.mode), description: "Auto runs in the background. Manual and Off still allow Push and Pull.",
        });
        if (!selected || selected === "Back") continue;
        const next = structuredClone(config);
        if (selected === "Auto") {
          const minutes = await context.ui.input("Pull interval in minutes", String(config.pullIntervalMinutes));
          if (minutes === undefined) continue;
          if (!/^\d+$/.test(minutes) || Number(minutes) < 1 || Number(minutes) > 35_790) {
            context.ui.notify("Use a whole number from 1 to 35790 minutes.", "error"); continue;
          }
          next.pullIntervalMinutes = Number(minutes);
        }
        next.mode = selected.toLowerCase() as Config["mode"];
        await persist(next);
      } else if (choice === "paths") {
        const selected = await select(context, "Sync paths", [
          ...config.paths.map(item => `Exclude ${item}`), "Include path", "Back",
        ]);
        if (!selected || selected === "Back") continue;
        const next = structuredClone(config);
        if (selected === "Include path") {
          const entered = await context.ui.input("Relative path inside Pi agent directory", "missions");
          if (!entered) continue;
          const item = validatePath(entered);
          if (!next.paths.includes(item)) next.paths.push(item);
        } else next.paths = next.paths.filter(item => `Exclude ${item}` !== selected);
        await persist(next);
      } else if (choice === "Backups") {
        const selected = await select(context, "Backups", ["Create", "List", "Restore", "Back"], { description: "Local backups. Cleanup is manual; nothing is deleted automatically." });
        if (selected === "Create") await run("Create backup", async sync => {
          const backup = await sync.backup(); return JSON.stringify(backup, null, 2);
        });
        if (selected === "List") await run("List backups", async sync => JSON.stringify(await sync.listBackups(), null, 2));
        if (selected === "Restore") {
          const backups = await service.listBackups();
          if (!backups.length) { context.ui.notify("No backups.", "info"); continue; }
          const id = await context.ui.input("Backup ID", "latest");
          if (!id) continue;
          if (!await confirm(context, "Restore backup?", "Matching managed files can be overwritten. A pre-restore backup will be created. The active session cannot be replaced.")) continue;
          await run("Restore backup", sync => sync.restore(id));
        }
      } else if (choice === "Cleanup") {
        const selected = await select(context, "Backup cleanup", ["Preview", "Delete eligible backups", "Delete backup", "Retention", "Back"], { description: "Only complete local backups can be deleted. Sessions and missions are never cleanup targets." });
        if (selected === "Preview" || selected === "Delete eligible backups") {
          let candidates: Awaited<ReturnType<SyncService["planCleanup"]>> = [];
          const planned = await run("Preview cleanup", async sync => {
            candidates = await sync.planCleanup();
            return candidates.length ? JSON.stringify(candidates, null, 2) : "No backup cleanup candidates.";
          });
          if (!planned || selected !== "Delete eligible backups" || !candidates.length) continue;
          if (await confirm(context, "Delete complete backups?", `Delete ${candidates.length} previewed backup(s)? Sessions, missions and the sync repository will not be deleted.`)) {
            await run("Delete backups", async sync => `Deleted ${await sync.applyCleanup(candidates.map(item => item.id))} backup(s).`);
          }
        } else if (selected === "Delete backup") {
          const backups = await service.listBackups();
          if (!backups.length) { context.ui.notify("No backups.", "info"); continue; }
          const id = await select(context, "Choose backup to delete", [...backups.map(item => item.id), "Back"]);
          if (!id || id === "Back") continue;
          if (await confirm(context, "Delete backup?", `Permanently delete local backup ${id}?`)) {
            await run("Delete backups", async sync => `Deleted ${await sync.applyCleanup([id])} backup.`);
          }
        } else if (selected === "Retention") {
          const keep = await context.ui.input("Keep newest complete backups (0 or more)", String(config.retention?.keepBackups ?? 20));
          if (keep === undefined) continue;
          const days = await context.ui.input("Maximum backup age in days (1 or more)", String(config.retention?.maxAgeDays ?? 180));
          if (days === undefined) continue;
          if (!/^\d+$/.test(keep) || !/^\d+$/.test(days) || !Number.isSafeInteger(Number(keep)) || !Number.isSafeInteger(Number(days)) || Number(days) < 1) {
            context.ui.notify("Retention requires a nonnegative whole backup count and positive whole day count.", "error"); continue;
          }
          const next = structuredClone(config);
          next.retention = { keepBackups: Number(keep), maxAgeDays: Number(days) };
          await persist(next);
          context.ui.notify("Retention saved. Cleanup remains manual; no files deleted.", "info");
        }
      } else if (choice === "Diagnostics") {
        const selected = await select(context, "Diagnostics", ["Doctor", "Check status", "View log", "Back"]);
        if (selected === "Doctor") await run("Doctor", async sync => JSON.stringify(await sync.doctor(), null, 2));
        if (selected === "Check status") await run("Check", async sync => { await sync.check(); return detailLines().join("\n"); });
        if (selected === "View log") await run("View log", sync => sync.log());
      }
    }
  }

  pi.on("session_start", async (_event, context) => {
    stopTimers();
    ctx = context;
    paths = defaultPaths(process.env.PI_CODING_AGENT_DIR);
    config = null;
    service = undefined;
    error = undefined;
    try {
      config = await loadConfig(paths);
      const active = makeService();
      if (active) await active.initializeBaseline();
    } catch (failure) { error = message(failure); context.ui.notify(`amox-pi-sync config: ${error}`, "error"); }
    // Clear the old upstream widget without creating a replacement widget.
    context.ui.setWidget(STATUS_KEY, undefined);
    publish();
    unregister?.();
    const api = bubbleAPI(context);
    pillAnchor = undefined;
    unregister = api?.version === 1 ? api.register(STATUS_KEY, ({ ctx: current, pill }) => {
      if (pill) pillAnchor = pill;
      showStatus(current);
    }) : undefined;
    await startTimers();
  });

  pi.on("session_shutdown", async () => {
    stopTimers();
    unregister?.();
    unregister = undefined;
    bubble?.close();
    bubble = undefined;
    await inFlight;
    ctx?.ui.setStatus(STATUS_KEY, undefined);
    ctx = undefined;
  });

  pi.registerCommand("sync-status", {
    description: "Show sync state, managed paths, last results and actions",
    handler: async (_args, context) => { showStatus(context); },
  });
  pi.registerCommand("sync-settings", {
    description: "Manage sync mode, paths, backups and diagnostics",
    handler: async (_args, context) => { await settings(context).catch(report); },
  });
  pi.registerCommand("sync-push", {
    description: "Push the managed raw data snapshot",
    handler: async () => { await pushWithPrune(); },
  });
  pi.registerCommand("sync-prune", {
    description: "Preview and delete orphan subagent sessions and their snapshot copies",
    handler: async (args, context) => {
      const flag = args.trim();
      if (flag && flag !== "--yes") { context.ui.notify("Usage: /sync-prune [--yes]", "warning"); return; }
      await pruneSessions(context, flag === "--yes");
    },
  });
  pi.registerCommand("sync-pull", {
    description: "Pull raw data, backing up files before replacement",
    handler: async () => { await run("Pull", sync => sync.pull()); },
  });
  pi.registerCommand("sync-setup", {
    description: "Configure a private SSH repository: /sync-setup <ssh-url> [pull-minutes]",
    handler: async (args, context) => {
      if (busy) { context.ui.notify(`Sync is busy: ${busy}.`, "warning"); return; }
      try {
        const [url, interval, ...extra] = args.trim().split(/\s+/);
        if (!url || extra.length) throw new Error("Usage: /sync-setup <private-ssh-url> [pull-minutes]");
        const next = createConfig(url, paths);
        if (interval !== undefined) {
          if (!/^\d+$/.test(interval) || Number(interval) < 1 || Number(interval) > 35_790) throw new Error("Pull interval must be 1–35790 whole minutes.");
          next.pullIntervalMinutes = Number(interval);
        }
        if (config) {
          if (!await confirm(context, "Replace sync repository configuration?", "Existing managed paths and mode will be retained; no data is transferred by setup.")) return;
          next.paths = [...config.paths];
          next.mode = config.mode;
          next.bubbleColor = config.bubbleColor;
          next.pruneOrphanSessionsBeforePush = config.pruneOrphanSessionsBeforePush;
        }
        if (busy) throw new Error(`Sync is busy: ${busy}; retry setup after it finishes.`);
        stopTimers();
        await saveConfig(next, paths);
        config = next;
        makeService();
        error = undefined;
        publish();
        // Setup changes configuration only; automatic work starts on next reload/mode change.
        stopTimers();
        context.ui.notify("Configured. No transfer performed. Use /sync-status; reload to activate automatic mode if enabled.", "info");
      } catch (failure) { report(failure); }
    },
  });
}
