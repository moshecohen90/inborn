import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BUNDLED_MANIFEST, hasLicenceText, licenceText } from "@inborn/core";
import { NOTICE_IDS, licenceSubjectFor } from "../src/lib/modelLicence";
import { defaultPrefs, mergePrefs } from "../src/services/prefsTypes";

/**
 * Round 25 (gaps 1, 3, 16, 19, 20, 21 of `docs/qa/spec-conformance-2026-09-22.md`). Screens need a device, so
 * these hold the parts that do not: the pref, the licence map, and the source of the four screens whose whole
 * finding was "this line of UI is wrong". A screen assertion reads the file, the way `webBundle.test.ts` does.
 */

const SRC = join(__dirname, "../src");
const source = (p: string) => readFileSync(join(SRC, p), "utf8");
const en = JSON.parse(readFileSync(join(__dirname, "../../../packages/i18n/locales/en.json"), "utf8")) as Record<string, string>;

describe("F50 · family-safe mode is on by default and survives an upgrade", () => {
  it("a fresh install starts with it on", () => {
    expect(defaultPrefs(Date.now()).contentSafety).toBe(true);
  });
  it("prefs written before the mode existed come back with it on, not off", () => {
    const old = JSON.stringify({ ...defaultPrefs(1), contentSafety: undefined });
    expect(mergePrefs(JSON.parse(old) as Record<string, unknown>, Date.now()).contentSafety).toBe(true);
  });
  it("a user who turned it off keeps it off across a restart", () => {
    const stored = { ...defaultPrefs(1), contentSafety: false };
    expect(mergePrefs(JSON.parse(JSON.stringify(stored)) as Record<string, unknown>, Date.now()).contentSafety).toBe(false);
  });
  it("Settings → Chat carries the switch, because a filter nobody can turn off fails Guideline 1.2", () => {
    expect(source("screens/Settings/Settings.tsx")).toContain('toggle={prefs.contentSafety}');
  });
  it("both answer surfaces screen their output, not only the typed one", () => {
    expect(source("screens/Chat.tsx")).toContain("screenText(");
    expect(source("voice/useHandsFree.ts")).toContain("screenText(");
  });
  it("the clause reaches the model through the same prompt the budget counts", () => {
    expect(source("screens/Chat.tsx").match(/safetyBaseline\(SAFETY_BASELINE, familySafe\)/g)).toHaveLength(2);
  });
});

describe("F51 · nothing in the app claims a source the reader cannot open", () => {
  it("the Proof screen no longer links to the private repository", () => {
    const proof = source("screens/Proof/Proof.tsx");
    expect(proof).not.toContain("github.com/moshecohen90/inborn");
    expect(proof).toContain("proof.build.notPublished");
  });
  /* `about.openSource` is the third-party dependency list, which really is open source; the claim we had to drop is about OUR code. */
  it("no shipped string offers Inborn's own source or a hash the user could match", () => {
    const OURS = /our (?:open[- ]source|published) (?:core|source)|verify (?:it )?in the source|source code ↗|against the published hash|match it against/i;
    for (const [k, v] of Object.entries(en)) expect(v, k).not.toMatch(OURS);
  });
  it("the third-party licence screen still exists, because those components are open source", () => {
    expect(en["about.openSource"]).toBe("Open-source licenses");
  });
  it("the Work statement says what cannot be checked instead of claiming it can", () => {
    const statement = readFileSync(join(__dirname, "../../../packages/core/src/work/statement.ts"), "utf8");
    expect(statement).not.toContain("open-source core");
    expect(statement).toContain("not published");
  });
});

describe("F52 · the Android backup sentence matches allowBackup=\"false\"", () => {
  it("Android gets its own string, and it says nothing is backed up", () => {
    expect(source("screens/Settings/Storage.tsx")).toContain('"storage.backup.android"');
    expect(en["storage.backup.android"]).toMatch(/backs up nothing/i);
  });
  it("the iOS wording, which is correct, is untouched", () => {
    expect(en["storage.backup"]).toMatch(/included in your device backup/i);
  });
});

describe("F53 · /voice is gated by the licence, not only by the mic button", () => {
  const route = source("app/voice.tsx");
  it("asks the same question the chat's mic asks", () => {
    expect(route).toContain('feature: "voiceConversation"');
    expect(route).toContain("paywallFor(");
  });
  it("sends a Free user to the paywall rather than rendering the screen", () => {
    expect(route).toMatch(/Redirect href="\/paywall"/);
  });
  it("renders nothing until the tier is known, so a deep link cannot slip through the loading frame", () => {
    expect(route).toMatch(/if \(loading\) return null;/);
  });
});

describe("F54 · every model we distribute can show its licence on a device with no network", () => {
  const models = BUNDLED_MANIFEST.models;
  it("there is something to check", () => {
    expect(models.length).toBeGreaterThan(5);
  });
  it.each(models.map((m) => [m.id, m.license] as const))("%s (%s) has a bundled text", (id, license) => {
    expect(NOTICE_IDS[id], `${id} is missing from NOTICE_IDS`).toBeTruthy();
    expect(hasLicenceText(license)).toBe(true);
    expect(licenceText(license)).toBeTruthy();
  });
  it("an MIT model carries its own copyright holder, not a generic line", () => {
    const phi = models.find((m) => m.id === "sharp-phi")!;
    const subject = licenceSubjectFor(phi);
    expect(subject.attribution).toContain("Microsoft");
    expect(licenceText(subject.license, subject.attribution)).toContain("Microsoft");
  });
  it("whisper's copyright is OpenAI's, not Microsoft's: the map is per model, not per licence", () => {
    expect(licenceSubjectFor(models.find((m) => m.id === "speech-whisper-base")!).attribution).toContain("OpenAI");
  });
  it("an imported file has no NOTICE entry and still produces a usable subject", () => {
    expect(licenceSubjectFor({ id: "import:mystery.gguf", name: "mystery.gguf", license: "unknown" })).toEqual({ name: "mystery.gguf", license: "unknown" });
  });
  it("a Hugging Face download asks for the licence tap before it starts", () => {
    const hf = source("screens/vault/HfSearch.tsx");
    expect(hf).toContain("setPending(");
    expect(hf).toContain("onAccept=");
    /* The old path called onPick straight from the row; if it comes back, the acceptance is bypassed. */
    expect(hf).not.toMatch(/onPress=\{\(\) => onPick\(/);
  });
});

describe("F55 · the storage screen advertises nothing that was cut from 1.0", () => {
  const storage = source("screens/Settings/Storage.tsx");
  it("the greyed Export all and Transfer rows are gone", () => {
    expect(storage).not.toContain("storage.exportAll");
    expect(storage).not.toContain("storage.transfer");
  });
  it("their strings left the locales too, rather than sitting there unread", () => {
    expect(en["storage.exportAll"]).toBeUndefined();
    expect(en["storage.transfer"]).toBeUndefined();
    expect(en["storage.pro"]).toBeUndefined();
  });
  it("the delete actions, which do work, are still there", () => {
    expect(storage).toContain("storage.deleteChats");
    expect(storage).toContain("storage.deleteEverything");
  });
});
