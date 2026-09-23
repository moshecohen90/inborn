import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/* The widths themselves are proven in layout.test.ts; this file proves every surface is actually wired to them,
   which is the half a pure unit test cannot see and the half that regressed (F110-F112). */
const src = join(__dirname, "..");
const read = (file: string) => readFileSync(join(src, file), "utf8");

/** The bare JSX flag, so `shellStyles.card` or a `-card` testID inside the same element cannot satisfy it. */
const hasCardProp = (source: string) => /(?:^|\s)card(?=\s|$)/m.test(source.slice(source.indexOf("<Screen"), source.indexOf("<Screen") + 700));

describe("responsive surfaces", () => {
  it("gives every onboarding step the centred card (F110)", () => {
    const dir = join(src, "screens/Onboarding");
    const steps = readdirSync(dir).filter((f) => f.endsWith(".tsx"));
    expect(steps.sort()).toEqual(["LockOffer.tsx", "ModelChoice.tsx", "Sealed.tsx", "Welcome.tsx"]);
    for (const step of steps) expect(hasCardProp(readFileSync(join(dir, step), "utf8")), step).toBe(true);
  });

  it("fails the same check on a step that lost the prop", () => {
    expect(hasCardProp('<Screen header={null} mesh testID="onboarding-welcome" footer={<Footer />}>')).toBe(false);
    expect(hasCardProp('<Screen testID="x"><View style={[shellStyles.card, {}]} testID="model-ready-card" /></Screen>')).toBe(false);
  });

  it("caps column, actions and card in the one shell every stack screen goes through", () => {
    const shell = read("components/shell/Screen.tsx");
    for (const hook of ["useContentMaxWidth", "useActionMaxWidth", "useCardMaxWidth"]) expect(shell).toContain(hook);
  });

  it("caps the two screens that build their own root instead of using Screen", () => {
    for (const file of ["screens/documents/DocumentsScreen.tsx", "screens/vault/VaultScreen.tsx"]) {
      expect(read(file), file).toContain("useContentMaxWidth");
      expect(read(file), file).toContain("maxWidth: contentMax");
    }
  });

  it("keeps the composer field one row tall, and grows it on the web where nothing else does (F111)", () => {
    /* react-native-web renders `multiline` as a plain <textarea>: born two rows tall and never growing with its
       content. Both halves of the fix are web-only; on Android `numberOfLines` would clamp the field instead.
       Matched on intent, not on formatting: a prettier pass must not be able to fail this. */
    const composer = read("components/chat/Composer.tsx").replace(/\s+/g, " ");
    expect(composer, "the one-row prop must be web-only").toMatch(/webField\s*=\s*web\s*\?\s*\{\s*numberOfLines:\s*1\s*\}\s*:\s*\{\s*\}/);
    expect(composer, "and it must reach the field").toMatch(/multiline \{\.\.\.webField\}/);
    expect(composer, "the height must be re-measured from scratch, not from the last value").toMatch(/node\.style\.height\s*=\s*"auto"/);
    expect(composer, "and clamped between one row and the cap").toMatch(/Math\.min\(\s*Math\.max\(\s*node\.scrollHeight,\s*MIN_FIELD\s*\),\s*maxHeight\s*\)/);
    /* The complement: neither half may reach a native build, and the measurement may not skip the `auto` reset. */
    expect(composer).not.toMatch(/numberOfLines=\{\s*1\s*\}/);
    expect(composer).toMatch(/if \(\s*!web \|\| !node\s*\) return;/);
  });

  it("routes stacked page actions through the one wrapper that caps them (F110)", () => {
    expect(read("components/shell/primitives.tsx")).toContain("useActionMaxWidth");
    for (const file of ["screens/Proof/Proof.tsx", "screens/Work/AuditLog.tsx", "screens/Work/Statement.tsx", "screens/Work/VerifyRecord.tsx", "screens/vault/VaultEntry.web.tsx", "screens/documents/DocumentsScreen.tsx"]) {
      expect(read(file), file).toContain("<Actions");
    }
  });
});
