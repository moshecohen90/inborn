import { describe, expect, it } from "vitest";
import * as core from "../src/index";
import type { Delta, GuardedDelta } from "../src/index";
import device from "./fixtures/r116-device-answers.json";

/**
 * Round 116 (F434). iPhone build 26 on round 115's guard (main 4f27a09f) at the 0.2 persona still showed two items said
 * again in other words and three seam blemishes: es-list item 17 restates item 5 with "hacer" for "haciendo", fr-list
 * item 11 is item 6 in the singular, ko-list joined "15. 파 16. 오징어", ja-list-cities ran "…三重、鳥取これらは…", and
 * he-list's tail cut kept "…ברוז, ברוזל" with item 6 said again.
 */
const { guardLoops, retrySeparator, tailLoop } = core;
const usage = { promptTokens: 1, completionTokens: 1, ttftMs: 1, tokPerSec: 1 };
const ES = device["l02-es-list"];
const FR = device["l02-fr-list"];
const KO = device["l02-ko-list"];
const JA = device["l02-ja-list-cities"];
const HE = device["l02-he-list"];

function engine(text: string, step = 3): AsyncIterable<Delta> {
  return (async function* () {
    const cps = Array.from(text);
    for (let i = 0; i < cps.length; i += step) yield { text: cps.slice(i, i + step).join("") };
    yield { done: usage };
  })();
}

async function screen(stream: AsyncIterable<GuardedDelta>) {
  let reply = "";
  let loop: GuardedDelta["loop"];
  const screens: string[] = [];
  for await (const d of stream) {
    if (d.trim !== undefined) reply = d.trim;
    if (d.loop) {
      loop = d.loop;
      reply = d.loop.text;
    }
    if (d.text) reply += d.text;
    screens.push(reply);
  }
  return { shown: reply, loop, screens };
}

const guarded = (answer: string, request: string, retry?: (kept: string) => AsyncIterable<Delta>) => screen(guardLoops(engine(answer), () => undefined, { request, retry }));
const final = (text: string, request = "") => tailLoop(text, { request }, 0, true).hit;
const list = (items: string[], intro = "Here you go:") => `${intro}\n\n${items.map((x, i) => `${i + 1}. ${x}`).join("\n")}\n`;
const FILL = ["Read one page of a good book every night.", "Walk for twenty minutes after lunch today.", "Drink a full glass of water each morning.", "Call an old friend you have not seen lately.", "Write down three things that went well today."];

describe("F434 · in an enumeration, an item of 6+ words whose word stems match an earlier item's at 80% is that item again", () => {
  it("build 26 es-list 0.2: cut before item 17, which restates item 5 with 'hacer' for 'haciendo'; item 17 is never on screen", async () => {
    const r = await guarded(ES.answer, ES.request);
    expect(r.loop).toBeDefined();
    expect(r.shown.trimEnd().endsWith("haz lo posible con cada segundo.")).toBe(true);
    expect(r.screens.some((x) => x.includes("17."))).toBe(false);
    expect(r.shown).toContain("5. La única forma de ser feliz es haciendo cosas buenas y haciendo cosas malas.");
  });

  it("the offline check cuts at item 17's line", () => {
    const hit = final(ES.answer, ES.request);
    expect(hit).not.toBeNull();
    expect(ES.answer.slice(hit!.keep).startsWith("17. La única")).toBe(true);
  });

  it("keeps a swap: 'I like cats more than dogs' and 'I like dogs more than cats' say different things", async () => {
    const text = list([...FILL, "I like cats more than dogs, honestly.", "I like dogs more than cats, honestly."]);
    expect((await guarded(text, "Write 7 short sentences about preferences.")).loop).toBeUndefined();
    expect(final(text)).toBeNull();
  });

  it("keeps two items that differ in the word that names them (the Louvre and the Orsay)", () => {
    const text = list([...FILL, "Visit the Louvre Museum in central Paris.", "Visit the Orsay Museum in central Paris."]);
    expect(final(text, "30 things to do in Paris")).toBeNull();
  });

  it("keeps an item that adds a negation", () => {
    const text = list([...FILL, "La única forma de ser feliz es hacer cosas buenas.", "La única forma de ser feliz es no hacer cosas buenas."]);
    expect(final(text)).toBeNull();
  });

  it("keeps a tense pair ('is' against 'was') and a grammar drill that changes one verb's form", () => {
    const tense = list([...FILL, "He is playing football in the park.", "He was playing football in the park."]);
    expect(final(tense, "Give me sentences for practice.")).toBeNull();
    const drill = list(["Yo como una manzana en la cocina.", "Tú comes pan con queso en casa.", "Ella bebe agua fría del río.", "Nosotros vivimos en una ciudad grande.", "Ellos leen libros en la biblioteca.", "Yo estoy comiendo una manzana en la cocina.", "Yo estaba comiendo una manzana en la cocina."]);
    expect(final(drill, "Conjugate these sentences in the present and past tense.")).toBeNull();
  });

  it("keeps table rows, asked repetition and a list that never reaches five distinct items", () => {
    const table = "| Frase | Nota |\n|---|---|\n| La única forma de ser feliz es haciendo cosas buenas | 5 |\n| La única forma de ser feliz es hacer cosas buenas | 4 |\n";
    expect(final(table)).toBeNull();
    const asked = list(["The quick brown fox jumps over the dog.", "The quick brown fox jumped over the dog."]);
    expect(final(asked, "Repeat this sentence 2 times as a numbered list.")).toBeNull();
    const short = list(["Stay calm and keep going every day.", "Keep going and stay calm every day.", "Staying calm and keeping going every day."]);
    expect(final(short)).toBeNull();
  });
});

