import { createConnection, isIP } from "node:net";
import { pathToFileURL } from "node:url";

// No HTTP client or external executable: stdin/stdout are the raw SSH transport.
export function connectTunnel(endpoint, host, port, { input = process.stdin, output = process.stdout, diagnostic = message => process.stderr.write(`amox-pi-sync proxy: ${message}\n`), timeoutMs = 10_000, done = code => { process.exitCode = code; } } = {}) {
  if (!endpoint || typeof endpoint.host !== "string" || !/^[a-zA-Z0-9.:-]+$/.test(endpoint.host) || !Number.isInteger(endpoint.port) || endpoint.port < 1 || endpoint.port > 65535 || typeof host !== "string" || !/^[a-zA-Z0-9.:[\]-]+$/.test(host) || !/^\d+$/.test(String(port)) || +port < 1 || +port > 65535) {
    diagnostic("invalid CONNECT arguments"); done(1); return;
  }
  const bareHost = host.replace(/^\[|\]$/g, "");
  const authority = `${isIP(bareHost) === 6 ? `[${bareHost}]` : bareHost}:${+port}`;
  const socket = createConnection({ host: endpoint.host, port: endpoint.port });
  let headers = Buffer.alloc(0);
  let connected = false;
  let finished = false;
  const finish = (message, code = 1) => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    input.unpipe(socket); socket.unpipe(output); input.pause();
    socket.destroy();
    input.off("error", inputError); output.off("error", outputError);
    process.off("SIGTERM", cancel); process.off("SIGINT", cancel);
    if (message) diagnostic(message);
    done(code);
  };
  const cancel = () => finish(undefined, 1);
  const inputError = () => finish("stdin closed unexpectedly");
  const outputError = () => finish("stdout closed unexpectedly");
  const timer = setTimeout(() => finish("CONNECT handshake timed out"), timeoutMs);
  input.on("error", inputError); output.on("error", outputError);
  process.on("SIGTERM", cancel); process.on("SIGINT", cancel);
  socket.on("error", error => finish(`proxy connection failed${error.code ? ` (${error.code})` : ""}`));
  socket.on("close", () => finish(connected ? undefined : "proxy disconnected during CONNECT", connected ? 0 : 1));
  socket.on("connect", () => socket.write(`CONNECT ${authority} HTTP/1.1\r\nHost: ${authority}\r\n\r\n`));
  const handshake = chunk => {
    headers = Buffer.concat([headers, chunk]);
    const end = headers.indexOf("\r\n\r\n");
    if ((end < 0 && headers.length > 16_384) || end + 4 > 16_384) return finish("CONNECT response headers too large");
    if (end < 0) return;
    const status = /^HTTP\/1\.[01] ([0-9]{3})(?: |\r\n)/.exec(headers.subarray(0, end + 2).toString("latin1"));
    if (!status || status[1] !== "200") return finish(status ? `CONNECT rejected (HTTP ${status[1]})` : "invalid CONNECT response");
    connected = true;
    clearTimeout(timer);
    socket.off("data", handshake);
    // Reinsert bytes after the header so pipe handles backpressure and binary data.
    socket.pause();
    const remainder = headers.subarray(end + 4);
    if (remainder.length) socket.unshift(remainder);
    headers = Buffer.alloc(0);
    socket.pipe(output, { end: false });
    input.pipe(socket);
    socket.resume();
  };
  socket.on("data", handshake);
  return socket;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 5) throw new Error();
    const endpoint = JSON.parse(Buffer.from(process.argv[2], "base64").toString("utf8"));
    connectTunnel(endpoint, process.argv[3], process.argv[4]);
  } catch {
    process.stderr.write("amox-pi-sync proxy: invalid CONNECT arguments\n");
    process.exitCode = 1;
  }
}
