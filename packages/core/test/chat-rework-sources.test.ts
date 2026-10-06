import { describe, expect, it } from "vitest";
import { buildCitations, citationsForAnswer, groundedCitations, inheritedCitations, reworkedAnswer, withoutStrayMarkers, type DocumentRecord, type RetrievalHit } from "../src";

/* Two passages of the constitution fixture (docs/qa/r132-doc-summary/fixtures/constitution-9pages.pdf). */
const P2 =
  "The Senate shall have the sole Power to try all Impeachments. When sitting for that Purpose, they shall be on Oath or Affirmation. And no Person shall be convicted without the Concurrence of two thirds of the Members present. Judgment in Cases of Impeachment shall not extend further than to removal from Office, but the Party convicted shall nevertheless be liable and subject to Indictment, Trial, Judgment and Punishment, according to Law.";
const P6 =
  "He shall have Power, by and with the Advice and Consent of the Senate, to make Treaties, provided two thirds of the Senators present concur. He shall from time to time give to the Congress Information of the State of the Union. The Trial of all Crimes, except in Cases of Impeachment, shall be by Jury; but when not committed within any State, the Trial shall be at such Place or Places as the Congress may by Law have directed. The President shall require the Opinion, in writing, of the principal Officer in each of the executive Departments.";

const doc: DocumentRecord = { id: "c", name: "constitution-9pages.pdf", kind: "pdf", bytes: 1, pages: 9, addedAt: 0, status: "indexed", indexedPages: 9, chunkCount: 2, flaggedLines: 0, ocrPages: 0, uri: "documents/c/c.pdf" };
const hit = (page: number, text: string, i: number): RetrievalHit => ({ chunk: { id: `c#${i}`, docId: "c", page, ord: i, text, start: 0, end: text.length, tokens: 0 }, score: 1, cosine: 0.7, bm25: 1, bm25Terms: 1 });
const used = [hit(6, P6, 0), hit(2, P2, 1)];
const citations = buildCitations(used, new Map([["c", doc]]));

const SUMMARY =
  "Impeachment: The Senate has the sole power to try all impeachments. Conviction needs two thirds of the members present [2]. Judgment does not extend further than removal from office, but the party convicted is still liable to trial and punishment according to law [2]. The President makes treaties with the advice and consent of the Senate [1].";

describe("round 134I · a rework carries the sources of the answer it reworks", () => {
  it("the reworked answer is the last real answer, past the thanks; nothing when the follow-up opens the chat", () => {
    const history = [
      { role: "user" as const, content: "Summarize it" },
      { role: "assistant" as const, content: SUMMARY },
      { role: "user" as const, content: "Thanks" },
      { role: "assistant" as const, content: "You're welcome!" },
      { role: "user" as const, content: "shorter" },
    ];
    expect(reworkedAnswer(history)?.content).toBe(SUMMARY);
    expect(reworkedAnswer([...history.slice(0, 2), { role: "user" as const, content: "shorter" }])?.content).toBe(SUMMARY);
    expect(reworkedAnswer([{ role: "user" as const, content: "shorter" }])).toBeNull();
  });

  it("a shorter version, bullets or a translation keep the summary's chips; every [n] still resolves", () => {
    const shorter = "The Senate tries impeachments; conviction needs two thirds, and removal from office leaves the party liable to trial [2].";
    expect(inheritedCitations(shorter, { content: SUMMARY, citations })).toEqual(citations);
    expect(citationsForAnswer(shorter, inheritedCitations(shorter, { content: SUMMARY, citations })).shown.map((c) => c.page)).toEqual([2]);
    const bullets = "- The Senate tries all impeachments.\n- Conviction needs two thirds of the members present.\n- The President makes treaties with the Senate's consent.";
    expect(inheritedCitations(bullets, { content: SUMMARY, citations })).toEqual(citations);
    const french = "- Le Sénat a le pouvoir exclusif de juger toutes les mises en accusation.\n- La condamnation exige les deux tiers des membres présents.\n- Le Président conclut les traités avec l'avis et le consentement du Sénat.";
    expect(inheritedCitations(french, { content: SUMMARY, citations })).toEqual(citations);
  });

  it("a reply that does not restate the answer, or an answer with no sources, inherits nothing", () => {
    expect(inheritedCitations("Great! Let's make it even shorter. What do you want to add?", { content: SUMMARY, citations })).toEqual([]);
    expect(inheritedCitations("The Senate tries impeachments.", { content: "Rome was founded in 753 BC." })).toEqual([]);
    expect(inheritedCitations("", { content: SUMMARY, citations })).toEqual([]);
  });

  it("a [n] that opens no chip is dropped, with the space before it; the ones that do stay", () => {
    const one = citations.filter((c) => c.n === 2);
    expect(withoutStrayMarkers("…even if removed from office [4].", one)).toBe("…even if removed from office.");
    expect(withoutStrayMarkers("…removed from office [2].", one)).toBe("…removed from office [2].");
    expect(withoutStrayMarkers("Two thirds [2, 5] concur.", one)).toBe("Two thirds [2] concur.");
    expect(withoutStrayMarkers("Serve warm [1].", [])).toBe("Serve warm.");
  });
});

describe("round 134I · an answer that uses no passage shows none of them", () => {
  /* J9-25 on build 40: Instant's pancake recipe in the constitution chat came with "[1] constitution-9pages.pdf · p.6". */
  const PANCAKES =
    "Pancakes require no special ingredients. Mix flour, baking powder, and salt with melted butter in a bowl; add eggs and mix until smooth. Cook on medium heat: make two thick pancakes from each side, fold them into a square shape, and place in the hot pan for 3–4 minutes. Serve warm or cold as needed [1].";

  it("the pancake recipe shares a few common words with page 6 and gets no chip", () => {
    expect(groundedCitations(PANCAKES, "Give me a quick recipe for pancakes.", used, citations)).toEqual([]);
    expect(groundedCitations(PANCAKES.replace(" [1]", ""), "Give me a quick recipe for pancakes.", used, citations)).toEqual([]);
  });

  it("Fast's refusal, which names only the file and its topic, gets no chip either", () => {
    const refusal = "I cannot provide a recipe because the document you uploaded contains only legal text regarding the United States Constitution; it does not include any culinary instructions or cooking information.";
    expect(groundedCitations(refusal, "Give me a quick recipe for pancakes.", used, citations)).toEqual([]);
  });

  it("an answer taken from the passages keeps its chips, and its [2] opens page 2", () => {
    const answer = "Conviction needs the concurrence of two thirds of the members present, and judgment goes no further than removal from office [2].";
    const kept = groundedCitations(answer, "How is someone convicted after impeachment?", used, citations);
    expect(kept.map((c) => c.page)).toContain(2);
    expect(citationsForAnswer(answer, kept).shown.map((c) => c.page)).toEqual([2]);
  });
});
