// Derived from pi-sync-suite 0.1.1, Copyright (c) 2026 Murat (MIT).
// Upstream: https://github.com/MuratAitov/pi-sync
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { SyncService, createConfig, defaultPaths, loadConfig, saveConfig, validatePath, type Config } from "./core.ts";

type BubbleLine = string | { text: string; onSelect: () => void };
type BubbleContent = { title: string; body: BubbleLine[]; hint: string };
type BubbleHandle = { refresh(): void; close(): void; onClose?(callback: () => void): void };
type PillAPI = {
  version: number;
  register(key: string, action: (input: { ctx: ExtensionContext; pill?: unknown }) => void): () => void;
  showBubble(ctx: ExtensionContext, source: () => BubbleContent, pill?: unknown): BubbleHandle | undefined;
};
const STATUS_KEY = "pi-sync";
const pillAPI = () => (globalThis as Record<symbol, unknown>)[Symbol.for("pi-starline.pill-api.v1")] as PillAPI | undefined;
const message = (error: unknown) => error instanceof Error ? error.message : String(error);
const displayTime = (value?: string) => value ? new Date(value).toLocaleString() : "never";

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
  let unregister: (() => void) | undefined;
  let pullTimer: ReturnType<typeof setInterval> | undefined;
  let watchTimer: ReturnType<typeof setInterval> | undefined;
  let debounce: ReturnType<typeof setTimeout> | undefined;
  let fingerprint: string | undefined;
  let watching = false;
  let generation = 0;

  const publish = () => {
    ctx?.ui.setStatus(STATUS_KEY, `Sync: ${busy ?? (error ? "error" : config?.mode ?? "setup")}`);
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

  function makeService(): void {
    service = config ? new SyncService(config, paths, async (args, cwd) => {
      const result = await pi.exec("git", args, { cwd, timeout: 60_000 });
      return { stdout: result.stdout, stderr: result.stderr, code: result.code };
    }) : undefined;
    if (service) service.activeSessionFile = ctx?.sessionManager.getSessionFile();
  }

  async function run(label: string, action: (sync: SyncService) => Promise<unknown>, quiet = false): Promise<boolean> {
    if (!service || !config || !ctx) {
      if (!quiet) ctx?.ui.notify("Run /sync-setup <private-ssh-repository> first.", "warning");
      return false;
    }
    if (busy) {
      if (!quiet) ctx.ui.notify(`Sync is already ${busy}.`, "warning");
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
      const uploadedFingerprint = label === "uploading" ? await active.fingerprint() : undefined;
      const result = await action(active);
      notice = typeof result === "string" ? result : `${label} completed`;
      // Mark only the pre-upload snapshot as observed. Changes made while Git
      // runs must remain detectable by the next watcher pass.
      if (uploadedFingerprint !== undefined) fingerprint = uploadedFingerprint;
      if (!quiet) context.ui.notify(notice, "info");
      return true;
    } catch (failure) {
      error = message(failure);
      context.ui.notify(`amox-pi-sync ${label}: ${error}`, "error");
      return false;
    } finally {
      busy = undefined;
      publish();
      finish();
      if (inFlight === settled) inFlight = undefined;
    }
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
      if (!busy) void run("downloading", sync => sync.pull(), true);
    }, config.pullIntervalMinutes * 60_000);
    watchTimer = setInterval(() => {
      if (busy || watching) return;
      watching = true;
      void active.fingerprint().then(next => {
        if (token !== generation || next === fingerprint || busy) return;
        if (debounce) clearTimeout(debounce);
        debounce = setTimeout(() => {
          if (token === generation && !busy) void run("uploading", sync => sync.push(), true);
        }, config!.pushDebounceMs);
      }).catch(failure => {
        const text = message(failure);
        if (text !== error) ctx?.ui.notify(`amox-pi-sync watcher: ${text}`, "error");
        error = text;
        publish();
      }).finally(() => { watching = false; });
    }, config.watchIntervalMs);
    // Do not await network during session startup.
    void run("downloading", sync => sync.pull(), true);
  }

  function detailLines(): string[] {
    if (!config || !service) return ["Not configured", "Use /sync-setup <private-ssh-repository>", ...(error ? [`Error: ${error}`] : [])];
    const status = service.status;
    return [
      `State: ${busy ?? (error ? "error" : `idle (${config.mode})`)}`,
      `Objects: ${config.paths.join(", ") || "none"}`,
      `Remote: ${config.repoUrl}`,
      `Last upload: ${displayTime(config.lastPushAt)}`,
      `Last pull: ${displayTime(config.lastPullAt)}`,
      `Local: ${status.localChanges?.trim() || (status.checkedAt ? "no pending changes at last check" : "not checked")}`,
      `Remote updates: ${status.remoteChanges === undefined ? "not checked" : status.remoteChanges}`,
      `Checked: ${displayTime(status.checkedAt)}`,
      ...(config.lastResult ? [`Last sync result: ${config.lastResult}`] : []),
      ...(notice ? [`Last action: ${notice}`] : []),
      ...(error ? [`Error: ${error}`] : []),
    ];
  }

  function content(context: ExtensionContext): BubbleContent {
    const body: BubbleLine[] = detailLines();
    if (config && !busy) {
      body.push(
        { text: "Check status", onSelect: () => { void run("checking", sync => sync.check()); } },
        { text: "Upload", onSelect: () => { void run("uploading", sync => sync.push()); } },
        { text: "Pull", onSelect: () => { void run("downloading", sync => sync.pull()); } },
      );
    }
    if (!busy) body.push({ text: "Settings", onSelect: () => settings(context).catch(report) });
    return { title: "Amox Pi Sync", body, hint: "Last-check values are not a live guarantee · Esc to close" };
  }

  function showStatus(context: ExtensionContext): void {
    const api = pillAPI();
    if (api?.version === 1 && context.hasUI) {
      // All command, pill and menu views share Starline's unanchored placement.
      bubble = api.showBubble(context, () => content(context));
    } else {
      context.ui.notify(detailLines().join("\n"), error ? "warning" : "info");
    }
  }

  async function select(context: ExtensionContext, title: string, options: string[], description?: string): Promise<string | undefined> {
    const api = pillAPI();
    if (api?.version !== 1 || !context.hasUI) return context.ui.select(title, options);
    return new Promise(resolve => {
      let selected = false;
      const handle = api.showBubble(context, () => ({
        title,
        body: [
          ...(description ? [description] : []),
          ...options.map(text => ({ text, onSelect: () => { selected = true; resolve(text); } })),
        ],
        hint: "↑/↓ · Enter to select · Esc to close",
      }));
      bubble = handle;
      if (handle?.onClose) {
        // Starline closes the bubble before calling a target's onSelect.
        // Defer cancellation until that synchronous callback has run.
        handle.onClose(() => queueMicrotask(() => { if (!selected) resolve(undefined); }));
      } else {
        handle?.close();
        void context.ui.select(title, options).then(resolve);
      }
    });
  }

  async function confirm(context: ExtensionContext, title: string, description: string): Promise<boolean> {
    if (pillAPI()?.version !== 1 || !context.hasUI) return context.ui.confirm(title, description);
    return await select(context, title, ["Cancel", "Confirm"], description) === "Confirm";
  }

  const report = (failure: unknown) => {
    error = message(failure);
    ctx?.ui.notify(`amox-pi-sync: ${error}`, "error");
    publish();
  };

  async function persist(next: Config): Promise<void> {
    if (busy) throw new Error(`Sync is already ${busy}; retry the settings change after it finishes.`);
    await saveConfig(next, paths);
    config = next;
    makeService();
    publish();
    await startTimers();
  }

  async function settings(context: ExtensionContext): Promise<void> {
    if (busy) { context.ui.notify(`Sync is already ${busy}.`, "warning"); return; }
    for (;;) {
      const choice = await select(context, "Amox Pi Sync", [
        "View Status", `Sync Mode [${config?.mode ?? "not configured"}]`,
        `Sync Paths [${config?.paths.length ?? 0}]`, "Backups", "Cleanup", "Diagnostics", "Back",
      ]);
      if (!choice || choice === "Back") return;
      if (choice === "View Status") { showStatus(context); return; }
      if (!config || !service) { context.ui.notify("Run /sync-setup first.", "warning"); continue; }
      if (choice.startsWith("Sync Mode")) {
        const selected = await select(context, "Sync mode", ["Manual", "Auto", "Off", "Back"]);
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
      } else if (choice.startsWith("Sync Paths")) {
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
        const selected = await select(context, "Backups (local; no automatic cleanup)", ["Create", "List", "Restore", "Back"]);
        if (selected === "Create") await run("backing up", async sync => {
          const backup = await sync.backup(); return JSON.stringify(backup, null, 2);
        });
        if (selected === "List") await run("listing backups", async sync => JSON.stringify(await sync.listBackups(), null, 2));
        if (selected === "Restore") {
          const backups = await service.listBackups();
          if (!backups.length) { context.ui.notify("No backups.", "info"); continue; }
          const id = await context.ui.input("Backup ID", "latest");
          if (!id) continue;
          if (!await confirm(context, "Restore backup?", "Matching managed files can be overwritten. A pre-restore backup will be created. The active session cannot be replaced.")) continue;
          await run("restoring", sync => sync.restore(id));
        }
      } else if (choice === "Cleanup") {
        const selected = await select(context, "Cleanup (complete local backups only)", ["Preview", "Run", "Delete Selected Backup", "Retention", "Back"]);
        if (selected === "Preview" || selected === "Run") {
          let candidates: Awaited<ReturnType<SyncService["planCleanup"]>> = [];
          const planned = await run("planning cleanup", async sync => {
            candidates = await sync.planCleanup();
            return candidates.length ? JSON.stringify(candidates, null, 2) : "No backup cleanup candidates.";
          });
          if (!planned || selected !== "Run" || !candidates.length) continue;
          if (await confirm(context, "Delete complete backups?", `Delete ${candidates.length} previewed backup(s)? Sessions, missions and the sync repository will not be deleted.`)) {
            await run("cleaning backups", async sync => `Deleted ${await sync.applyCleanup(candidates.map(item => item.id))} backup(s).`);
          }
        } else if (selected === "Delete Selected Backup") {
          const backups = await service.listBackups();
          if (!backups.length) { context.ui.notify("No backups.", "info"); continue; }
          const id = await select(context, "Select complete backup to delete", [...backups.map(item => item.id), "Back"]);
          if (!id || id === "Back") continue;
          if (await confirm(context, "Delete backup?", `Permanently delete local backup ${id}?`)) {
            await run("cleaning backups", async sync => `Deleted ${await sync.applyCleanup([id])} backup.`);
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
        const selected = await select(context, "Diagnostics", ["Doctor", "Diff / Check", "Log", "Back"]);
        if (selected === "Doctor") await run("diagnosing", async sync => JSON.stringify(await sync.doctor(), null, 2));
        if (selected === "Diff / Check") await run("checking", async sync => { await sync.check(); return detailLines().join("\n"); });
        if (selected === "Log") await run("reading log", sync => sync.log());
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
      makeService();
    } catch (failure) { error = message(failure); context.ui.notify(`amox-pi-sync config: ${error}`, "error"); }
    // Clear the old upstream widget without creating a replacement widget.
    context.ui.setWidget(STATUS_KEY, undefined);
    publish();
    unregister?.();
    const api = pillAPI();
    unregister = api?.version === 1 ? api.register(STATUS_KEY, ({ ctx: current }) => showStatus(current)) : undefined;
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
    description: "Upload the managed raw data snapshot",
    handler: async () => { await run("uploading", sync => sync.push()); },
  });
  pi.registerCommand("sync-pull", {
    description: "Pull raw data, backing up files before replacement",
    handler: async () => { await run("downloading", sync => sync.pull()); },
  });
  pi.registerCommand("sync-setup", {
    description: "Configure a private SSH repository: /sync-setup <ssh-url> [pull-minutes]",
    handler: async (args, context) => {
      if (busy) { context.ui.notify(`Sync is already ${busy}.`, "warning"); return; }
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
        }
        if (busy) throw new Error(`Sync is already ${busy}; retry setup after it finishes.`);
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
