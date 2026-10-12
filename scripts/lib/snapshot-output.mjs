/** Snapshot --output must never follow an alias into the accepted baseline. */
import { existsSync, mkdirSync, mkdtempSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

export function checkedSnapshotOutput(outputPath, baselinePath) {
  const output = resolve(outputPath);
  const baseline = resolve(baselinePath);
  mkdirSync(dirname(output), { recursive: true });
  const canonicalOutput = join(realpathSync(dirname(output)), basename(output));
  const canonicalBaseline = existsSync(baseline) ? realpathSync(baseline) : join(realpathSync(dirname(baseline)), basename(baseline));
  let alias = canonicalOutput === canonicalBaseline;
  if (existsSync(output) && existsSync(baseline)) {
    const a = statSync(output);
    const b = statSync(baseline);
    alias ||= a.dev === b.dev && a.ino === b.ino;
  }
  if (alias) throw new Error("已接受快照/文件别名不允许通过 --output 改写；请显式使用 --write");
  return canonicalOutput;
}

export function writeSnapshotCopy({ outputPath, baselinePath, content }) {
  const output = checkedSnapshotOutput(outputPath, baselinePath);
  const temp = mkdtempSync(join(dirname(output), ".amox-snapshot-"));
  try {
    const file = join(temp, "snapshot.json");
    writeFileSync(file, content, { encoding: "utf8", flag: "wx", mode: 0o600 });
    // Recheck identity, then replace the directory entry, never its symlink or
    // hardlink referent. Use the canonical parent even if an alias is moved.
    checkedSnapshotOutput(output, baselinePath);
    renameSync(file, output);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}
