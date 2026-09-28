import { defineConfig } from "vitest/config";
import buildInfo from "./scripts/build-info.cjs";

/* Modules that print the build import the generated file; a fresh checkout has none until something writes it. */
buildInfo.writeBuildInfo();

/* Pure web modules only (device gate, worker hashing, IndexedDB repository); screens need a device. */
export default defineConfig({ test: { include: ["src/**/*.test.ts", "test/**/*.test.ts"], environment: "node" } });
