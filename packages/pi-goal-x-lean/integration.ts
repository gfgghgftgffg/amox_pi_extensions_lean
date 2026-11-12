const SUBAGENT_CONTEXT = Symbol.for("@gfgghgftgffg/pi-subagents-lean.context.v1");
const SUBAGENT_MANAGER = Symbol.for("pi-subagents:manager");

type SubagentContext = {
  readonly version: 1;
  readonly isChildSession: () => boolean;
};

// Optional, read-only bridge: no dependency on the subagent package or its paths.
export function isSubagentChild(): boolean {
  const services = globalThis as unknown as Record<symbol, unknown>;
  const candidate = services[SUBAGENT_CONTEXT];
  const service = candidate && typeof candidate === "object"
    ? candidate as Partial<SubagentContext> : undefined;
  if (service?.version === 1 && typeof service.isChildSession === "function") {
    return service.isChildSession() === true;
  }
  if (services[SUBAGENT_MANAGER] !== undefined) {
    throw new Error("pi-goal-x-lean: pi-subagents manager is loaded without a compatible child-context v1 service; upgrade @gfgghgftgffg/pi-subagents-lean to >=0.1.19 when using both extensions.");
  }
  return false;
}
