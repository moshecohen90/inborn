// Bundles lib.ts (the app's prompt code and the round-130 page decision) into lib.mjs; Node 20 cannot run the TypeScript sources.
// Usage: node bundle.mjs <path to rolldown package>
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const { build } = await import(join(process.argv[2], "dist/index.mjs"));
await build({
  input: join(here, "lib.ts"),
  external: [/^@noble\//, "fflate"],
  output: { file: join(here, "lib.mjs"), format: "esm" },
});
console.log("bundled", join(here, "lib.mjs"));
