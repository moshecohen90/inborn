import { describe, expect, it } from "vitest";
import * as core from "../src/index";
import type { Delta, GuardedDelta } from "../src/index";

/**
 * Round 113 (F426). iPhone build 23 and the Fast web run: the silent retry's instruction echoed on screen as self-talk,
 * a retried list that went on as prose or restarted, an empty retry that left ",.", and Continue restating the stopped
 * clause after a new subject.
 */
const { guardLoops, seamOverlap, CONTINUE_INSTRUCTION } = core;
const usage = { promptTokens: 1, completionTokens: 1, ttftMs: 1, tokPerSec: 1 };

function engine(text: string, step = 3): AsyncIterable<Delta> {
  return (async function* () {
    const cps = Array.from(text);
    for (let i = 0; i < cps.length; i += step) yield { text: cps.slice(i, i + step).join("") };
    yield { done: usage };
  })();
}

async function screen(stream: AsyncIterable<GuardedDelta>) {
  let shown = "";
  let loop: GuardedDelta["loop"];
  const screens: string[] = [];
  for await (const d of stream) {
    if (d.trim !== undefined) shown = d.trim;
    if (d.loop) {
      loop = d.loop;
      shown = d.loop.text;
    }
    if (d.text) shown += d.text;
    screens.push(shown);
  }
  return { shown, loop, screens };
}

const ANIMALS = "List 30 animals that live in the ocean, one per line, numbered.";
/* Web Fast rerun 2: items 1 to 12, then "Shark" and "Dolphin" again. */
const FIRST = "1. Bluefin Tuna  \n2. Shark  \n3. Whale  \n4. Dolphin  \n5. Sea Otter  \n6. Porcupine Seals  \n7. Killer Whales  \n8. Sea Lion  \n9. Penguin  \n10. Walrus  \n11. Humpback Whale  \n12. Seal  \n13. Shark  \n14. Dolphin  \n15. Sea Turtle\n16. Manatee\n";
/* Its continuation as the phone's web run showed it, after the retry instruction. */
const SELF_TALK =
  '16. Manatee  \n17. Clownfish  \n18. Starfish  \n19. Octopus  \n20. Jellyfish  \n21. Seahorse  \n22. Sea Snake (Jellyfish) - wait, that\'s a jellyfish above. Let me correct: 21. Sea Urchin  \n22. Crab Crab Crab... no. I need to list new ones from the original list or unique ones not yet listed in my count of 30? The prompt asks for "List 30 animals", and I\'ve already provided a few that overlap (like Shark, Dolphin appearing twice). To strictly follow "Continue exactly where you stopped" without repeating what already wrote means I must add more to the total set while avoiding duplicates from my first output.\nLet\'s restart counting properly for this specific continuation task based on the 30 list requirement:\n';

describe("F426 (a) · the silent retry's instruction never reaches the screen", () => {
  it("web Fast rerun 2: a retry that talks about 'Continue exactly where you stopped' is taken back whole, the notice shows", async () => {
    const { shown, loop, screens } = await screen(guardLoops(engine(FIRST), () => undefined, { request: ANIMALS, retry: () => engine(SELF_TALK) }));
    expect(loop).toBeDefined();
    expect(shown.trimEnd().endsWith("12. Seal")).toBe(true);
    for (const s of screens) expect(s).not.toMatch(/exactly where you stopped/iu);
  });

  it("a fake engine that echoes its prompt: no word of the instruction on any screen", async () => {
    for (const echo of [`${CONTINUE_INSTRUCTION}\n13. Crab\n`, `13. Crab\nOkay. ${CONTINUE_INSTRUCTION}`, `Sure: "Continue exactly where you stopped." 13. Crab`]) {
      const { shown, loop, screens } = await screen(guardLoops(engine(FIRST), () => undefined, { request: ANIMALS, retry: () => engine(echo) }));
      expect(loop).toBeDefined();
      for (const s of screens) expect(s).not.toMatch(/where you stopped|do not repeat what|repeat what you already|okay|sure/iu);
      expect(shown.trimEnd()).toMatch(/12\. Seal(?:\n13\. Crab)?$/u);
    }
  });

  it("Continue after Stop that echoes the instruction keeps the stopped text and nothing of the echo", async () => {
    const prefix = "Ocean animals:\n1. Shark\n2. Whale\n";
    const { screens } = await screen(guardLoops(engine(`${CONTINUE_INSTRUCTION} 3. Seal`), () => undefined, { request: ANIMALS, prefix }));
    for (const s of screens) expect(s).not.toMatch(/where you stopped/iu);
  });

  it("an answer about stopping and repeating in its own words stays", async () => {
    const text = "When you stopped the car, do not repeat the turn. Continue on the road you already know.";
    const { shown, loop } = await screen(guardLoops(engine(text), () => undefined, { request: "How do I drive home?", prefix: "Directions:\n" }));
    expect(loop).toBeUndefined();
    expect(shown).toBe(text);
  });
});

