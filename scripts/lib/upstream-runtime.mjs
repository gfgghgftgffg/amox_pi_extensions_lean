import { statSync } from "node:fs";
import { join } from "node:path";
import { assertSafeRelativePath } from "./files.mjs";

// Explicit distribution entries are mandatory, never hints that may fall back
// to package discovery or TypeScript source when an upstream release is broken.
export function resolveUpstreamRuntimeEntry(packageDir, runtimeEntry) {
  assertSafeRelativePath(runtimeEntry);
  const entryPath = join(packageDir, runtimeEntry);
  try {
    if (statSync(entryPath).isFile()) return entryPath;
  } catch (error) {
    if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error;
  }
  throw new Error(`Required upstream runtime entry is missing or not a file: ${entryPath}`);
}
