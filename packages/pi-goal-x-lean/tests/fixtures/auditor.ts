import goal from "pi-goal-x/extensions/goal.ts";
import { createGoalFacade } from "../../index.ts";

// Injection uses the upstream public dependency seam, loaded by Pi's own loader.
// No provider, model registry, environment mutation or network is involved.
let attempts = 0;
export default createGoalFacade(pi => goal(pi, {
  async runCompletionAuditor(input) {
    if (!input.goal.objective.includes("Auditor seam fixture") || input.signal.aborted) {
      throw new Error("Unexpected auditor input");
    }
    attempts += 1;
    if (attempts === 1) return { approved: false, disapproved: true, output: "Fixture rejection: verification is missing." };
    if (attempts !== 2 || !input.warmContext?.includes("Fixture rejection: verification is missing.")) {
      throw new Error("The retry did not preserve prior independent audit feedback");
    }
    return { approved: true, disapproved: false, output: "Fixture approval: verification inspected." };
  },
}));
