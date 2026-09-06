import { defineConfig } from "vitest/config";

/* Pure web modules only (device gate, worker hashing, IndexedDB repository); screens need a device. */
export default defineConfig({ test: { include: ["src/**/*.test.ts", "test/**/*.test.ts"], environment: "node" } });
