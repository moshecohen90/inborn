#!/usr/bin/env node
// `node with-variant.mjs <variant> <command…>`: runs the command with APP_VARIANT set, since cmd.exe has no `VAR=x cmd`.
import { spawnSync } from "node:child_process";

const [variant, ...command] = process.argv.slice(2);
if (!variant || command.length === 0) {
  console.error("usage: with-variant.mjs <variant> <command…>");
  process.exit(2);
}
// A shell only on Windows: npx and expo are .cmd shims there, which spawn cannot start without one.
const [file, ...args] = command;
const result = spawnSync(file, args, { stdio: "inherit", shell: process.platform === "win32", env: { ...process.env, APP_VARIANT: variant } });
process.exit(result.status ?? 1);
