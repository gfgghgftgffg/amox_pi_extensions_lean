import assert from "node:assert/strict";
import test from "node:test";
import { canonicalIntegrity, resolvePublicRegistryMetadata, satisfiesStableRange } from "../scripts/lib/lock-validation.mjs";
import { isExactStableVersion } from "../scripts/lib/semver.mjs";

test("canonical SemVer and canonical integrity reject ambiguous forms and unsafe integers", () => {
  for (const version of ["01.2.3", "1.02.3", "1.2.03", "9007199254740992.0.0", "1.2.3\n", "v1.2.3", "1.2.3-rc.1", "1.2.3+build"]) assert.equal(isExactStableVersion(version), false, version);
  assert.equal(isExactStableVersion("9007199254740991.0.0"), true);
  const integrity = `sha512-${Buffer.alloc(64, 1).toString("base64")}`;
  assert.equal(canonicalIntegrity(integrity), true);
  for (const hash of ["sha512-NOT_BASE64", integrity.replace(/=+$/, ""), integrity + "\n", integrity + " ", `sha512-${Buffer.alloc(63).toString("base64")}`, "sha512-" + "B".repeat(86) + "=="]) assert.equal(canonicalIntegrity(hash), false, hash);
});

test("bounded stable range checks validate real closure ranges and fail closed for unknown sources", async () => {
  for (const range of ["*", "1.x", "1.2.*", "^1", "^1.2.0", "~1.2", ">=1.0.0 <2.0.0", "1.0.0 - 1.3.0", "^0.1.0 || ^1.2.0"]) assert.equal(satisfiesStableRange("1.2.3", range), true, range);
  for (const range of ["^1.3.0", "~1.1.0", "^0.2.0", ">2.0.0", "1.2.2"]) assert.equal(satisfiesStableRange("1.2.3", range), false, range);
  assert.equal(satisfiesStableRange("0.2.5", "^0.2.0"), true);
  assert.equal(satisfiesStableRange("0.3.0", "^0.2.0"), false);
  assert.equal(satisfiesStableRange("0.0.2", "^0.0.1"), false);
  for (const range of ["npm:other@1.2.3", "file:../x", "git+https://example.invalid", "latest", "^01.2.3", "1.2.3-rc.1", "1.2.3 || file:evil"]) assert.throws(() => satisfiesStableRange("1.2.3", range), /不支持|exact stable/);
  await assert.rejects(resolvePublicRegistryMetadata("evil\n", "1.2.3"), /非法 registry identity/);
});
