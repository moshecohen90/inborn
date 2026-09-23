import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { contrastRatio, dark, light } from "../../../packages/ui/src/tokens";

/**
 * Round 34 — the four bugs Moshe hit in the browser build (F100-F103). Screens need a device, so what can be asserted
 * without one lives here: the colour arithmetic behind the toggle, and the source of the surfaces whose whole finding
 * was "this line of UI is wrong", the way `fixes-r25.test.ts` does. The behaviour itself is proven in a real browser
 * over apps/web/dist; the evidence is in docs/qa/web-bugs/.
 */
const SHEET_HANDOVER_MS = 320;
const SRC = join(__dirname, "../src");
const source = (p: string) => readFileSync(join(SRC, p), "utf8");

function* walk(dir: string): Generator<string> {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.tsx?$/.test(f)) yield p;
  }
}
const sources = [...walk(SRC)].map((p) => ({ path: p.slice(SRC.length + 1), src: readFileSync(p, "utf8") })).filter((s) => !/\.test\.tsx?$/.test(s.path));

describe("F100 · the attach sheet's Add a file opens a chooser in the browser", () => {
  it("the browser has a picker of its own, because expo-file-system's web build only warns", () => {
    const web = source("documents/importPicker.web.ts");
    expect(web).toContain('input.type = "file"');
    expect(web, "expo-file-system's web build resolves to nothing").not.toMatch(/from "expo-file-system"/);
  });

  it("the click is inside the gesture: nothing is awaited above it", () => {
    const body = /function chooseFile\(\)[\s\S]*?\n}/.exec(source("documents/importPicker.web.ts"))?.[0] ?? "";
    expect(body, "chooseFile must exist").toContain("input.click()");
    expect(body.slice(0, body.indexOf("input.click()")), "an await above the click loses the activation").not.toContain("await ");
  });

  it("the web door asks the same gate as the phone's, so a browser cannot walk past the Free cap", () => {
    for (const door of ["documents/importPicker.ts", "documents/importPicker.web.ts"]) {
      expect(source(door), door).toContain("fileIntake");
      expect(source(door), door).toContain("paywallFor");
    }
  });
});

describe("F101 · every sheet hands its action over the same way", () => {
  it("the hand-over lives in one module and knows the platform", () => {
    const h = source("lib/sheetHandover.ts");
    expect(h).toContain('Platform.OS === "web"');
    expect(h).toContain("setTimeout(fn, SHEET_HANDOVER_MS)");
  });

  /* A private copy of the timer is a second place to get the platform rule wrong, and it never gets the web branch. */
  it("no screen re-implements the hand-over with a bare timer", () => {
    const offenders = sources.filter((s) => new RegExp(`setTimeout\\([\\s\\S]{0,200}?,\\s*${SHEET_HANDOVER_MS}\\s*\\)`).test(s.src)).map((s) => s.path);
    expect(offenders, "these defer a sheet action by hand instead of calling afterSheetClose").toEqual([]);
  });

  it("the shared sheet paints the backdrop under the panel, so an item tap is never the backdrop's", () => {
    for (const sheet of ["components/chat/Sheet.tsx", "components/shell/Sheet.tsx"]) {
      const src = source(sheet);
      const backdrop = src.indexOf('onPress={onClose}');
      const panel = src.indexOf("testID={testID}");
      expect(backdrop, sheet).toBeGreaterThan(-1);
      expect(panel, `${sheet}: the panel must be rendered after the backdrop`).toBeGreaterThan(backdrop);
    }
  });
});

describe("F102 · the toggle says which side is on, on every platform", () => {
  const OLD = { onTrack: "text2", offTrack: "border", knob: "surface1" } as const;
  const MIN = 3; /* WCAG 2.2 1.4.11: a control's own shape needs 3:1 against what it sits on. */

  it("the shape the platform Switch drew was invisible: that is the bug", () => {
    for (const [name, t] of [["dark", dark], ["light", light]] as const) {
      expect(contrastRatio(t[OLD.offTrack], t.bg), `${name}: the old OFF track against the screen`).toBeLessThan(MIN);
      expect(contrastRatio(t[OLD.knob], t[OLD.offTrack]), `${name}: the old OFF knob against its own track`).toBeLessThan(MIN);
    }
  });

  it("both states now clear 3:1, so on and off are told apart by fill alone", () => {
    for (const [name, t] of [["dark", dark], ["light", light]] as const) {
      expect(contrastRatio(t.ctaFill, t.bg), `${name}: ON track`).toBeGreaterThanOrEqual(MIN);
      expect(contrastRatio(t.ctaText, t.ctaFill), `${name}: ON knob on its track`).toBeGreaterThanOrEqual(MIN);
      expect(contrastRatio(t.text3, t.bg), `${name}: OFF outline`).toBeGreaterThanOrEqual(MIN);
      expect(contrastRatio(t.text3, t.well), `${name}: OFF knob on its track`).toBeGreaterThanOrEqual(MIN);
    }
  });

  /* The arithmetic above is only worth anything if these are the colours the control actually paints. */
  it("the control paints the tokens the arithmetic checked", () => {
    const p = source("components/shell/primitives.tsx");
    expect(p).toContain("backgroundColor: value ? theme.ctaFill : theme.well");
    expect(p).toContain("borderColor: value ? theme.ctaFill : theme.text3");
    expect(p).toContain("backgroundColor: value ? theme.ctaText : theme.text3");
  });

  it("the knob also changes side and gains a tick, so colour is never the only signal", () => {
    const p = source("components/shell/primitives.tsx");
    expect(p).toContain("styles.knobOn");
    expect(p).toContain("styles.knobOff");
    expect(p).toContain('<Icon name="check"');
    expect(p).toContain('accessibilityRole="switch"');
    expect(p).toContain("accessibilityState={{ checked: value");
  });

  it("no screen draws a switch of its own any more", () => {
    const offenders = sources.filter((s) => /<Switch\b/.test(s.src)).map((s) => s.path);
    expect(offenders, "every on/off control goes through Toggle").toEqual([]);
  });
});

describe("F103 · the chats actions never wrap a button label onto two lines", () => {
  const chats = source("screens/Chats.tsx");

  it("the row wraps instead of squeezing, because the sidebar is far narrower than a phone", () => {
    const style = / {2}actions: \{[^}]*\}/.exec(chats)?.[0] ?? "";
    expect(style).toContain('flexWrap: "wrap"');
    expect(/ {2}action: \{[^}]*\}/.exec(chats)?.[0] ?? "").toContain("flexBasis:");
  });

  it("both labels are single-line, so no locale can two-line a button", () => {
    for (const key of ["chats.new", "chats.incognito"]) {
      const line = chats.split("\n").find((l) => l.includes(`t("${key}")`) && l.includes("<Text"));
      expect(line, key).toBeDefined();
      expect(line, `${key} must be numberOfLines={1}`).toContain("numberOfLines={1}");
    }
  });
});
