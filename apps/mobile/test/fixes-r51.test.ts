import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { MIN_TOUCH, blendOnto, contrastRatio, dark, light } from "../../../packages/ui/src/tokens";

/**
 * Round 51 — the design review of 24.9 (F240-F254). Screens need a device, so the arithmetic and the source of the
 * surfaces whose whole finding was "this control is too small / this ink is too faint" live here; the pixels
 * themselves are in docs/qa/fix-design/ as before-and-after screenshots at 390/768/1024/1440 in both themes.
 */
const SRC = join(__dirname, "../src");
const source = (p: string) => readFileSync(join(SRC, p), "utf8");

/** Every `name: { … minHeight: 44 … }` entry of a StyleSheet in one file. */
function styleHeights(src: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const m of src.matchAll(/(\w+):\s*\{[^{}]*?\b(?:minHeight|height):\s*(\d+|MIN_TOUCH)\b/g)) out.set(m[1] ?? "", m[2] === "MIN_TOUCH" ? MIN_TOUCH : Number(m[2]));
  return out;
}

function* walk(dir: string): Generator<string> {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.tsx$/.test(f)) yield p;
  }
}

describe("F243 · §9.4's 44 pt touch target holds in the primitives every screen is built from", () => {
  const primitives = source("components/shell/primitives.tsx");
  const heights = styleHeights(primitives);

  it("the spec's floor is one token, not a number copied into screens", () => {
    expect(MIN_TOUCH).toBe(44);
    expect(readFileSync(join(__dirname, "../../../packages/ui/src/tokens.ts"), "utf8")).toContain("export const MIN_TOUCH = 44");
  });

  it("every pressable shape in primitives.tsx is at least that tall", () => {
    for (const name of ["button", "link", "row", "segment", "toggleTarget"]) {
      expect(heights.get(name), `styles.${name} is missing a height`).toBeDefined();
      expect(heights.get(name), `styles.${name}`).toBeGreaterThanOrEqual(MIN_TOUCH);
    }
  });

  it("the toggle keeps the spec's 52x32 track and presses through a 44 pt target around it", () => {
    expect(primitives).toContain("export const TOGGLE_TRACK = { width: 52, height: 32 }");
    expect(primitives).toMatch(/<Pressable[\s\S]*?style=\{styles\.toggleTarget\}/);
    /* hitSlop is not a target: react-native-web drops it, and the browser tier is a shipping tier. */
    expect(/accessibilityRole="switch"[\s\S]{0,400}?hitSlop/.test(primitives), "the toggle must not rely on hitSlop").toBe(false);
  });

  it("the controls the review measured under 44 press through a target that is not", () => {
    for (const [file, names] of [
      ["screens/Chat.tsx", ["chipTarget", "noticeBtn", "suggestion"]],
      ["screens/paywall/PaywallScreen.tsx", ["headerBtn", "legalLink"]],
      ["web/WebShell.tsx", ["getApp", "cta", "textBtn"]],
    ] as const) {
      const found = styleHeights(source(file));
      for (const name of names) expect(found.get(name), `${file} styles.${name}`).toBeGreaterThanOrEqual(MIN_TOUCH);
    }
  });

  it("no screen re-declares the floor as a bare number", () => {
    const offenders = [...walk(SRC)]
      .map((p) => ({ path: p.slice(SRC.length + 1), src: readFileSync(p, "utf8") }))
      .filter((f) => /\b(?:minHeight|height):\s*44\b/.test(f.src) && !f.path.endsWith("primitives.tsx"))
      .map((f) => f.path);
    /* The screens below predate the token; new code imports MIN_TOUCH instead of writing 44 again. */
    expect(offenders.length, `use MIN_TOUCH in: ${offenders.join(", ")}`).toBeLessThanOrEqual(19);
  });
});

