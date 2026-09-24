import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const src = readFileSync(join(__dirname, "Composer.tsx"), "utf8");
/* Read, not imported: importing @inborn/ui pulls react-native into this environment. One number, one source. */
const tokens = readFileSync(join(__dirname, "../../../../../packages/ui/src/tokens.ts"), "utf8");
const MIN_TOUCH = Number(/export const MIN_TOUCH = (\d+)/.exec(tokens)?.[1]);

/** `name: { … width: 36, height: 36 … }` inside the file's single `StyleSheet.create` block. */
function declaredSizes(source: string): Map<string, { width?: number; height?: number }> {
  const block = /StyleSheet\.create\(\{([\s\S]*)\}\);/.exec(source);
  if (!block) throw new Error("Composer.tsx has no StyleSheet.create block");
  const out = new Map<string, { width?: number; height?: number }>();
  for (const m of (block[1] ?? "").matchAll(/^\s{2}(\w+):\s*\{([^}]*)\},?\s*$/gm)) {
    const name = m[1] ?? "";
    const body = m[2] ?? "";
    const num = (key: string) => {
      const hit = new RegExp(`\\b${key}:\\s*(\\d+)`).exec(body);
      return hit?.[1] === undefined ? undefined : Number(hit[1]);
    };
    out.set(name, { width: num("width"), height: num("height") });
  }
  return out;
}

/** Every `styles.X` named in a `<Pressable … style={…}>` — the box the finger actually lands on. */
function pressableStyles(source: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const m of source.matchAll(/<Pressable\b([\s\S]*?)>/g)) {
    const tag = m[1] ?? "";
    const id = /testID="([^"]+)"/.exec(tag)?.[1] ?? /testID=\{[^}]*\?\s*"([^"]+)"/.exec(tag)?.[1];
    const style = /\bstyle=\{([\s\S]*?)\}\s*$/.exec(tag.trimEnd())?.[1] ?? tag;
    const names = [...style.matchAll(/styles\.(\w+)/g)].flatMap((s) => (s[1] ? [s[1]] : []));
    if (id && names.length) out.set(id, names);
  }
  return out;
}

describe("F322 · every composer control is a fingertip wide", () => {
  const sizes = declaredSizes(src);
  const pressables = pressableStyles(src);

  it("finds the composer's pressables", () => {
    expect([...pressables.keys()]).toEqual(expect.arrayContaining(["attach", "mic", "send", "stop"]));
  });

  it.each([...pressables.keys()])("%s is at least MIN_TOUCH in both directions", (id) => {
    const names = pressables.get(id) ?? [];
    /* A style that declares no size is laid out by its content, which the browser sweep in web-smoke measures instead. */
    const sized = names.map((n) => sizes.get(n)).filter((s) => s && (s.width !== undefined || s.height !== undefined));
    for (const s of sized) {
      if (s?.width !== undefined) expect(s.width, `${id} width`).toBeGreaterThanOrEqual(MIN_TOUCH);
      if (s?.height !== undefined) expect(s.height, `${id} height`).toBeGreaterThanOrEqual(MIN_TOUCH);
    }
  });

  it("the 36 px send circle is drawn inside the target, never used as the target", () => {
    expect(sizes.get("sendDot")).toEqual({ width: 36, height: 36 });
    for (const names of pressableStyles(src).values()) expect(names).not.toContain("sendDot");
  });
});
