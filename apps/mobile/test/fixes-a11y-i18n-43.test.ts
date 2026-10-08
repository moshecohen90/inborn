import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { PERSONA_ICONS } from "@inborn/core";
import { LAUNCH_LOCALES } from "@inborn/i18n";
import { permissionRows } from "../src/proof/permissions";

const SRC = join(__dirname, "../src");
const LOCALES = join(__dirname, "../../../packages/i18n/locales");
const locale = (l: string): Record<string, string> => JSON.parse(readFileSync(join(LOCALES, `${l}.json`), "utf8"));
const en = locale("en");

function* sources(dir: string): Generator<string> {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) yield* sources(p);
    else if (/\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f)) yield p;
  }
}

/** The attribute's value: a quoted string, or the `{…}` expression up to its matching brace. */
function valueAt(src: string, at: number): string {
  if (src[at] === '"' || src[at] === "'") return src.slice(at, src.indexOf(src[at]!, at + 1) + 1);
  if (src[at] !== "{") return "";
  let depth = 0;
  for (let i = at; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(at, i + 1);
  }
  return src.slice(at);
}

/** Words a screen reader would read out that no translation reaches: string literals left after removing t("…") calls and template placeholders. */
function literalWords(expr: string): string[] {
  const stripped = expr.replace(/typeof\s+[\w.]+\s*[!=]==?\s*(["'])\w+\1/g, "").replace(/\bt\(\s*(["'`])[^"'`]*\1[^)]*\)/g, "").replace(/\$\{[^}]*\}/g, "");
  return [...stripped.matchAll(/(["'`])((?:(?!\1).)*)\1/g)].map((m) => m[2]!).filter((s) => /[A-Za-z]{2,}/.test(s));
}

/** Literal brand names a screen reader may read as they are. */
const BRAND = new Set(["Inborn"]);

function a11yLiterals(): string[] {
  const found: string[] = [];
  for (const file of sources(SRC)) {
    const src = readFileSync(file, "utf8");
    const rel = relative(SRC, file);
    for (const m of src.matchAll(/\baccessibility(?:Label|Hint)(=|:\s*)/g)) {
      const value = valueAt(src, m.index! + m[0].length);
      const expr = m[1] === "=" ? value : src.slice(m.index! + m[0].length).split(/,\s*\n|\n/)[0]!;
      for (const w of literalWords(expr)) if (!BRAND.has(w)) found.push(`${rel}: ${w}`);
    }
    /* `label` props on our own components end up as accessibilityLabel (Seal, Toggle, ChromeButton). */
    for (const m of src.matchAll(/<[A-Z]\w*[^>]*?\slabel="([^"]*)"/g)) if (/[A-Za-z]{2,}/.test(m[1]!) && !BRAND.has(m[1]!)) found.push(`${rel}: label="${m[1]}"`);
  }
  return found;
}

describe("F467 · every accessibility label is translated", () => {
  it("no literal English is handed to accessibilityLabel / accessibilityHint or a label prop", () => {
    expect(a11yLiterals()).toEqual([]);
  });

  it("the scanner catches the shapes F467 shipped", () => {
    expect(literalWords('"Close"')).toEqual(["Close"]);
    expect(literalWords('{typeof back === "string" ? back : "Back"}')).toEqual(["Back"]);
    expect(literalWords('{t("a11y.close")}')).toEqual([]);
    expect(literalWords('{`${t("chats.more")}: ${item.title || t("newChat.title")}`}')).toEqual([]);
  });

  it("Back and Close are translated in every launch locale", () => {
    for (const l of LAUNCH_LOCALES) {
      const d = locale(l);
      for (const k of ["a11y.back", "a11y.close"]) {
        expect(d[k], `${l}:${k}`).toBeTruthy();
        if (l !== "en") expect(d[k], `${l}:${k}`).not.toBe(en[k]);
      }
    }
  });

  it("each persona icon has a spoken name in every launch locale", () => {
    for (const l of LAUNCH_LOCALES) for (const icon of PERSONA_ICONS) expect(locale(l)[`personas.icon.${icon}`], `${l}:${icon}`).toBeTruthy();
    expect(readFileSync(join(SRC, "screens/chat/PersonasSheet.tsx"), "utf8")).toContain("accessibilityLabel={t(`personas.icon.${icon}`)}");
  });
});

describe("Proof says 'not in the manifest' only where a manifest leaves the permission out", () => {
  const MANIFEST = /manifi?est|マニフェスト|매니페스트/i;

  it("only Android's release build gets the manifest line; iOS and the browser get their own", () => {
    expect(permissionRows("android", false).find((r) => r.key === "internet")?.state).toBe("none");
    expect(permissionRows("android", true).find((r) => r.key === "internet")?.state).toBe("granted");
    expect(permissionRows("ios", false).find((r) => r.key === "network")?.state).toBe("ios");
    expect(permissionRows("web", false).find((r) => r.key === "network")?.state).toBe("web");
    for (const os of ["ios", "web"]) expect(permissionRows(os, false).map((r) => r.state)).not.toContain("none");
  });

  it("no locale mentions a manifest on the iOS or browser line, and every one still does on Android's", () => {
    for (const l of LAUNCH_LOCALES) {
      const d = locale(l);
      expect(d["proof.permissionState.none"], l).toMatch(MANIFEST);
      for (const k of ["proof.permissionState.ios", "proof.permissionState.web"]) {
        expect(d[k], `${l}:${k}`).toBeTruthy();
        expect(d[k], `${l}:${k}`).not.toMatch(MANIFEST);
      }
    }
  });

  it("the iOS line names Instant and its photo pack, which the app config bundles into the IPA", () => {
    const config = readFileSync(join(__dirname, "../app.config.ts"), "utf8");
    expect(config).toMatch(/BUNDLED_IOS_MODELS = \{ instant: "[^"]+", "vision-qwen35": "[^"]+" \}/);
    const PACK: Record<string, string> = { en: "photo pack", de: "Foto-Paket", fr: "pack photo", es: "paquete de fotos", "pt-BR": "pacote de fotos", ja: "写真パック", ko: "사진 팩", "zh-Hant": "照片套件" };
    for (const l of LAUNCH_LOCALES) {
      const line = locale(l)["proof.delivery.builtin"]!;
      expect(line, l).toContain("Instant");
      expect(line, l).toContain(PACK[l]);
    }
  });

  it("a later download does not hide the bundled line on iOS", () => {
    const proof = readFileSync(join(SRC, "screens/Proof/Proof.tsx"), "utf8");
    expect(proof).toContain('{Platform.OS === "ios" || !downloaded ? <Line text={Platform.OS === "android" ? t("proof.delivery.builtinPlay") : t("proof.delivery.builtin")}');
    expect(proof).toContain('const downloaded = delivery?.status === "done" && delivery.source !== "bundled";');
  });
});