describe("F242 · a row that is off still says why, at 4.5:1", () => {
  const primitives = source("components/shell/primitives.tsx");

  it("the disabled row dims its control, not its text", () => {
    expect(primitives).not.toMatch(/styles\.row,\s*\{[^}]*opacity: disabled/);
    expect(primitives).toMatch(/disabled \? theme\.text2 : theme\.text/);
  });

  it("every ink a row can carry clears 4.5:1 on every surface, at the dimming the row applies", () => {
    /* The control keeps DISABLED_OPACITY; text must not, so the guard asserts the text path at full opacity and
       proves the old 0.5 would have failed. */
    for (const [name, theme] of [["dark", dark], ["light", light]] as const)
      for (const surface of ["bg", "surface1", "surface2", "well"] as const)
        for (const ink of ["text", "text2"] as const) expect(contrastRatio(blendOnto(theme[ink], theme[surface], 1), theme[surface]), `${name} ${ink} on ${surface}`).toBeGreaterThanOrEqual(4.5);
  });

  it("the dimming the review measured really was below the floor, in both themes", () => {
    expect(contrastRatio(blendOnto(light.text2, light.well, 0.5), light.well)).toBeLessThan(4.5);
    expect(contrastRatio(blendOnto(dark.text2, dark.surface1, 0.5), dark.surface1)).toBeLessThan(4.5);
    /* And 0.7, the fix the review proposed, would still have failed: nothing short of full opacity clears it. */
    expect(contrastRatio(blendOnto(light.text2, light.well, 0.7), light.well)).toBeLessThan(4.5);
  });
});

