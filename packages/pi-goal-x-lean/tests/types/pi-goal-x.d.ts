declare module "pi-goal-x/extensions/goal.ts" {
  import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
  const goal: (pi: ExtensionAPI) => void;
  export default goal;
}

declare module "pi-goal-x/extensions/goal-context.ts" {
  import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
  export function registerGoalContext(pi: ExtensionAPI, filter: (messages: any[]) => any[] | null): void;
}

declare module "pi-goal-x/extensions/goal-session-safety.ts" {
  export function isDelegatedGoalSession(): boolean;
  export function filterGoalSessionContext<T>(messages: readonly T[], child?: boolean): T[] | null;
}
