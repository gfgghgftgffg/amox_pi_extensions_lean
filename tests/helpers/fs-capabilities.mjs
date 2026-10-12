import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Capability check, not an OS-wide skip: Windows with Developer Mode/admin
// still runs the security tests. GitHub's Ubuntu runners run every case.
function probeFileSymlinks() {
  const dir = mkdtempSync(join(tmpdir(), "amox-symlink-capability-"));
  try {
    const target = join(dir, "target");
    writeFileSync(target, "probe");
    symlinkSync(target, join(dir, "alias"), "file");
    return true;
  } catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP", "ENOSYS"].includes(error.code)) return false;
    throw error;
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
export const fileSymlinksAvailable = probeFileSymlinks();
export const symlinkSkip = fileSymlinksAvailable ? false : "File symlinks unavailable (Windows requires Developer Mode/admin)";
