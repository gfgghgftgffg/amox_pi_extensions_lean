#!/usr/bin/env node
import { existsSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { githubClient, loadPublishToken } from "./lib/github-maintenance.mjs";
import { validServerFailure } from "./lib/remote-errors.mjs";
import { MAX_SERVER_RETRIES, RETRY_DELAY_MS } from "./lib/maintenance-retries.mjs";

const repo = "gfgghgftgffg/amox_pi_extensions_lean";
const safeLink = value => typeof value === "string" && new RegExp(`^https://github\\.com/${repo}/(?:pull/\\d+|actions/runs/\\d+)$`).test(value) ? value : undefined;
function privateText(path) {
  if (!statSync(path).isFile() || (statSync(path).mode & 0o077)) throw new Error("Notification files must be private (600)");
  return readFileSync(path, "utf8");
}
export function loadConfig(path) {
  const config = JSON.parse(privateText(path)), url = new URL(config.server);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash
    || !/^[-_A-Za-z0-9]{1,64}$/.test(config.topic) || !isAbsolute(config.tokenFile)) throw new Error("Invalid notification configuration");
  return { ...config, server: url.href.replace(/\/?$/, "/") };
}
export async function completion(state, serviceResult, { api, now = Date.now, wait = delay, timeoutMs = 90 * 60000 } = {}) {
  const retry = state.retry;
  const knownServerFailure = state.status === "failed" && validServerFailure(state.failure);
  if (knownServerFailure && state.publicationStarted === false && state.repairPending === false && !state.pr && !state.mergeSha
    && ["success", "exit-code"].includes(serviceResult) && retry?.status === "scheduled"
    && Number.isInteger(retry.count) && retry.count >= 0 && retry.count < MAX_SERVER_RETRIES
    && retry.limit === MAX_SERVER_RETRIES && Number.isFinite(Date.parse(retry.dueAt))) {
    const due = new Date(retry.dueAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
    return { title: "等待重试", pending: true, reason: `HTTP ${state.failure.httpStatus}；等待 ${RETRY_DELAY_MS / 3600000} 小时，计划于北京时间 ${due} 执行第 ${retry.count + 1}/${MAX_SERVER_RETRIES} 次重试` };
  }
  if (knownServerFailure && retry?.status === "exhausted" && retry.count === MAX_SERVER_RETRIES && retry.limit === MAX_SERVER_RETRIES) {
    return { title: "重试耗尽", reason: `HTTP ${state.failure.httpStatus}；已用完 ${MAX_SERVER_RETRIES} 次自动重试，请人工检查`, failed: true };
  }
  if (knownServerFailure && state.publicationStarted === true) return { title: "需人工核对", reason: "已进入推送或发布阶段；为避免重复写入，未自动重跑", failed: true };
  if (knownServerFailure && state.repairPending === true) return { title: "需人工修复", reason: "当前候选仍有未通过的验收，未另起候选自动重跑", failed: true };
  if (serviceResult !== "success" || state.status === "failed") {
    const reason = serviceResult === "timeout" ? "维护进程超时" : /No unchanged|checks|Protected/i.test(state.message || "") ? "本地验收未完成" : "维护任务失败，请查看服务日志";
    return { title: "失败", reason, failed: true };
  }
  if (state.status === "no-update") return { title: "无更新", reason: "未发现上游更新，未调用模型" };
  if (state.status === "pending-maintenance-pr") return { title: "跳过", reason: "已有待处理维护 PR，本次未调用模型" };
  if (state.status !== "merged-after-ci" || !/^[a-f0-9]{40}$/.test(state.mergeSha || "") || !/^\d+\.\d+\.\d+$/.test(state.version || "")) return { title: "未发布", reason: "未确认发布完成", failed: true };
  const deadline = now() + timeoutMs;
  while (now() < deadline) {
    try {
      const { workflow_runs } = await api.request(`/actions/workflows/release.yml/runs?head_sha=${state.mergeSha}&per_page=10`);
      const run = workflow_runs.find(r => r.head_sha === state.mergeSha && r.event === "push" && r.head_branch === "main");
      if (run?.status === "completed") {
        const link = safeLink(run.html_url);
        if (run.conclusion !== "success") return { title: "发布失败", reason: "维护 PR 已合并，但 Release 未成功", failed: true, link };
        const { jobs } = await api.request(`/actions/runs/${run.id}/jobs?per_page=100`);
        const published = jobs.some(j => j.name === "Publish verified archives to npm (OIDC, no package hooks)" && j.conclusion === "success");
        return published ? { title: "发布成功", reason: "Release 和 npm 发布 job 已成功（包含归档及 registry 验证）", link: `https://github.com/${repo}/releases/tag/v${state.version}` }
          : { title: "未发布", reason: "Release 未完成 npm 发布", failed: true, link };
      }
    } catch { /* Retry only read-only status checks; never rerun maintenance or publication. */ }
    await wait(Math.min(30000, Math.max(0, deadline - now())));
  }
  return { title: "发布等待超时", reason: "PR 已合并，但未能在期限内确认发布结果", failed: true };
}
export async function send(config, state, result, fetchImpl = fetch) {
  const text = privateText(config.tokenFile).trim();
  const tokens = [...new Set(text.match(/\btk_[A-Za-z0-9]+\b/g) || [])];
  const token = tokens.length === 1 ? tokens[0] : text;
  if (!token || /\s/.test(token) || tokens.length > 1) throw new Error("Invalid ntfy credential");
  const packages = (Array.isArray(state.packages) ? state.packages : []).filter(item =>
    /^@gfgghgftgffg\/(?:pi-web-access-lean|rpiv-todo-lean|pi-subagents-lean)$/.test(item?.name ?? "")
    && /^\d+\.\d+\.\d+$/.test(item?.version ?? "")).slice(0, 3).map(item => `${item.name}@${item.version}`);
  const message = [result.reason, /^\d+\.\d+\.\d+$/.test(state.version || "") ? `发布批次：${state.version}` : undefined, ...packages, safeLink(state.pr), safeLink(state.ci), result.link].filter(Boolean).join("\n");
  const response = await fetchImpl(config.server, { method: "POST", redirect: "manual", signal: AbortSignal.timeout(15000),
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ topic: config.topic, title: `Pi 每日维护：${result.title}`, message, priority: result.failed ? 4 : 3, tags: [result.failed ? "warning" : result.pending ? "hourglass_flowing_sand" : "white_check_mark"], ...(result.link ? { click: result.link } : {}) }) });
  if (!response.ok) throw new Error("ntfy did not accept the notification");
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2), configPath = process.env.AMOX_NOTIFY_CONFIG || join(homedir(), ".config/amox-pi-notify.json");
    if (args.some(a => a !== "--test")) throw new Error("Only --test is supported");
    if (existsSync(configPath)) {
      const config = loadConfig(configPath), root = process.env.AMOX_MAINTENANCE_STATE || join(homedir(), ".local/state/amox-pi-maintenance");
      let state = {}, result;
      if (args.includes("--test")) result = { title: "测试", reason: "测试通知：每日任务结束通知已接入。此消息不表示执行了维护或发布。" };
      else {
        if (!process.env.SERVICE_RESULT) throw new Error("Run through the service, or use --test");
        try { state = JSON.parse(readFileSync(join(root, "last-run.json"), "utf8")); } catch { /* A failed process may leave no state. */ }
        if (/^[a-f0-9]{32}$/.test(process.env.INVOCATION_ID ?? "") && state.serviceInvocation !== process.env.INVOCATION_ID) {
          // Polls that are not due and lock losers did not run maintenance.
          // Never notify from another service invocation's stale last-run file.
          if (["success", "exec-condition"].includes(process.env.SERVICE_RESULT)) process.exit(0);
          state = {};
        }
        let api;
        try { if (state.status === "merged-after-ci" && process.env.SERVICE_RESULT === "success") api = githubClient(repo, loadPublishToken(process.env.AMOX_PUBLISH_ENV || join(homedir(), ".config/amox-pi-actions.env"))); }
        catch { result = { title: "状态查询失败", reason: "无法读取 GitHub 发布核验凭据", failed: true }; }
        result ||= await completion(state, process.env.SERVICE_RESULT, { api });
      }
      await send(config, state, result); console.log("Maintenance notification accepted by ntfy.");
    } else console.log("Maintenance notifications are not configured; skipped.");
  } catch { console.error("Maintenance notification failed; inspect private configuration and service logs. No automatic duplicate POST."); process.exitCode = 1; }
}
