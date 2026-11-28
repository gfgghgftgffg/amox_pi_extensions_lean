import assert from "node:assert/strict";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const serviceKey = Symbol.for("@gfgghgftgffg/pi-subagents-lean.context.v1");
const serviceBefore = Object.getOwnPropertyDescriptor(globalThis, serviceKey);
if (process.argv[2] === "SERVICE") {
  assert.equal(process.env.PI_SUBAGENT_CHILD, undefined);
  assert.equal(process.env.PI_SUBAGENT_DEPTH, undefined);
  Object.defineProperty(globalThis, serviceKey, {
    configurable: true, value: Object.freeze({ version: 1, isChildSession: () => true }),
  });
}
const root = resolve(process.env.PI_GOAL_ROOT);
const io = [];
const originals = [];
function watched(arg) {
  if (arg instanceof URL) arg = fileURLToPath(arg);
  if (Buffer.isBuffer(arg)) arg = arg.toString();
  if (typeof arg !== "string") return false;
  const path = resolve(arg);
  return path === root || path.startsWith(root + sep);
}
// Observe real filesystem APIs; do not replace any host/goal runtime behavior.
for (const object of [fs, fs.promises]) {
  for (const key of Object.keys(object)) {
    if (!/^(?:access|appendFile|chmod|copyFile|cp|createReadStream|createWriteStream|exists|lstat|link|mkdir|mkdtemp|open|opendir|readFile|readdir|readlink|realpath|rename|rm|rmdir|stat|symlink|truncate|unlink|utimes|watch|watchFile|writeFile)(?:Sync)?$/.test(key)
      || typeof object[key] !== "function") continue;
    const original = object[key];
    originals.push([object, key, original]);
    object[key] = function (...args) {
      if (args.some(watched)) io.push([key, ...args.filter(watched).map(String)]);
      return Reflect.apply(original, this, args);
    };
  }
}
syncBuiltinESMExports();
try {
  const { openHost, facadePath } = await import("./host-session.mjs");
  const host = await openHost([facadePath]);
  try {
    const extension = host.extensions[0];
    assert.equal(extension.tools.size, 0);
    assert.equal(extension.commands.size, 0);
    assert.equal(extension.shortcuts.size, 0);
    assert.equal(extension.messageRenderers.size, 0);
    assert.deepEqual([...extension.handlers.keys()], ["context_with_system"], "worker installs only the context filter");
    const system = { role: "system", content: "Preserve host system" };
    const user = { role: "user", content: "Worker task" };
    const assistant = { role: "assistant", content: [{ type: "toolCall", id: "call", name: "read", arguments: {} }] };
    const result = { role: "toolResult", toolCallId: "call", toolName: "read", content: [{ type: "text", text: "ok" }] };
    const audit = { role: "custom", customType: "pi-goal-audit-event", content: "Parent audit" };
    const checkpoint = { role: "custom", customType: "pi-goal-event", details: { goalId: "parent" }, content: "Parent continuation" };
    const unrelated = { role: "custom", customType: "unrelated", content: "Keep" };
    assert.deepEqual(await host.runner.emitContext([system, user, assistant, audit, checkpoint, result, unrelated]),
      [system, user, assistant, result, unrelated], "parent goal/audit messages removed without splitting tool pairs");
    assert.deepEqual(await host.runner.emitContext([system, user, assistant, result]), [system, user, assistant, result]);
  } finally { await host.close(); }
  assert.deepEqual(io, [], "worker neither reads nor writes the goal pool (including snapshots/ledger)");
} finally {
  for (const [object, key, original] of originals) object[key] = original;
  syncBuiltinESMExports();
  if (serviceBefore) Object.defineProperty(globalThis, serviceKey, serviceBefore);
  else delete globalThis[serviceKey];
}
console.log("goal worker isolation passed");