describe("F434 · heads compared with the determiner dropped and each word in the singular", () => {
  it("build 26 fr-list 0.2: cut before item 11 'Un objet de décoration maison', item 6 'Des objets …' again; never on screen", async () => {
    const r = await guarded(FR.answer, FR.request);
    expect(r.loop).toBeDefined();
    expect(r.shown.trimEnd().endsWith("10. Des livres de fiction ou des magazines.")).toBe(true);
    expect(r.screens.some((x) => x.includes("11."))).toBe(false);
  });

  it("'Whale sharks' after 'Whale shark' is one animal twice", () => {
    const text = list(["Blue whale", "Sea otter", "Green turtle", "Whale shark", "Manta ray", "Clown fish", "Whale sharks"]);
    expect(final(text)).not.toBeNull();
  });

  it("keeps 'Level 1' and 'Level 2', 'Saint Paul' and 'Saint Pauli', one-word items, and 'zu tunen' after 'zu tun' (build 25)", () => {
    expect(final(list(["Level 1", "Level 2", "Level 3", "Level 4", "Level 5", "Level 6"]))).toBeNull();
    expect(final(list(["Saint Paul", "Saint Louis", "New Orleans", "Kansas City", "Santa Fe", "Saint Pauli"]))).toBeNull();
    expect(final(list(["Des chats", "Des chiens", "Des lapins", "Des oiseaux", "Des poissons", "Un chat"]))).toBeNull();
    expect(final(list(["zu sein (to be)", "zu haben (to have)", "zu gehen (to go)", "zu kommen (to come)", "zu tun (to do)", "zu machen (to make)", "zu tunen (to tune)"]))).toBeNull();
  });

  it("folds Hebrew and Italian plurals, and 'city' to 'cities'", () => {
    expect(final(list(["תמונות משפחתיות", "ספר בישול", "כוס קפה", "שעון יד", "צעיף חם", "תמונה משפחתית"]))).not.toBeNull();
    expect(final(list(["I vini rossi", "Una borsa nera", "Un orologio d'oro", "Il pane caldo", "Una sciarpa blu", "Il vino rosso"]))).not.toBeNull();
    expect(final(list(["Big cities abroad", "Small towns", "Mountain huts", "Beach houses", "Lake cabins", "Big city abroad"]))).not.toBeNull();
  });
});

describe("F434 · seams at the silent retry", () => {
  it("build 26 ko-list: '…15. 파' + '16. 오징어' gets the inline list's ', ' back", async () => {
    expect(retrySeparator(KO.kept, "16. 오징어")).toBe(", ");
    expect(retrySeparator(KO.kept, "1")).toBeNull();
    const first = `${KO.kept}, 16. 마늘, 17. 우유, 18. 빵`;
    const r = await guarded(first, KO.request, () => engine(KO.retry));
    expect(r.shown).toContain("15. 파, 16. 오징어");
    expect(r.shown).not.toContain("15. 파 16.");
  });

  it("build 26 ja-list-cities: '…三重、鳥取' + prose gets '。' first; a next item or a Latin list is joined as before", async () => {
    expect(retrySeparator(JA.kept, JA.retry)).toBe("。");
    expect(retrySeparator(JA.kept, "これらは")).toBeNull();
    expect(retrySeparator(JA.kept, "松江、鹿児島")).toBe("");
    expect(retrySeparator("Fruits: apples, pears, plums, cherries", "These are all fruits you can grow at home.", true)).toBe(". ");
    expect(retrySeparator("Fruits: apples, pears, plums, cherries", "and figs.", true)).toBe(" ");
    expect(retrySeparator("In spring red, green, blue, and yellow flowers bloom", "throughout the whole valley and the hills around it.", true)).toBe(" ");
    const first = `${JA.kept}、鳥取、鳥取、鳥取、鳥取、鳥取`;
    const r = await guarded(first, JA.request, () => engine(JA.retry));
    expect(r.shown).toContain("鳥取。これらはすべて");
  });

  it("build 26 he-list: the tail cut ends before 'ברוזל', item 6 said again, at the separator before it", async () => {
    const first = `${HE.answer}, בראגן, בראונד, בראינג, ברוז, ברוזל, בראגן, בראונד, בראינג`;
    const r = await guarded(first, HE.request);
    expect(r.loop).toBeDefined();
    expect(r.shown.endsWith("בראינג, ברוז")).toBe(true);
    expect(r.loop!.text.endsWith("בראינג, ברוז")).toBe(true);
  });
});
