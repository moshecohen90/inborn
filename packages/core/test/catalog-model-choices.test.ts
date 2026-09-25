import { describe, expect, it } from "vitest";
import { BUNDLED_MANIFEST, betterForLanguage, deviceRecommendation, modelChoices, pickDefault, recommendationRoomNote, type CatalogModel, type DeviceProfile, type ModelChoicesInput, type StorageRoom } from "../src/index";

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

describe("one RECOMMENDED per device (F345, Moshe's decision 6: the best model for this device first)", () => {
  const legacy8: DeviceProfile = { ramGB: 8, deviceClass: "phone", chip: "android-legacy" };
  it("a OnePlus 6T holding only the bundled Instant is still told Fast, for every task (not the model it already has)", () => {
    for (const use of ["chat", "summarize", "code", "math"] as const) {
      const c = modelChoices(input({ device: legacy8, use, installed: ["instant"] }));
      expect(c.recommended?.model.id, use).toBe("fast");
      expect(c.recommended?.model.id, use).toBe(deviceRecommendation({ use, languageCode: "en", device: legacy8, installed: [], catalog })?.model.id);
    }
  });
  it("installing a model never moves the tag: the same device, task and language give the same answer before and after", () => {
    const desk: DeviceProfile = { ramGB: 8, deviceClass: "desktop", chip: "desktop-cpu" };
    const before = modelChoices(input({ device: desk, installed: ["instant"] })).recommended?.model.id;
    const after = modelChoices(input({ device: desk, installed: ["instant", "fast"] })).recommended?.model.id;
    expect(after).toBe(before);
  });
  it("the recommended row still says truthfully whether it is on the device", () => {
    expect(modelChoices(input({ installed: ["instant", "fast"] })).recommended?.reason.installed).toBe(true);
  });
  it("native onboarding's device default (pickDefault) is the same model for a phone or tablet chatting in English or no language yet", () => {
    const chips = { phone: ["ios-entry", "ios-mid", "ios-high", "ios-flagship", "android-entry", "android-legacy", "android-mid", "android-high", "android-flagship"], tablet: ["ios-mid", "ios-high", "ios-flagship"] } as const;
    for (const deviceClass of ["phone", "tablet"] as const)
      for (const chip of chips[deviceClass])
        for (const ramGB of [3, 4, 6, 8, 12, 16])
          for (const languageCode of [null, "en"]) {
            const device: DeviceProfile = { ramGB, deviceClass, chip };
            expect(deviceRecommendation({ use: "chat", languageCode, device, installed: ["instant"], catalog })?.model.id, `${deviceClass} ${chip} ${ramGB} ${languageCode}`).toBe(pickDefault(catalog, device)?.id);
          }
  });
});

describe("free space in the one recommendation (Moshe's answer 6, F13)", () => {
  const MB = 1024 ** 2;
  const GB = 1024 ** 3;
  /* The browser door's rule: the file plus 256 MB of headroom. */
  const webRoom = (freeBytes: number, onDisk: string[] = []): StorageRoom => ({ freeBytes, onDisk, neededBytes: (m) => m.bytes + 256 * MB });
  const at944 = webRoom(944 * MB);

  it("with 944 MB free the best model that fits leads, and Fast is still listed as the other option", () => {
    const c = modelChoices(input({ installed: [], currentId: null, room: at944 }));
    expect(c.recommended?.model.id).toBe("instant");
    expect(ids(c.available)).toContain("fast");
    expect(c.room).toMatchObject({ skipped: { id: "fast" }, picked: { id: "instant" }, freeBytes: 944 * MB, neededBytes: byId("fast").bytes + 256 * MB });
  });
  it("deviceRecommendation, pickDefault and the note agree on that device", () => {
    const rec = { use: "chat" as const, languageCode: "en", device: phone(8), installed: [], catalog, room: at944 };
    expect(deviceRecommendation(rec)?.model.id).toBe("instant");
    expect(pickDefault(catalog, phone(6), at944)?.id).toBe("instant");
    expect(recommendationRoomNote(rec)?.skipped.id).toBe("fast");
  });
  it("with room for both, space changes nothing and there is no note", () => {
    const c = modelChoices(input({ room: webRoom(20 * GB) }));
    expect(c.recommended?.model.id).toBe("fast");
    expect(c.room).toBeNull();
  });
  it("a model already on the disk needs no room: Fast downloaded stays the recommendation at 105 MB free", () => {
    const c = modelChoices(input({ installed: ["fast"], currentId: "fast", room: webRoom(105 * MB, ["fast"]) }));
    expect(c.recommended?.model.id).toBe("fast");
    expect(c.room).toBeNull();
  });
  it("when nothing fits (105 MB) the ranking is unchanged and there is no note: the no-space state speaks", () => {
    const rec = { use: "chat" as const, languageCode: "en", device: phone(8), installed: [], catalog, room: webRoom(105 * MB) };
    expect(deviceRecommendation(rec)?.model.id).toBe("fast");
    expect(pickDefault(catalog, phone(6), rec.room)?.id).toBe("fast");
    expect(recommendationRoomNote(rec)).toBeNull();
  });
  it("native rule (file plus the 2 GB reserve): 3 GB free fits Instant, not Fast", () => {
    const room: StorageRoom = { freeBytes: 3 * GB };
    expect(deviceRecommendation({ use: "chat", languageCode: null, device: phone(8), installed: [], catalog, room })?.model.id).toBe("instant");
    expect(pickDefault(catalog, phone(8), room)?.id).toBe("instant");
  });
  it("unknown space never demotes anything", () => {
    expect(modelChoices(input({ room: null })).recommended?.model.id).toBe("fast");
  });
});
