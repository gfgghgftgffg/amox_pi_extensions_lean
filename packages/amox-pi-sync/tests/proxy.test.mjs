import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:net";
import { PassThrough } from "node:stream";
import { spawn, spawnSync } from "node:child_process";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import { connectTunnel, sshEnvironment } from "../ssh-proxy.mjs";
const { parseProxy, proxyCommand, quoteSh } = await createJiti(import.meta.url).import("../core.ts");
async function server(t, handler) {
  const sockets = new Set();
  const server = createServer(socket => { sockets.add(socket); socket.on("error", () => {}); socket.on("close", () => sockets.delete(socket)); handler(socket); });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => { for (const socket of sockets) socket.destroy(); await new Promise(resolve => server.close(resolve)); });
  return { host: "127.0.0.1", port: server.address().port };
}
function tunnel(endpoint, options = {}) {
  const input = new PassThrough(); const output = new PassThrough(); const chunks = []; const messages = [];
  output.on("data", chunk => chunks.push(chunk));
  let resolve;
  const done = new Promise(r => { resolve = r; });
  const socket = connectTunnel(endpoint, "example.org", "22", { input, output, timeoutMs: 500, diagnostic: message => messages.push(message), done: code => resolve(code), ...options });
  return { input, output, chunks, messages, done, socket };
}
test("SSH child environment drops only stale Win32 descriptor metadata without mutating its parent", () => {
  const key = "c28fc6f98a2c44abbbd89d6a3037d0d9_POSIX_FD_STATE";
  const env = { [key]: "AAAAAAICAgA=", [key.toUpperCase()]: "stale", PATH: "keep", SSH_AUTH_SOCK: "keep-agent", OTHER_POSIX_FD_STATE: "keep-other" };
  assert.deepEqual(sshEnvironment(env), { PATH: "keep", SSH_AUTH_SOCK: "keep-agent", OTHER_POSIX_FD_STATE: "keep-other" });
  assert.equal(env[key], "AAAAAAICAgA=");
});

test("SSH launcher preserves arguments, stdio and child exit status", { timeout: 5000 }, async () => {
  const helper = fileURLToPath(new URL("../ssh-proxy.mjs", import.meta.url));
  const result = spawnSync(process.execPath, [helper, "--ssh", process.execPath, "-e",
    'process.stdout.write(JSON.stringify({ args: process.argv.slice(1), state: Object.keys(process.env).filter(k => /c28fc6f98a2c44abbbd89d6a3037d0d9_posix_fd_state/i.test(k)) })); process.stderr.write("child stderr"); process.exitCode = 7;', "a b", "100%", "it's"], {
    encoding: "utf8", timeout: 3000,
    env: { ...process.env, c28fc6f98a2c44abbbd89d6a3037d0d9_POSIX_FD_STATE: "AAAAAAICAgA=" },
  });
  assert.equal(result.status, 7, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { args: ["a b", "100%", "it's"], state: [] });
  assert.equal(result.stderr, "child stderr");
});

test("proxy validation is strict and diagnostics do not reflect URLs or credentials", () => {
  assert.deepEqual(parseProxy("http://localhost:7897"), { host: "localhost", port: 7897 });
  assert.deepEqual(parseProxy("http://[::1]:80"), { host: "::1", port: 80 });
  assert.deepEqual(parseProxy("http://127.0.0.1"), { host: "127.0.0.1", port: 80 });
  for (const proxy of [null, 42, "", "https://localhost:80", "socks5://localhost:80", "http://secret:password@localhost:80", "http://localhost/", "http://localhost/a", "http://localhost?secret", "http://localhost#secret", "http://localhost:0", "http://localhost:65536", "http://localhost:-1", "http://localhost:1.5", "http://localhost:", "http://local\nhost:80", "http://localhost:80\x7f", "http://local%68ost:80", "http://[invalid]:80", "http://-bad:80", "http://host..name:80"]) {
    assert.throws(() => parseProxy(proxy), error => error.message.startsWith("Invalid proxy:") && !error.message.includes("secret") && !error.message.includes("password"));
  }
});
test("an unavailable proxy reports the socket error code", { timeout: 5000 }, async () => {
  const listener = createServer();
  await new Promise(resolve => listener.listen(0, "127.0.0.1", resolve));
  const endpoint = { host: "127.0.0.1", port: listener.address().port };
  await new Promise(resolve => listener.close(resolve));
  const client = tunnel(endpoint);
  assert.equal(await client.done, 1);
  assert.match(client.messages.join(" "), /proxy connection failed \(ECONNREFUSED\)/);
});

