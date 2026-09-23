import { describe, expect, it } from "vitest";
import { BUNDLED_MANIFEST, betterForLanguage, modelChoices, type CatalogModel, type DeviceProfile, type ModelChoicesInput } from "../src/index";

const catalog = BUNDLED_MANIFEST.models;
const byId = (id: string): CatalogModel => catalog.find((m) => m.id === id)!;
const phone = (ramGB: number): DeviceProfile => ({ ramGB, deviceClass: "phone" });
const input = (over: Partial<ModelChoicesInput>): ModelChoicesInput => ({ use: "chat", languageCode: "en", device: phone(8), installed: ["instant"], currentId: "instant", catalog, ...over });
const ids = (rows: { model: CatalogModel }[]) => rows.map((r) => r.model.id);

describe("modelChoices (the chat's Model sheet, §7.8)", () => {
  it("installed first, then what this 8 GB phone can still download, each best first", () => {
    const c = modelChoices(input({}));
    expect(ids(c.installed)).toEqual(["instant"]);
    expect(ids(c.available)).toEqual(["fast", "sharp", "sharp-phi"]);
    expect(ids(c.unavailable)).toEqual([]);
    expect(c.recommended?.model.id).toBe("fast");
    expect(c.recommendedWeak).toBe(false);
  });
  it("marks the loaded model and keeps it in the installed list even when it is not the best pick", () => {
    const c = modelChoices(input({ installed: ["instant", "fast"], currentId: "instant" }));
    expect(ids(c.installed)).toEqual(["fast", "instant"]);
    expect(c.installed.find((x) => x.current)?.model.id).toBe("instant");
    expect(c.installed.every((x) => x.installed)).toBe(true);
    expect(ids(c.available)).toEqual(["sharp", "sharp-phi"]);
  });
  it("a 4 GB phone still sees the bigger models, greyed, with the reason", () => {
    const c = modelChoices(input({ device: phone(4) }));
    expect(ids(c.available)).toEqual([]);
    expect(ids(c.unavailable)).toEqual(["fast", "sharp", "sharp-phi"]);
    expect(c.unavailable.map((x) => x.blocked)).toEqual(["ram", "ram", "ram"]);
  });
  it("a model the running app is too old for says so instead of blaming the RAM", () => {
    const future = { ...byId("fast"), minEngine: 99 };
    const c = modelChoices(input({ catalog: catalog.map((m) => (m.id === "fast" ? future : m)) }));
    expect(c.unavailable.find((x) => x.model.id === "fast")?.blocked).toBe("engine");
  });
  it("Hebrew chat: Sharp leads and the line says plainly that nothing here is good at it", () => {
    const c = modelChoices(input({ languageCode: "he" }));
    expect(c.recommended?.model.id).toBe("sharp");
    expect(c.recommendedWeak).toBe(true);
    expect(c.installed[0]!.reason.languageTier).toBe("none");
    expect(c.available.find((x) => x.model.id === "sharp")!.reason.languageTier).toBe("basic");
  });
  it("carries each row's language tier and RAM fit, so the sheet never re-derives them", () => {
    const c = modelChoices(input({ languageCode: "ja" }));
    expect(c.available.find((x) => x.model.id === "sharp")!.reason).toMatchObject({ languageTier: "native", useTier: "best", ramFit: "well" });
    expect(c.installed[0]!.reason.languageTier).toBe("basic");
  });
  it("a tier that can only load what it holds is never told another model is recommended here (§14.3)", () => {
    const web = modelChoices(input({ recommendAmong: ["instant"] }));
    expect(web.recommended?.model.id).toBe("instant");
    /* The others are still listed, just never claimed: the sheet points at the app for them. */
    expect(ids(web.available)).toEqual(["fast", "sharp", "sharp-phi"]);
    expect(modelChoices(input({ recommendAmong: ["instant"], languageCode: "he" })).recommendedWeak).toBe(true);
    /* Without the restriction the same input recommends a model this tier could not load. */
    expect(modelChoices(input({})).recommended?.model.id).toBe("fast");
  });
  it("an unrated language leaves every tier null rather than claiming a fit", () => {
    const c = modelChoices(input({ languageCode: "tr" }));
    expect([...c.installed, ...c.available].every((x) => x.reason.languageTier === null)).toBe(true);
  });
});

describe("betterForLanguage (the weak-language notice, §7.8)", () => {
  const advice = (over: Partial<Parameters<typeof betterForLanguage>[0]>) => betterForLanguage({ current: byId("instant"), use: "chat", languageCode: "he", device: phone(8), installed: [], catalog, ...over });

  it("Instant rates Hebrew none, so it names the best model here that does better", () => {
    const r = advice({})!;
    expect(r.code).toBe("he");
    expect(r.from).toBe("none");
    expect(r.better.model.id).toBe("sharp");
    expect(r.better.reason.installed).toBe(false);
    expect(r.best).toBeUndefined();
  });
  it("prefers a model already on the device, and still names the best one to install", () => {
    const r = advice({ installed: ["sharp-phi"] })!;
    expect(r.better.model.id).toBe("sharp-phi");
    expect(r.better.reason.installed).toBe(true);
    expect(r.best?.model.id).toBe("sharp");
  });
  it("a language the model cannot write is reason enough on its own; the task only breaks the tie", () => {
    /* Sharp and Phi both lift Hebrew from none to basic, so the task decides between them: Phi for code, Sharp for chat. */
    expect(advice({ use: "code" })!.better.model.id).toBe("sharp-phi");
    expect(advice({ use: "chat" })!.better.model.id).toBe("sharp");
    /* `adviseModel` stays silent here because Instant is not weak at chat; the language notice still speaks. */
    expect(advice({ use: "summarize" })!.better.model.id).toBe("sharp");
  });
  it("says nothing when the language is already good, unrated, or nothing here improves on it", () => {
    expect(advice({ languageCode: "en" })).toBeNull();
    expect(advice({ languageCode: "pt" })).toBeNull();
    expect(advice({ languageCode: "tr" })).toBeNull();
    expect(advice({ languageCode: null })).toBeNull();
    /* A 4 GB phone can run nothing but Instant, so there is no honest offer to make. */
    expect(advice({ device: phone(4) })).toBeNull();
    expect(advice({ current: byId("sharp"), languageCode: "ja" })).toBeNull();
  });
  it("basic is weak too: Sharp rates Hebrew basic and nothing here beats it, so no offer", () => {
    expect(advice({ current: byId("sharp") })).toBeNull();
    /* …but from Phi, whose Hebrew is basic as well, the ranking finds no strictly better model either. */
    expect(advice({ current: byId("sharp-phi") })).toBeNull();
  });
});
