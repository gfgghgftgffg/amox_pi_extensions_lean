import assert from "node:assert/strict";
import test from "node:test";
import { auditDependencies, auditSummary, parseAuditArguments } from "../scripts/audit-dependencies.mjs";
import { LOCAL_CHECKS } from "../scripts/lib/local-checks.mjs";

const report = (high = 0, critical = 0) => ({
  auditReportVersion: 2,
  vulnerabilities: high || critical ? { upstream: { severity: critical ? "critical" : "high", via: ["upstream advisory"] } } : {},
  metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high, critical, total: high + critical } },
});
const execute = (value, status = 0) => () => ({ status, stdout: JSON.stringify(value), stderr: "" });

test("complete audit reports retain high/critical findings as visible warnings, not failures", () => {
  for (const [high, critical] of [[0, 0], [1, 0], [0, 1]]) {
    const original = report(high, critical);
    const result = auditDependencies({ execute: execute(original, high + critical ? 1 : 0) });
    assert.equal(result.findings, high + critical > 0);
    assert.deepEqual(result.report, original);
    assert.equal(result.counts.high, high); assert.equal(result.counts.critical, critical);
    assert.match(auditSummary(result), /warnings, not release blockers/);
  }
});

test("audit command still runs both scopes with bounded network waits and no fixes", () => {
  for (const production of [false, true]) {
    let calls = 0;
    const result = auditDependencies({ production, execute: (command, args, options) => {
      calls++; assert.equal(command, "npm"); assert.ok(args.includes("--json"));
      assert.ok(args.includes("--fetch-retries=0")); assert.ok(args.includes("--fetch-timeout=60000"));
      assert.equal(args.includes("--omit=dev"), production);
      assert.ok(!args.includes("fix") && !args.includes("--force")); assert.equal(options.timeout, 180000);
      return { status: 0, stdout: JSON.stringify(report()) };
    } });
    assert.equal(calls, 1); assert.equal(result.scope, production ? "production" : "all");
  }
  assert.deepEqual(LOCAL_CHECKS.slice(-2), [
    ["node", ["scripts/audit-dependencies.mjs"]],
    ["node", ["scripts/audit-dependencies.mjs", "--omit=dev"]],
  ]);
});

test("service errors, broken commands and incomplete reports are not misreported as successful audits", () => {
  for (const result of [
    { status: 1, stdout: JSON.stringify({ error: { code: "E503" } }) },
    { status: 1, stdout: "not-json" },
    { status: 2, stdout: JSON.stringify(report(1)) },
    { status: 1, stdout: JSON.stringify(report()) },
    { status: 0, signal: "SIGTERM", stdout: JSON.stringify(report()) },
    { status: null, error: new Error("private diagnostic") },
    { status: 0, stdout: JSON.stringify({ vulnerabilities: {}, metadata: { vulnerabilities: { total: 0 } } }) },
    { status: 0, stdout: JSON.stringify({ ...report(), error: { code: "E503" } }) },
    { status: 0, stdout: JSON.stringify({ ...report(), metadata: { vulnerabilities: { ...report().metadata.vulnerabilities, total: 4 } } }) },
  ]) assert.throws(() => auditDependencies({ execute: () => result }), /audit/i);
});

test("CLI preserves production mode with or without JSON diagnostics", () => {
  assert.deepEqual(parseAuditArguments([]), { production: false, output: undefined });
  assert.deepEqual(parseAuditArguments(["--omit=dev"]), { production: true, output: undefined });
  assert.deepEqual(parseAuditArguments(["--omit=dev", "--output", "diagnostics/production.json"]), { production: true, output: "diagnostics/production.json" });
  assert.deepEqual(parseAuditArguments(["--output", "diagnostics/all.json"]), { production: false, output: "diagnostics/all.json" });
  for (const args of [["--output"], ["--output", "--omit=dev"], ["--force"], ["--ignore-audit"]]) assert.throws(() => parseAuditArguments(args));
});
