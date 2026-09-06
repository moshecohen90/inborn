import type { Persona, PersonaIcon, PersonaInput } from "./types";

export const PERSONA_ICONS: readonly PersonaIcon[] = ["spark", "pen", "book", "globe", "code", "scale", "heart", "briefcase", "flask", "compass"];

/** Free tier: three custom personas (§7.6); Pro removes the cap. */
export const FREE_CUSTOM_PERSONA_LIMIT = 3;
export const PERSONA_NAME_MAX = 40;
export const PERSONA_PROMPT_MAX = 4000;
export const DISCLAIMER_MAX = 200;

export const SAFETY_BASELINE =
  "You run entirely on the user's device. Be accurate; say when you are not sure. Do not produce hateful, sexual, or dangerous content. Answer in the language the user writes in unless asked otherwise.";

const builtIn = (id: string, name: string, icon: PersonaIcon, systemPrompt: string): Persona => ({
  id: `builtin:${id}`,
  name,
  icon,
  systemPrompt,
  builtIn: true,
  createdAt: 0,
  updatedAt: 0,
});

/** The four personas the new-chat sheet offers (§8.3 S21). Names are display strings the UI translates by id. */
export const BUILT_IN_PERSONAS: readonly Persona[] = [
  builtIn("assistant", "Assistant", "spark", "You are a helpful, concise assistant."),
  builtIn("writer", "Writer", "pen", "You are a skilled writer and editor. Improve clarity, rhythm and tone; keep the author's voice. When asked to draft, produce polished, ready-to-send text."),
  builtIn("tutor", "Tutor", "book", "You are a patient tutor. Explain step by step, check understanding with a short question, and adapt to the learner's level. Prefer examples over jargon."),
  builtIn("translator", "Translator", "globe", "You are a professional translator. Translate faithfully, keep formatting and tone, and add a one-line note only when a phrase has no direct equivalent. Do not answer the text; translate it."),
];

export const DEFAULT_PERSONA_ID = BUILT_IN_PERSONAS[0]!.id;

export const isBuiltInPersonaId = (id: string): boolean => id.startsWith("builtin:");

export function findPersona(id: string | undefined, custom: readonly Persona[]): Persona | undefined {
  if (!id) return undefined;
  return BUILT_IN_PERSONAS.find((p) => p.id === id) ?? custom.find((p) => p.id === id);
}

export type PersonaError = "name.empty" | "name.long" | "prompt.long" | "icon.unknown" | "temperature.range" | "disclaimer.long";

export function validatePersona(input: Partial<PersonaInput>): PersonaError[] {
  const errors: PersonaError[] = [];
  const name = (input.name ?? "").trim();
  if (!name) errors.push("name.empty");
  else if (name.length > PERSONA_NAME_MAX) errors.push("name.long");
  if ((input.systemPrompt ?? "").length > PERSONA_PROMPT_MAX) errors.push("prompt.long");
  if (!input.icon || !PERSONA_ICONS.includes(input.icon)) errors.push("icon.unknown");
  if (input.temperature !== undefined && !(input.temperature >= 0 && input.temperature <= 2)) errors.push("temperature.range");
  if ((input.disclaimer ?? "").length > DISCLAIMER_MAX) errors.push("disclaimer.long");
  return errors;
}

export interface Entitlements {
  pro: boolean;
}

/** Whether one more custom persona may be created (`existing` = custom personas already stored). */
export function canCreatePersona(existing: number, entitlements: Entitlements): boolean {
  return entitlements.pro || existing < FREE_CUSTOM_PERSONA_LIMIT;
}

/** Features the free tier sees but cannot use; the paywall stream reads these flags. */
export const GATED = { folders: true, memory: true, exportAll: true, unlimitedPersonas: true, sideBySide: true } as const;
export type GatedFeature = keyof typeof GATED;
export const isGated = (feature: GatedFeature, entitlements: Entitlements): boolean => GATED[feature] && !entitlements.pro;
