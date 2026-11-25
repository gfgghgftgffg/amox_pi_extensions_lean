import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
await jiti.import("./wiring.test.ts");
