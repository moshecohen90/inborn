import { IntlMessageFormat } from "intl-messageformat";
import en from "../locales/en.json";
import ja from "../locales/ja.json";
import de from "../locales/de.json";
import fr from "../locales/fr.json";
import es from "../locales/es.json";
import ptBR from "../locales/pt-BR.json";
import ko from "../locales/ko.json";
import zhHant from "../locales/zh-Hant.json";
/* Hebrew is a language users ask in, not a UI locale: registered as one, a Hebrew device would get an RTL app in English. */
import he from "../answers/he.json";

type OfflineKey = `offline.answer.${"weather" | "news" | "scores" | "prices"}`;
type AnswerKey = "identity.answer.identity" | "identity.answer.capabilities" | "identity.answer.model" | OfflineKey;
type NoMatchKey = "documents.notFound" | "documents.opener.nothingRelevant" | "documents.opener.nothingFits";
const TABLES: Record<string, Record<AnswerKey, string> & Partial<Record<NoMatchKey, string>>> = { en, ja, de, fr, es, "pt-BR": ptBR, ko, "zh-Hant": zhHant, he };

const formatter = (lang: string) => {
  const base = lang.split("-")[0];
  const table = TABLES[lang] ?? TABLES[Object.keys(TABLES).find((k) => k.split("-")[0] === base) ?? "en"]!;
  return (key: AnswerKey | NoMatchKey, values: Record<string, string>) => String(new IntlMessageFormat(table[key]!, lang).format(values));
};

/**
 * Round 134N: the app's own answer to a question about the assistant, in the language the question was asked in
 * (`selfQuestionMatch` in @inborn/core). `model` is the catalog name of the model in use; without one the line is left out.
 */
export function selfAnswer(kind: "identity" | "capabilities", lang: string, { device, model }: { device: string; model?: string }): string {
  const format = formatter(lang);
  const body = format(`identity.answer.${kind}`, { device });
  return kind === "identity" && model ? `${body} ${format("identity.answer.model", { model })}` : body;
}

/** Round 134O: the app's answer to a question only live data answers (`liveDataQuestionMatch` in @inborn/core), in the asker's language. */
export function offlineAnswer(kind: "weather" | "news" | "scores" | "prices", lang: string, { device }: { device: string }): string {
  return formatter(lang)(`offline.answer.${kind}`, { device });
}

const DECLINE_KEYS: readonly (OfflineKey | NoMatchKey)[] = ["offline.answer.weather", "offline.answer.news", "offline.answer.scores", "offline.answer.prices", "documents.notFound", "documents.opener.nothingRelevant", "documents.opener.nothingFits"];
const DEVICES = ["phone", "tablet", "computer", "browser"] as const;

let declines: Set<string> | null = null;

/**
 * Whether an assistant row is the app's own "out of reach" card (`offlineAnswer`) or "nothing in your documents" line,
 * in any language and on any device. Replayed as the model's turns, three cards made Fast decline sleep tips in the
 * cards' shape (F464), and the UI-language line pulled the next answer into the UI language (F469).
 */
export function isAppDecline(content: string): boolean {
  if (!declines) {
    declines = new Set();
    for (const lang of Object.keys(TABLES)) {
      const format = formatter(lang);
      for (const key of DECLINE_KEYS) {
        const raw = TABLES[lang]![key];
        if (!raw) continue;
        declines.add(raw);
        for (const device of DEVICES) declines.add(format(key, { device }));
      }
    }
  }
  return declines.has(content);
}

/**
 * The no-match openers in the language a question was asked in (`detectLanguage` in @inborn/core), or null when that
 * language is unknown or has no table: the chat then quotes no opener at all rather than one in the UI language (F469).
 */
export function questionOpeners(lang: string | null): { nothingRelevant: string; nothingFits: string } | null {
  if (!lang || lang === "zh-Hans" || lang === "zh") return null;
  const base = lang.split("-")[0];
  const key = lang in TABLES ? lang : Object.keys(TABLES).find((k) => k.split("-")[0] === base);
  const table = key ? TABLES[key] : undefined;
  const nothingRelevant = table?.["documents.opener.nothingRelevant"];
  const nothingFits = table?.["documents.opener.nothingFits"];
  return nothingRelevant && nothingFits ? { nothingRelevant, nothingFits } : null;
}
