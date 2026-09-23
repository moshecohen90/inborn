/**
 * The bridge's whole transport: files in the app's own Documents container, which `devicectl device copy to/from`
 * reaches with no prompt, no developer mode dialog and no XCUITest runner. Everything the bridge writes or reads
 * lives under `Documents/qa/`, so a cleanup can drop the namespace without touching a chat, a document or a vault.
 */
import { Directory, File, Paths } from "expo-file-system";
import type { RunResult, Step } from "./steps";

export const QA_ROOT = "qa";

export interface Script {
  runId: string;
  steps: Step[];
}

const dir = (...parts: string[]): Directory => {
  const d = new Directory(Paths.document, QA_ROOT, ...parts);
  if (!d.exists) d.create({ intermediates: true, idempotent: true });
  return d;
};

export const inboxDir = (): Directory => dir("in");
export const ackDir = (runId: string): Directory => dir("ack", runId);
export const outDir = (runId: string): Directory => dir("out", runId);

/** Created at boot so the driver can push a script into a container it has never run a script in. */
export function ensureDirs(): void {
  dir("in");
  dir("out");
  dir("ack");
}

/**
 * The oldest unread script, or null. The file is consumed (deleted) so a relaunch never replays a finished run.
 * It reads the inbox without creating it: after a sweep the namespace has to stay gone, and a poll that recreated
 * `Documents/qa/in` every second would put it straight back.
 */
export function takeScript(): Script | null {
  const box = new Directory(Paths.document, QA_ROOT, "in");
  if (!box.exists) return null;
  for (const entry of box.list()) {
    if (!(entry instanceof File) || !entry.name.endsWith(".json")) continue;
    let raw: string;
    try {
      raw = entry.textSync();
    } catch {
      continue;
    }
    const runId = entry.name.replace(/\.json$/, "");
    entry.delete();
    const parsed: unknown = JSON.parse(raw);
    const steps = (Array.isArray(parsed) ? parsed : (parsed as { steps?: Step[] }).steps) ?? [];
    const declared = Array.isArray(parsed) ? undefined : (parsed as { runId?: string }).runId;
    return { runId: declared ?? runId, steps: steps as Step[] };
  }
  return null;
}

/** `Documents/qa/boot.json`: what the driver reads to know the bridge is alive before it pushes anything. */
export function writeBoot(boot: Record<string, unknown>): void {
  new File(dir(), "boot.json").write(JSON.stringify({ ...boot, at: new Date().toISOString() }));
}

export function writeProgress(runId: string, progress: Record<string, unknown>): void {
  new File(outDir(runId), "progress.json").write(JSON.stringify({ ...progress, at: new Date().toISOString() }));
}

export function writeResult(runId: string, result: RunResult): void {
  new File(outDir(runId), "result.json").write(JSON.stringify(result, replacer, 2));
}

/** Handlers and fibers can end up in a value the driver reads; only data crosses the wire. */
function replacer(_key: string, value: unknown): unknown {
  return typeof value === "function" ? "[function]" : value;
}

/**
 * The line file `screens/Chat.tsx` polls when a build carries EXPO_PUBLIC_AUTOPROMPT=file: `image: <name>`,
 * `attach: <name>`, `strict: on|off` or a prompt. It is the only door to the photo composer, because the iOS photo
 * picker is a system sheet no in-process bridge can reach.
 */
export function writeDevPrompt(lines: string[]): void {
  new File(Paths.document, "dev-prompt.txt").write(lines.join("\n"));
}

export const ackExists = (runId: string, name: string): boolean => new File(ackDir(runId), `${name}.ok`).exists;

/** Drops everything the bridge itself ever wrote: `Documents/qa/` and any `qa-*` file the driver left at the root. */
export function cleanup(): void {
  const root = new Directory(Paths.document, QA_ROOT);
  if (root.exists) root.delete();
  for (const entry of new Directory(Paths.document).list()) {
    if (entry instanceof File && /^qa-/.test(entry.name)) entry.delete();
  }
}