describe("F426 (b) · after a cut inside a list, the continuation is list items only", () => {
  const KO = "한국 음식 30 가지를 소개합니다.\n\n1. 간장 (Gangbangal)\n2. 김치 (Kimchi)\n3. 국물 (Nugul)\n4. 소고기 (Sogukki)\n5. 돼지 고기 (Daejeo goegi)\n6. 닭가슴살 (Daegwaesamwal)\n7. 양파 (Yappe)\n8. 파스타 (Paspa)\n9. 요거트 (Yojot)\n10. 우유 (Uyu)\n11. 치즈 (Chisze)\n12. 햄버거 (Hamberge)\n13. 피자 (Pizza)\n14. 스시 (Sushi)\n15. 스테이크 (Steak)\n16. 김치 (Kimchi)\n";
  it("build 23 ko-list 0.2: the retry's stray line '다음은 다음 단계입니다.' under item 15 is cut, the notice shows", async () => {
    const { shown, loop, screens } = await screen(guardLoops(engine(KO), () => undefined, { request: "한국 음식 30가지를 번호를 매겨 나열해 주세요.", retry: () => engine("다음은 다음 단계입니다.\n16. 비빔밥\n") }));
    expect(loop).toBeDefined();
    expect(shown.trimEnd().endsWith("15. 스테이크 (Steak)")).toBe(true);
    for (const s of screens) expect(s).not.toContain("다음은");
  });

  const FR_HEAD = "Voici 30 idées de cadeaux d'anniversaire, sélectionnés pour offrir une touche personnelle et occasionnelle :\n\n1. Une collection de livres jeunesse ou des livres de divertissement amusant\n2. Des objets d'art ou de décoration inspirés du domaine artistique\n3. Une photo numérique de l'année passée avec la personne (ex: Instagram)\n4. Un jeu vidéo ou un jeu vidéo pour les jeux vidéo\n5. Des accessoires de jardinage ou de horticulture pour les amateurs\n6. Des livres de recettes, de cuisine ou de conseils nutritionnels\n7. Des objets d'électronique qui reflètent votre passion ou vos hobbies\n";
  const FR_RESTART = "Voici une autre sélection de 30 idées, conçue pour aller au-delà des cadeaux \"tout-en-un\" et offrir plus d'attraction personnelle :\n\n1. Une collection de livres jeunesse ou des livres de divertissement amusant\n2. Des objets d'art ou de décoration inspirés du domaine artistique\n3. Une photo numérique";
  it("build 23 fr-list 0.7 #2: a retry that restarts the list with a new intro ends at item 8, intro and all dropped", async () => {
    const loopText = `${FR_HEAD}${FR_HEAD.split("\n\n")[1]}`;
    const retry = () => engine(`8. Une collection de photos anciennes de famille avec un cadre magnétique\n${FR_RESTART}`);
    const { shown, loop, screens } = await screen(guardLoops(engine(loopText), () => undefined, { request: "Donne-moi 30 idées de cadeaux d'anniversaire, numérotées.", retry }));
    expect(loop).toBeDefined();
    expect(shown.trimEnd().endsWith("8. Une collection de photos anciennes de famille avec un cadre magnétique")).toBe(true);
    for (const s of screens) expect(s).not.toContain("autre sélection");
  });

  it("a restarted list cut in the first answer drops the restart's intro back to the last kept item", () => {
    const text = `${FR_HEAD}8. Une collection de photos anciennes\n${FR_RESTART}`;
    const hit = core.tailLoop(text, { request: "Donne-moi 30 idées de cadeaux d'anniversaire." }, 0, true).hit;
    expect(hit).not.toBeNull();
    const cut = core.cutLoop(text, hit!);
    expect(cut.text.trimEnd().endsWith("8. Une collection de photos anciennes")).toBe(true);
  });

  it("build 23 he-list 0.2: a retry that writes only '.' is dropped, the trailing comma goes, the notice shows", async () => {
    const kept = "הנה רשימה של 30 ערים בישראל: אשדוד, אריאל, באר שבע, בן גבדין, בר-אילון, בית שם, ברוך יעקב, בורסו, כנרת, דובי, דגל, דפנות, דימיוס, דומה, דודיה, דרצות, דריכה, דרשינה,";
    const looped = `${kept} דרשינה, דרשינה, דרשינה, דרשינה, דרשינה, דרשינה,`;
    const { shown, loop } = await screen(guardLoops(engine(looped), () => undefined, { request: "רשום 30 ערים בישראל.", retry: () => engine(".") }));
    expect(loop).toBeDefined();
    /* The cut keeps "…דריכה," before the copies of "דרשינה,"; the retry's "." and the comma go. */
    expect(shown.endsWith("דריכה")).toBe(true);
  });

  it("a retry that finishes the list to the count ends quietly at its last item, no notice", async () => {
    const tail = Array.from({ length: 16 }, (_, i) => `${i + 15}. Animal ${String.fromCharCode(65 + i)}${String.fromCharCode(97 + i)}x`).join("\n");
    const { shown, loop } = await screen(guardLoops(engine(FIRST), () => undefined, { request: ANIMALS, retry: () => engine(`13. Crab\n14. Squid\n${tail}\nAll of these live in salt water.`) }));
    expect(loop).toBeUndefined();
    expect(shown.trimEnd().endsWith("30. Animal Ppx")).toBe(true);
  });
});