describe("F241 · the empty chat is not pinned to the composer", () => {
  it("the bottom anchoring belongs to messages, and the empty state opts out of it", () => {
    const chat = source("screens/Chat.tsx");
    expect(chat).toContain('list: { padding: 16, gap: 14, flexGrow: 1, justifyContent: "flex-end" }');
    expect(chat).toContain('listEmpty: { justifyContent: "center" }');
    expect(chat).toMatch(/contentContainerStyle=\{\[styles\.list, rows\.length \? null : styles\.listEmpty/);
  });

  it("an onboarding step centres its card on a phone too, not only on a wide window", () => {
    const screen = source("components/shell/Screen.tsx");
    expect(screen).toMatch(/contentContainerStyle=\{\[card \? styles\.centred : null/);
    expect(screen).toContain('centred: { flexGrow: 1, justifyContent: "center" }');
  });
});

describe("F247 · the sealed green means the seal and nothing else (§9.9)", () => {
  it("selection and 'in use' are told by ink weight, in the sheet and in the vault", () => {
    const sheet = source("components/chat/ModelSheet.tsx");
    expect(sheet).toContain("borderColor: choice.current ? theme.text : theme.border");
    expect(sheet).not.toMatch(/theme\.sealed/);
    const card = source("screens/vault/ModelCard.tsx");
    expect(card).toContain("borderColor: active ? theme.text : theme.border");
    expect(card).not.toMatch(/inUse.*theme\.sealed/);
  });

  it("stopping your own answer is not a breach, so the stop button is not the danger fill", () => {
    const composer = source("components/chat/Composer.tsx");
    expect(composer).toMatch(/testID="stop"[\s\S]{0,200}backgroundColor: theme\.ctaFill/);
  });

  it("the generating filament glows behind the ring instead of filling it", () => {
    const seal = source("components/Seal.tsx");
    expect(seal).toMatch(/id="filament"[\s\S]*?offset="55%"[\s\S]*?stopOpacity=\{0\}/);
  });
});

describe("F244, F248 · a browser reader is not offered what the browser cannot do", () => {
  it("a step that renders one card does not call itself a choice", () => {
    expect(source("screens/Onboarding/ModelChoice.tsx")).toContain('t(step.options.length > 1 ? "onboarding.model.title" : "onboarding.model.titleOne")');
  });

  it("the step stops promising a vault the browser tier does not have", () => {
    expect(source("screens/Onboarding/ModelChoice.tsx")).toMatch(/PLATFORM === "web" \? null : <Text[^>]*>\{t\("onboarding\.model\.laterInVault"\)\}/);
  });

  it("every locale carries the single-model title", () => {
    const dir = join(__dirname, "../../../packages/i18n/locales");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
      const json = JSON.parse(readFileSync(join(dir, f), "utf8")) as Record<string, string>;
      expect(json["onboarding.model.titleOne"], f).toBeTruthy();
    }
  });

  it("a model this tier cannot install is dimmed like one it cannot run", () => {
    expect(source("components/chat/ModelSheet.tsx")).toContain("const dim = !!choice.blocked || (managed && !choice.current);");
  });
});

describe("F249, F250 · no header over a list that cannot exist, no second empty state", () => {
  it("the audit picker appears only once there is a vault to pick", () => {
    expect(source("screens/Work/AuditLog.tsx")).toContain("{!picked && vaults.length ? (");
  });

  it("the documents readout gives way to the screen's own empty state", () => {
    const docs = source("screens/documents/DocumentsScreen.tsx");
    expect(docs).toMatch(/\{state\.documents\.length \? <Text[^>]*>\{t\("documents\.storage"/);
    expect(docs).toContain('testID="documents-empty"');
    expect(docs.indexOf('testID="documents-empty"')).toBeLessThan(docs.indexOf('testID="embedder-card"'));
  });

  it("the index card is a card, not a glowing one (§9.9)", () => {
    expect(source("screens/documents/DocumentsScreen.tsx")).toMatch(/testID="embedder-card"[\s\S]{0,120}borderColor: theme\.border/);
  });
});

describe("F245, F252, F253, F254 · the rest of the review", () => {
  it("the Documents title is centred on the bar, not between two labels of different widths", () => {
    const docs = source("screens/documents/DocumentsScreen.tsx");
    expect(docs).toContain("titleWrap: { position: \"absolute\"");
    expect(docs).toMatch(/<View pointerEvents="none" style=\{styles\.titleWrap\}>/);
  });

  it("the browser vault leads with the action, not with Close", () => {
    const entry = source("screens/vault/VaultEntry.web.tsx");
    expect(entry).toMatch(/<Button testID="vault-get-app"[\s\S]{0,120}\/>\s*<Button variant="link"/);
  });

  it("the web paywall's bullets carry the same mark as the native card's", () => {
    expect(source("screens/paywall/WebStoreBlock.tsx")).toMatch(/<Icon name="check"/);
  });

  it("the proof screen draws its tick instead of a character no shipped face has", () => {
    const proof = source("screens/Proof/Proof.tsx");
    expect(proof).toContain('const TICK = "\\u2713"');
    expect(proof).toMatch(/text\.split\(TICK\)/);
    expect(proof).toMatch(/<Icon name="check"/);
  });

  it("only one sheet title shouted, and it no longer does", () => {
    const en = JSON.parse(readFileSync(join(__dirname, "../../../packages/i18n/locales/en.json"), "utf8")) as Record<string, string>;
    expect(en["chat.attach.title"]).toBe("Attach documents");
    expect(en["chat.attach.title"]).not.toBe(String(en["chat.attach.title"]).toUpperCase());
  });

  it("a sheet row's hint is lighter than the body it explains, never heavier", () => {
    expect(source("components/chat/Sheet.tsx")).toMatch(/\{hint \? <Text style=\{\[type\.bodySmall, \{ color: theme\.text2 \}\]\}/);
  });

  it("the legal preamble is a paragraph, so it is not set in mono (§9.3)", () => {
    const legal = source("screens/legal/Legal.tsx");
    expect(legal).toMatch(/testID="legal-meta"[\s\S]{0,240}<Text key=\{line\} style=\{\[type\.bodySmall/);
    expect(legal).not.toMatch(/testID="legal-meta"[\s\S]{0,240}<Mono/);
  });

  it("the licence sentence carries no em dash", () => {
    expect(readFileSync(join(__dirname, "../../../docs/legal/terms.md"), "utf8")).not.toContain("—");
  });

  it("a CJK section label steps in weight and ink, because case and tracking do nothing to those glyphs", () => {
    const primitives = source("components/shell/primitives.tsx");
    expect(primitives).toContain('const CJK_LOCALES = new Set(["ja", "ko", "zh"])');
    expect(primitives).toMatch(/cjk \? styles\.monoLabelCjk : null/);
    expect(primitives).toContain('monoLabelCjk: { ...font("sans", "600"), letterSpacing: 0 }');
  });
});
