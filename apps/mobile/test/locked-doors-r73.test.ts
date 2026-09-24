import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "../src");
function* walk(dir: string): Generator<string> {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.tsx$/.test(f) && !/\.test\./.test(f)) yield p;
  }
}
const sources = [...walk(root)].map((p) => ({ path: p.slice(root.length + 1), src: readFileSync(p, "utf8") }));
const read = (rel: string) => sources.find((s) => s.path === rel)!.src;

/** F339. A paid lock never greys a control out: the locked tap is the value moment (§12.3), so it has to reach S60 with its reason. */
describe("F339 · no locked door is dead or reasonless", () => {
  it("no control is disabled by a paywall lock", () => {
    const dead = sources.flatMap((s) => [...s.src.matchAll(/disabled=\{([^}]*)\}/g)].filter((m) => /(?<![\w!.])locked\b|\w+Locked\b/.test(m[1]!)).map((m) => `${s.path}: ${m[0]}`));
    expect(dead).toEqual([]);
  });
  it("no WORK or PRO chip is left without a handler or a reason", () => {
    const bare = sources.filter((s) => /<(WorkTag|ProTag)\s*\/>/.test(s.src)).map((s) => s.path);
    expect(bare).toEqual([]);
  });
  it("a locked vault in the audit log opens the paywall saying why", () => {
    const audit = read("screens/Work/AuditLog.tsx");
    expect(audit).toContain('onPress={() => (locked ? openPaywall("auditLog") : setPicked(v.id))}');
    expect(audit).toContain('<WorkTag reason="auditLog" />');
  });
  it("the architecture statement banner names its reason", () => {
    expect(read("screens/Work/Statement.tsx")).toContain('<WorkTag reason="architectureStatement" />');
  });
});