describe("F426 (c) · Continue: a new subject that restates the stopped clause", () => {
  it("build 23 Continue try 2: '…treaties like the' + 'British colonial powers established control … treaties like the Indian Ocean Treaty' reads '…treaties like the Indian Ocean Treaty'", async () => {
    const prefix = "By the 18th century, British colonial powers had established control over key spice routes in India and China through treaties like the";
    const next = "British colonial powers established control over key spice routes in India and China through treaties like the Indian Ocean Treaty of 1809, which opened new ports.";
    const { shown } = await screen(guardLoops(engine(next), () => undefined, { request: "Write a long history of the spice trade.", prefix }));
    expect(`${prefix}${core.continuationSeparator(prefix, shown)}${shown}`).toBe(`${prefix} Indian Ocean Treaty of 1809, which opened new ports.`);
  });

  it("build 23 Continue try 3: '…complex maritime navigation' + 'The logistical challenges … necessitated the development of complex maritime navigation techniques'", async () => {
    const prefix = "The geography played a crucial role here. This necessitated the development of complex maritime navigation";
    const next = "The logistical challenges inherent in moving heavy commodities across rough seas necessitated the development of complex maritime navigation techniques, such as the astrolabe.";
    expect(seamOverlap(prefix, next, true)).toBe(next.indexOf(" techniques"));
    const { shown } = await screen(guardLoops(engine(next, 5), () => undefined, { request: "Write a long history of the spice trade.", prefix }));
    expect(shown).toBe(" techniques, such as the astrolabe.");
  });

  it("the same check on the retry continuation", async () => {
    const looped = "Merchants crossed the sea in small ships built from local timber and\n\nMerchants crossed the sea in small ships built from local timber and\n\nMerchants crossed the sea in small ships built from local timber and";
    const retry = () => engine(" Over the years merchants crossed the sea in small ships built from local timber and pitch, sailing by the stars.");
    const { shown } = await screen(guardLoops(engine(looped), () => undefined, { request: "Tell me about merchants.", retry }));
    expect(shown).not.toMatch(/timber and[\s\S]*timber and/u);
  });

  it("a short shared phrase is not an overlap: four words stay", () => {
    expect(seamOverlap("The fleet sailed across the sea", "Storms hit hard when they sailed across the sea at night.", true)).toBe(0);
  });

  it("a continuation that goes on without a restatement is shown as the model wrote it", async () => {
    const prefix = "Sailors crossed oceanic territories previously thought unreachable";
    const next = " In the 14th century, maritime navigation improved drastically.";
    const { shown } = await screen(guardLoops(engine(next), () => undefined, { request: "History of navigation.", prefix }));
    expect(shown).toBe(next);
  });
});
