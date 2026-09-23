import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (rel: string) => readFileSync(join(__dirname, "../src", rel), "utf8");

/**
 * Round 50 answers the MosheAI review of 24.9.2026. Each finding here is a shape a screen had, so each guard reads the
 * screen's source: reverting the fix puts the old shape back and fails the guard.
 */
describe("item 5 · the comparison table keeps its column headers", () => {
  const src = read("screens/paywall/CompareTable.tsx");
  it("the header row is sticky where the platform has sticky, and carries its own background so rows do not show through", () => {
    expect(src).toContain('Platform.OS === "web"');
    expect(src).toContain('position: "sticky"');
    expect(src).toContain('testID="compare-head"');
    expect(src).toMatch(/testID="compare-head"[^>]*STICKY_HEAD[^>]*backgroundColor: theme\.surface1/);
  });
});

describe("item 12 · the table does not tick OCR where the build has none", () => {
  const src = read("screens/paywall/CompareTable.tsx");
  it("marks the app-only rows and prints the footnote, from the core list rather than a literal", () => {
    expect(src).toContain("COMPARE_APP_ONLY");
    expect(src).toContain('testID="compare-app-only"');
    expect(src).toContain('t("paywall.compare.appOnly")');
  });
});

describe("item 6 · one line before the first word, not five", () => {
  const src = read("web/WebShell.tsx");
  const detail = src.slice(src.indexOf('{open ? ('), src.indexOf('testID="get-app"'));
  it("only the notice and the disclosure are open by default", () => {
    expect(src).toContain('testID="web-strip-details"');
    expect(src).toContain('t("web.details")');
    expect(src).toContain("const [open, setOpen] = useState(false);");
  });
  it("the offline line, the storage notice and the engine switch live behind the disclosure", () => {
    for (const inside of ['testID="web-offline-state"', 'testID="web-storage-notice"', 't("webStorageNotice")', 'testID="engine-switch"', 't("web.unknownMemory")']) expect(detail, inside).toContain(inside);
  });
  /* §9.2/§9.3 (fix-design): mono and the sealed green are for the state word, not for a sentence about storage. */
  it("sets the storage caveat as body text, and keeps mono and sealed for the state word alone", () => {
    const offline = detail.slice(detail.indexOf('testID="web-offline-state"'), detail.indexOf('testID="web-storage-notice"'));
    expect(offline).toContain("styles.mono");
    expect(offline).toContain("theme.sealed");
    expect(offline).not.toContain("webStorageNotice");
    const caveat = detail.slice(detail.indexOf('testID="web-storage-notice"'), detail.indexOf('chromePromptApi'));
    expect(caveat).toContain("styles.caption");
    expect(caveat).toContain("theme.text2");
    expect(caveat).not.toContain("styles.mono");
    expect(caveat).not.toContain("theme.sealed");
  });
  /* A phone reader must not have to open a disclosure to learn the browser runs Instant only. */
  it("keeps the phone door out in the open", () => {
    expect(detail).not.toContain('testID="phone-door"');
    expect(src).toContain('testID="phone-door"');
  });
});

describe("item 7 · the weak-language verdict is said once, not shouted on every turn", () => {
  const src = read("screens/Chat.tsx");
  it("goes through the same once-per-chat memory and snooze as the §7.8 advice card", () => {
    expect(src).toContain("adviceToShow(adviceChat, shortfallKey, shownShortfall.current, adviceSnoozed)");
    expect(src).toContain("const snoozeShortfall = (key: string) => {");
    expect(src).toContain("snoozeAdvice(key);");
  });
  it("is dismissible and no longer a mono all-caps banner", () => {
    const block = src.slice(src.indexOf('{noBetterHere && status.kind === "ready" ?'), src.indexOf('testID="persona-line"'));
    expect(block).toContain('testID="model-none-dismiss"');
    expect(block).toContain('t("safety.dismiss")');
    expect(block).toContain("type.caption");
    expect(block).not.toContain("toUpperCase()");
    expect(block).not.toContain("type.monoLabel");
  });
});

describe("item 16 · a Hebrew answer mirrors its labels with its text", () => {
  it("the assistant row derives one direction flag and hands it to the ledger", () => {
    const src = read("components/chat/AssistantMessage.tsx");
    expect(src).toContain('const rtl = dir === "rtl";');
    expect(src).toContain("rtl ? styles.end : null");
    expect(src).toContain("<Ledger message={row} nCtx={nCtx} quant={quant} onUnlock={onUnlock} rtl={rtl} />");
  });
  it("the ledger disclosure and its rows mirror too", () => {
    const src = read("components/chat/Ledger.tsx");
    expect(src).toContain("rtl ? styles.toggleRtl : null");
    expect(src).toContain("rtl ? styles.rowRtl : null");
    expect(src).toContain('toggleRtl: { flexDirection: "row-reverse", alignSelf: "flex-end" }');
  });
});

describe("item 17 · desktop height is not phone rhythm on the low-traffic screens", () => {
  it("an empty chat centres instead of hugging the bottom the conversation would have filled", () => {
    const src = read("screens/Chat.tsx");
    expect(src).toContain("rows.length ? null : styles.listEmpty");
    expect(src).toContain('listEmpty: { justifyContent: "center" }');
  });
  it("the audit log uses the centred card while it is only a chooser, and shows no chooser with nothing to choose", () => {
    const src = read("screens/Work/AuditLog.tsx");
    expect(src).toContain("card={!picked}");
    expect(src).toContain("vaults.length ? (");
    expect(src).not.toContain("{!picked ? (\n        <Section");
  });
});
