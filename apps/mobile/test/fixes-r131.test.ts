import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { DocumentRecord } from "@inborn/core";
import { coversAttachments, type PagePlan } from "../src/documents/pagePhoto";
import { planIndexHold } from "../src/lib/docsGate";

const read = (rel: string) => readFileSync(join(__dirname, rel), "utf8");
const chat = read("../src/screens/Chat.tsx");

const doc = (over: Partial<DocumentRecord>): DocumentRecord => ({ id: "d", name: "d.pdf", kind: "pdf", bytes: 1, pages: 1, addedAt: 0, status: "indexed", indexedPages: 1, chunkCount: 1, flaggedLines: 0, ocrPages: 0, uri: "documents/d/d.pdf", ...over });
/* visual-page.pdf (132 characters, ink 0.597) and turbine-report-3pages.pdf, as round 130 measured them. */
const visual = doc({ id: "visual", name: "visual-page.pdf" });
const turbine = doc({ id: "turbine", name: "turbine-report-3pages.pdf", pages: 3, indexedPages: 3, chunkCount: 9 });
const plan = (over: Partial<PagePlan> = {}): PagePlan => ({ doc: visual, page: 1, chars: 132, visual: true, picture: true, ...over });

describe("round 131 · a turn that carries its file whole needs no index model", () => {
  it("a one-page file sent as its picture, or as all of its text on the thin route, is covered", () => {
    expect(coversAttachments(plan(), [visual])).toBe(true);
    expect(coversAttachments(plan({ picture: false, visual: null }), [visual])).toBe(true);
  });

  it("a longer file, a second attachment, a text-only page or no page plan keeps the hold", () => {
    expect(coversAttachments(plan({ doc: turbine }), [turbine])).toBe(false);
    expect(coversAttachments(plan(), [visual, turbine])).toBe(false);
    expect(coversAttachments(plan({ picture: false, visual: false }), [visual])).toBe(false);
    expect(coversAttachments(null, [visual])).toBe(false);
    expect(coversAttachments(null, [turbine])).toBe(false);
  });

  it("with no index model, a covered turn goes out; an uncovered one waits for the model as before", () => {
    expect(planIndexHold({ attached: 1, embedder: "missing", wordsAccepted: false, coveredWhole: true })).toBe("send");
    expect(planIndexHold({ attached: 1, embedder: "missing", wordsAccepted: false, coveredWhole: false })).toBe("hold");
    expect(planIndexHold({ attached: 1, embedder: "failed", wordsAccepted: false })).toBe("hold");
  });

  it("Send plans the page before it decides the hold, so the hold knows what the turn carries", () => {
    const submit = chat.slice(chat.indexOf("const submit = async"));
    expect(submit.indexOf("await planPage(")).toBeGreaterThan(-1);
    expect(submit.indexOf("await planPage(")).toBeLessThan(submit.indexOf("planIndexHold("));
    expect(submit).toMatch(/planIndexHold\(\{[^}]*coveredWhole: coversAttachments\(page, docs\.documents\)/);
  });
});

describe("round 131 · picture answers in Chat", () => {
  it("a fresh picture turn is checked against its facts with the honest line; regenerate and plain turns stream as before", () => {
    expect(chat).toMatch(/const checksPicture = !existingMessageId && messages\.some\(\(m\) => m\.images\?\.length\)/);
    expect(chat).toMatch(/checksPicture\s*\?\s*checkedAnswer\(\{/);
    expect(chat).toMatch(/honest: t\("chat\.vision\.unsure"\)/);
    expect(chat).toMatch(/question: lastUser/);
  });

  it("the honest line drops the sources it could not stand behind", () => {
    expect(chat).toMatch(/reply === t\("chat\.vision\.unsure"\)\) \{\s*citations = undefined;\s*sources = null;\s*\}/);
  });

  it("every fresh picture answer, sound or honest, asks for the model that sees better (Instant only, by advisePhotoModel)", () => {
    expect(chat).toMatch(/if \(checksPicture && !familySafeReplaced && reply\.trim\(\) && Platform\.OS !== "web"\) \{[\s\S]*?setPhotoAdvice\(advisePhotoModel\(\{ current: vault\.model\(model\.id\)/);
    expect(chat).not.toMatch(/reply === t\("chat\.vision\.unsure"\)\) \{[^}]*setPhotoAdvice/);
    expect(chat).toMatch(/<ModelAdviceCard[^>]*advice=\{cardAdvice\}/s);
  });

  it("the photos card respects its snooze, and a fresh turn clears it", () => {
    expect(chat).toContain("const cardAdvice = (photoAdvice && !adviceSnoozed.includes(photoAdvice.key) && status.kind === \"ready\" ? photoAdvice : null) ?? adviceShown;");
    expect(chat).toContain("onNotNow={() => snoozeAdvice(cardAdvice.key)}");
    expect(chat).toContain("if (!existingMessageId) setPhotoAdvice(null);");
  });

  it("the honest line can be forced only through the EXPO_PUBLIC_DEV_PICTURE_FAULT seam", () => {
    expect(chat).toContain('process.env.EXPO_PUBLIC_DEV_PICTURE_FAULT === "1"');
    expect(chat).toMatch(/forceFault: DEV_PICTURE_FAULT/);
  });
});

describe("round 131 · new strings in every locale", () => {
  const LOCALES = join(__dirname, "../../../packages/i18n/locales");
  const locales = Object.fromEntries(readdirSync(LOCALES).filter((f) => f.endsWith(".json")).map((f) => [f.replace(/\.json$/, ""), JSON.parse(readFileSync(join(LOCALES, f), "utf8")) as Record<string, string>]));

  it("the honest line and the photos advice exist in all eight locales and pseudo, with the advice's placeholders", () => {
    expect(Object.keys(locales).sort()).toEqual(["de", "en", "es", "fr", "ja", "ko", "pseudo", "pt-BR", "zh-Hant"]);
    for (const [code, strings] of Object.entries(locales)) {
      expect(strings["chat.vision.unsure"], code).toBeTruthy();
      expect(strings["chat.modelAdvice.photos"], code).toContain("{better}");
      expect(strings["chat.modelAdvice.photos"], code).toContain("{current}");
    }
  });
});
