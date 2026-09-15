/** Signed model catalog (spec §5.4, §6). One manifest describes every delivery path; verification is local. */
export type Tier = "instant" | "fast" | "sharp" | "power" | "studio";
export type ModelRole = "chat" | "embedding" | "speech" | "vision";
export type Battery = "low" | "medium" | "high" | "highest";
export type License = "Apache-2.0" | "MIT";
/** Catalog entries carry one of `License`; imports and Hugging Face files carry whatever the repo declares. */
export type LicenseTag = License | (string & {});

export type Delivery =
  /** Inside the app bundle (iOS Instant). */
  | { kind: "bundled"; file: string }
  /** Play Asset Delivery: Play downloads, the app never opens a socket (§5.1). */
  | { kind: "play-asset-pack"; pack: string; mode: "fast-follow" | "on-demand"; file: string }
  | { kind: "apple-asset-pack"; pack: string }
  /** Resolved against `CatalogManifest.baseUrl`; the only network path outside the stores. */
  | { kind: "https"; path: string; mirror?: string }
  /** A file the user picked in the in-app Hugging Face search (§7.2, iOS + desktop): `huggingface.co/<repo>/resolve/<revision>/<path>`. */
  | { kind: "hf"; repo: string; revision: string; path: string };

/** One shard of a split GGUF (llama.cpp `-0000N-of-0000M.gguf` naming); Play packs cap at 1.5 GB (§5.1). */
export interface ModelPart {
  file: string;
  bytes: number;
  sha256: string;
}

/** What a user decided to do (§6.1 fit map, §7.8 recommendation by use + language). */
export type UseCase = "chat" | "writing" | "summarize" | "translate" | "code" | "documents" | "voice" | "math";
export const USE_CASES: readonly UseCase[] = ["chat", "writing", "summarize", "translate", "code", "documents", "voice", "math"];
export type UseTier = "best" | "good" | "weak";
export const USE_TIERS: readonly UseTier[] = ["best", "good", "weak"];
export type LanguageTier = "native" | "good" | "basic" | "none";
export const LANGUAGE_TIERS: readonly LanguageTier[] = ["native", "good", "basic", "none"];
/** Every chat model rates at least these ISO 639-1 codes; more may be listed. */
export const FIT_LANGUAGES: readonly string[] = ["en", "he", "ar", "ru", "es", "fr", "de", "pt", "ja", "ko", "zh"];

/** Honest per-model map (sources in docs/models/model-fit.md); the chat and the vault recommend from it, never from tier alone. */
export interface ModelFit {
  uses: Record<UseCase, UseTier>;
  languages: Record<string, LanguageTier>;
  /** One plain line the cartridge shows as "Weak at". */
  weakAt: string;
}

export interface CatalogModel {
  id: string;
  role: ModelRole;
  /** Chat models carry a tier; companions (embeddings, speech) do not. */
  tier?: Tier;
  /** Plain-language name shown on the cartridge (§6.1), e.g. "Fast". */
  name: string;
  vendor: string;
  family: string;
  /** Human size label from the GGUF, e.g. "0.8B"; never shown on the cartridge, only in Details (S31). */
  params: string;
  quant: string;
  /** GGUF `general.architecture`; an import is rejected when the engine does not know it (§10.1 #9). */
  arch: string;
  /** The file the engine opens: the whole model, or the first shard when `parts` is set. */
  file: string;
  /** Total bytes across all parts. */
  bytes: number;
  sha256: string;
  /** Every shard (first one included) when the model ships split; absent for single files. */
  parts?: ModelPart[];
  license: LicenseTag;
  /** Below this the model is "Will not run"; between min and recommended it "runs slowly" (§10.2 #11). */
  minRamGB: number;
  recommendedRamGB: number;
  contextLength: number;
  vision: boolean;
  tools: boolean;
  /** Plain-language "what it is good for" shown on the cartridge (§6.1). */
  goodFor: string;
  battery: Battery;
  /** Codes rated native or good in `fit.languages`; kept as a flat list for the Details row and older readers. */
  goodLanguages: string[];
  /** Chat models carry one; companions and imports do not. */
  fit?: ModelFit;
  delivery: Delivery[];
  proOnly: boolean;
  /** Catalog engine ABI the app must have to run this file ("Update the app to run this"). */
  minEngine: number;
}

export interface CatalogManifest {
  schema: 1;
  version: number;
  publishedAt: string;
  /** HTTPS base for `https` deliveries; must be on the compiled-in host allowlist. */
  baseUrl: string;
  models: CatalogModel[];
  /** Ed25519 signature (hex) over the canonical JSON of everything above. */
  signature: string;
}

/** What the running app can execute; a manifest entry above it is shown greyed with "Update the app". */
export const ENGINE_VERSION = 1;
