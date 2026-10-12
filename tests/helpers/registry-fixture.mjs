/** Offline public-registry test boundary: derived from TRUSTED baseline only,
 * never candidate data. A new version has its own coherent tarball/integrity.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
const lock = JSON.parse(readFileSync(new URL("../../package-lock.json", import.meta.url), "utf8"));
export function fixtureDist(name, version) {
  const digest = createHash("sha512").update(`${name}@${version}`).digest("base64");
  return { resolved: `https://registry.npmjs.org/${name}/-/${name.split("/").at(-1)}-${version}.tgz`, integrity: `sha512-${digest}` };
}
export async function fixtureRegistryMetadata(name, version) {
  const before = lock.packages[`node_modules/${name}`];
  if (!before) throw new Error(`unknown offline fixture: ${name}@${version}`);
  const { resolved, integrity } = fixtureDist(name, version);
  const metadata = { name, version, gitHead: "b".repeat(40), dist: { tarball: resolved, integrity } };
  for (const key of ["license", "bin", "engines", "dependencies", "optionalDependencies", "peerDependencies", "peerDependenciesMeta", "os", "cpu", "funding", "deprecated"]) {
    if (before[key] !== undefined) metadata[key] = structuredClone(before[key]);
  }
  if (before.hasInstallScript) metadata.scripts = { install: "fixture (never executed)" };
  return metadata;
}
