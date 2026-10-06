/* Handwriting, chalk and dense pages need 1024 image tokens (rounds 127, 131); the extra tokens cost Instant about 25 MB on a phone (round 132). */
export const PHONE_IMAGE_MAX_TOKENS: Readonly<Record<string, number>> = { instant: 1024, fast: 1024, sharp: 1024 };
const DEFAULT_IMAGE_MAX_TOKENS = 512;
/* Phones under 6 GB load 2048 tokens of context: a 1024-token picture and the answer ceiling would leave nothing for the question. */
const CONTEXT_PER_IMAGE_TOKEN = 4;
/** wllama's `image_max_tokens` for every browser vision pack. */
export const BROWSER_IMAGE_MAX_TOKENS = 512;

/** llama.rn's `image_max_tokens` for the chat model the projector attaches to, within a quarter of the loaded context. */
export const phoneImageMaxTokens = (modelId: string | undefined, nCtx: number): number =>
  Math.min((modelId ? PHONE_IMAGE_MAX_TOKENS[modelId] : undefined) ?? DEFAULT_IMAGE_MAX_TOKENS, Math.floor(nCtx / CONTEXT_PER_IMAGE_TOKEN));

/** What one photo may cost the prompt on this engine: the cap the engine's projector is loaded with. */
export const imageMaxTokens = (engineId: string, modelId: string, nCtx: number): number => (engineId === "wllama" ? BROWSER_IMAGE_MAX_TOKENS : phoneImageMaxTokens(modelId, nCtx));