test("CONNECT preserves same-chunk banner and binary echo; EOF closes cleanly", { timeout: 5000 }, async t => {
  const banner = Buffer.from([83, 83, 72, 45, 0, 255, 128, 13, 10]);
  const bytes = Buffer.from(Array.from({ length: 65536 }, (_, i) => i % 256));
  const endpoint = await server(t, socket => socket.once("data", request => {
    assert.equal(request.toString(), "CONNECT example.org:22 HTTP/1.1\r\nHost: example.org:22\r\n\r\n");
    socket.write(Buffer.concat([Buffer.from("HTTP/1.1 200 Connection established\r\n\r\n"), banner]));
    socket.on("data", data => socket.write(data));
  }));
  const client = tunnel(endpoint);
  client.input.end(bytes);
  assert.equal(await client.done, 0);
  assert.deepEqual(Buffer.concat(client.chunks), Buffer.concat([banner, bytes]));
  assert.deepEqual(client.messages, []);
  assert.ok(client.socket.destroyed);
});
for (const [name, response, message] of [
  ["407", "HTTP/1.1 407 secret credentials\r\n\r\n", /HTTP 407/],
  ["non-200", "HTTP/1.1 201 no\r\n\r\n", /HTTP 201/],
  ["malformed", "secret garbage\r\n\r\n", /invalid CONNECT/],
  ["oversize", "HTTP/1.1 200 OK\r\nX: " + "x".repeat(16384), /too large/],
  ["disconnect", null, /disconnected/],
  ["timeout", "", /timed out/],
]) test(`CONNECT ${name} fails without leaking response details`, { timeout: 5000 }, async t => {
  const endpoint = await server(t, socket => socket.once("data", () => { if (response === null) socket.end(); else if (response) socket.write(response); }));
  const client = tunnel(endpoint, { timeoutMs: 40 });
  assert.equal(await client.done, 1);
  assert.match(client.messages.join(" "), message);
  assert.doesNotMatch(client.messages.join(" "), /secret|credentials/);
  assert.equal(Buffer.concat(client.chunks).length, 0);
  assert.ok(client.socket.destroyed);
});
test("fragmented headers at the size boundary and remote close are accepted; handshake timer clears", { timeout: 5000 }, async t => {
  const head = "HTTP/1.1 200 OK\r\nX: ";
  const header = head + "x".repeat(16384 - head.length - 4) + "\r\n\r\n";
  const endpoint = await server(t, socket => socket.once("data", () => { socket.write(header.slice(0, 20)); setTimeout(() => socket.write(header.slice(20)), 5); setTimeout(() => socket.end(Buffer.from([255])), 80); }));
  const client = tunnel(endpoint, { timeoutMs: 40 });
  assert.equal(await client.done, 0);
  assert.deepEqual(Buffer.concat(client.chunks), Buffer.from([255]));
  assert.deepEqual(client.messages, []);
});
test("Git sh quoting and real ssh -G preserve a spaced ProxyCommand", { skip: process.platform === "win32" }, () => {
  const command = proxyCommand("http://localhost:7897", "/node path/node", "/helper's path/100%/ssh-proxy.mjs");
  const result = spawnSync("sh", ["-c", `ssh -G -F /dev/null -o ${quoteSh("ProxyCommand=" + command)} example.org`], { encoding: "utf8", timeout: 10000 });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes("proxycommand " + command));
  assert.ok(command.includes("100%%"));
  const windows = proxyCommand("http://localhost:7897", "C:\\Program Files\\node.exe", "C:\\helper path\\100%\\ssh-proxy.mjs", "win32");
  assert.ok(windows.startsWith('"C:\\Program Files\\node.exe" "C:\\helper path\\100%%\\ssh-proxy.mjs"'));
});
test("actual ssh executes helper from a spaced, quoted, percent-containing path", { skip: process.platform === "win32", timeout: 15000 }, async t => {
  const root = await fs.mkdtemp(path.join(tmpdir(), "sync helper's 100%-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const helper = path.join(root, "ssh proxy.mjs");
  await fs.copyFile(fileURLToPath(new URL("../ssh-proxy.mjs", import.meta.url)), helper);
  let resolve;
  const request = new Promise(r => { resolve = r; });
  const endpoint = await server(t, socket => socket.once("data", chunk => { resolve(chunk.toString()); socket.end("HTTP/1.1 407 Nope\r\n\r\n"); }));
  const command = proxyCommand(`http://${endpoint.host}:${endpoint.port}`, process.execPath, helper);
  const child = spawn("sh", ["-c", `ssh -F /dev/null -oBatchMode=yes -oConnectTimeout=2 -o ${quoteSh("ProxyCommand=" + command)} example.org`]);
  t.after(() => child.kill());
  let stderr = ""; child.stderr.on("data", chunk => { stderr += chunk; });
  const code = await new Promise(resolve => child.on("close", resolve));
  assert.notEqual(code, 0);
  assert.match(await request, /^CONNECT example.org:22 HTTP\/1.1/);
  assert.match(stderr, /CONNECT rejected \(HTTP 407\)/);
});
test("helper entrypoint executes through a directory alias", { timeout: 15000 }, async t => {
  const root = await fs.mkdtemp(path.join(tmpdir(), "sync-proxy-alias-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const real = path.join(root, "real"), alias = path.join(root, "alias");
  await fs.mkdir(real);
  await fs.copyFile(fileURLToPath(new URL("../ssh-proxy.mjs", import.meta.url)), path.join(real, "proxy.mjs"));
  await fs.symlink(real, alias, process.platform === "win32" ? "junction" : "dir");
  let request;
  const endpoint = await server(t, socket => socket.once("data", chunk => {
    request = chunk.toString(); socket.end("HTTP/1.1 407 Nope\r\n\r\n");
  }));
  const child = spawn(process.execPath, [path.join(alias, "proxy.mjs"), Buffer.from(JSON.stringify(endpoint)).toString("base64"), "example.org", "22"]);
  t.after(() => child.kill());
  let stderr = ""; child.stderr.on("data", chunk => { stderr += chunk; });
  const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("close", resolve); });
  assert.equal(code, 1);
  assert.match(request ?? "", /^CONNECT example.org:22 HTTP\/1.1/);
  assert.match(stderr, /CONNECT rejected \(HTTP 407\)/);
});

test("native Windows OpenSSH executes the packaged helper despite stale inherited descriptor state", { skip: process.platform !== "win32", timeout: 20000 }, async t => {
  const root = await fs.mkdtemp(path.join(tmpdir(), "sync proxy's 100%-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const helper = path.join(root, "ssh proxy.mjs"), sshConfig = path.join(root, "empty config");
  await fs.copyFile(fileURLToPath(new URL("../ssh-proxy.mjs", import.meta.url)), helper);
  await fs.writeFile(sshConfig, "");
  let request;
  const endpoint = await server(t, socket => socket.once("data", chunk => {
    request = chunk.toString();
    socket.end("HTTP/1.1 407 Nope\r\n\r\n");
  }));
  const command = proxyCommand(`http://${endpoint.host}:${endpoint.port}`, process.execPath, helper);
  const ssh = path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "OpenSSH", "ssh.exe");
  const child = spawn(process.execPath, [helper, "--ssh", ssh, "-F", sshConfig, "-oBatchMode=yes", "-oConnectTimeout=5", "-o", "ProxyCommand=" + command, "example.org"], {
    env: { ...process.env, c28fc6f98a2c44abbbd89d6a3037d0d9_POSIX_FD_STATE: "AAAAAAICAgA=" },
  });
  const exited = new Promise((resolve, reject) => { child.once("error", reject); child.once("close", resolve); });
  let stderr = ""; child.stderr.on("data", chunk => { stderr += chunk; });
  const timeout = setTimeout(() => child.kill(), 15000);
  try {
    assert.notEqual(await exited, 0);
    assert.match(request ?? "", /^CONNECT example.org:22 HTTP\/1.1/);
    assert.match(stderr, /CONNECT rejected \(HTTP 407\)/);
  } finally { clearTimeout(timeout); }
});

test("helper cancellation releases the socket and exits", { skip: process.platform === "win32", timeout: 15000 }, async t => {
  let ready;
  const connected = new Promise(r => { ready = r; });
  let closed;
  const disconnected = new Promise(r => { closed = r; });
  const endpoint = await server(t, socket => { socket.on("close", closed); socket.once("data", ready); });
  const child = spawn(process.execPath, [fileURLToPath(new URL("../ssh-proxy.mjs", import.meta.url)), Buffer.from(JSON.stringify(endpoint)).toString("base64"), "example.org", "22"], { stdio: ["pipe", "pipe", "pipe"] });
  t.after(() => child.kill());
  await connected;
  const exited = new Promise(resolve => child.on("close", resolve));
  child.kill("SIGTERM");
  assert.equal(await exited, 1);
  await disconnected;
});

for (const host of ["example.org", "github.com"]) test(`CONNECT 200 followed by an empty tunnel is a failure (${host})`, { timeout: 5000 }, async t => {
  const endpoint = await server(t, socket => socket.once("data", request => {
    assert.match(request.toString(), new RegExp(`^CONNECT ${host.replaceAll(".", "\\.")}:22 HTTP/1.1`));
    socket.end("HTTP/1.1 200 Connection established\r\n\r\n");
  }));
  const messages = [];
  const output = new PassThrough();
  const chunks = [];
  output.on("data", chunk => chunks.push(chunk));
  const code = await new Promise(resolve => connectTunnel(endpoint, host, "22", {
    input: new PassThrough(), output, diagnostic: message => messages.push(message), done: resolve,
  }));
  assert.equal(code, 1);
  assert.match(messages.join(" "), /proxy tunnel closed before receiving SSH data/);
  assert.ok(messages[0].includes(`${host}:22`));
  assert.equal(messages[0].includes("ssh://git@ssh.github.com:443/OWNER/REPO.git"), host === "github.com");
  assert.equal(messages[0].includes("update the existing snapshot origin to match"), host === "github.com");
  assert.equal(Buffer.concat(chunks).length, 0);
});

test("CLI reports a proxy closing after CONNECT 200 as a nonzero failure", { timeout: 15000 }, async t => {
  const endpoint = await server(t, socket => socket.once("data", () => socket.end("HTTP/1.1 200 OK\r\n\r\n")));
  const child = spawn(process.execPath, [fileURLToPath(new URL("../ssh-proxy.mjs", import.meta.url)), Buffer.from(JSON.stringify(endpoint)).toString("base64"), "github.com", "22"]);
  t.after(() => child.kill());
  let stderr = "";
  child.stderr.on("data", chunk => { stderr += chunk; });
  const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("close", resolve); });
  assert.equal(code, 1);
  assert.match(stderr, /amox-pi-sync proxy: proxy tunnel closed before receiving SSH data from github\.com:22/);
  assert.match(stderr, /ssh:\/\/git@ssh\.github\.com:443\/OWNER\/REPO\.git/);
});
