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

type AnswerKey = "identity.answer.identity" | "identity.answer.capabilities" | "identity.answer.model";
const TABLES: Record<string, Record<AnswerKey, string>> = { en, ja, de, fr, es, "pt-BR": ptBR, ko, "zh-Hant": zhHant, he };

/**
 * Round 134N: the app's own answer to a question about the assistant, in the language the question was asked in
 * (`selfQuestionMatch` in @inborn/core). `model` is the catalog name of the model in use; without one the line is left out.
 */
export function selfAnswer(kind: "identity" | "capabilities", lang: string, { device, model }: { device: string; model?: string }): string {
  const base = lang.split("-")[0];
  const table = TABLES[lang] ?? TABLES[Object.keys(TABLES).find((k) => k.split("-")[0] === base) ?? "en"]!;
  const format = (key: AnswerKey, values: Record<string, string>) => String(new IntlMessageFormat(table[key], lang).format(values));
  const body = format(`identity.answer.${kind}`, { device });
  return kind === "identity" && model ? `${body} ${format("identity.answer.model", { model })}` : body;
}
