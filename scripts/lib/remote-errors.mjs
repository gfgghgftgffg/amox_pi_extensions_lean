// Only explicit HTTP statuses from trusted request boundaries are eligible.
// Assertion text, provider bodies and ambiguous write outcomes are not parsed.
const STATUSES = new Set([500, 502, 503, 504]);
const PHASES = new Set(["model", "upstream-read", "github-read", "install"]);
export const isTransientServerStatus = (status) => Number.isInteger(status) && STATUSES.has(status);

// Recognize SDK status envelopes only at the start, not status-like body text.
export function sdkHttpStatus(message, provider) {
  if (typeof message !== "string") return undefined;
  const prefix = `${provider === "openai" ? "OpenAI" : provider} API error`;
  const prefixed = message.startsWith(prefix) ? message.slice(prefix.length).match(/^ \(([45]\d\d)\):/) : null;
  const direct = message.match(/^HTTP\s+([45]\d\d)(?:\b|:)/i) ?? message.match(/^([45]\d\d)(?::|\s|$)/);
  const code = prefixed?.[1] ?? direct?.[1];
  return code === undefined ? undefined : Number(code);
}

export class RemoteHttpError extends Error {
  constructor(message, { httpStatus, phase }) {
    super(message);
    this.name = "RemoteHttpError";
    this.httpStatus = httpStatus;
    this.phase = phase;
  }
}
export function gitReadHttpError(output) {
  const text = String(output ?? "").replace(/^git failed: /, "");
  const match = text.match(/^fatal: unable to access 'https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/?': The requested URL returned error: (500|502|503|504)\s*$/m);
  return match ? new RemoteHttpError(`Git read failed with HTTP ${match[1]}; no remote body published`, { httpStatus: Number(match[1]), phase: "upstream-read" }) : undefined;
}

export function serverFailure(error) {
  if (!(error instanceof RemoteHttpError) || !isTransientServerStatus(error.httpStatus) || !PHASES.has(error.phase)) return undefined;
  return { kind: "transient-server", httpStatus: error.httpStatus, phase: error.phase };
}
export function validServerFailure(failure) {
  return failure?.kind === "transient-server" && isTransientServerStatus(failure.httpStatus) && PHASES.has(failure.phase);
}
