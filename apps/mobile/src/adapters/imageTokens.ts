/* Handwriting and chalk need 1024 image tokens to be read on Fast; Instant keeps 512 so its photo prefill stays short. */
export const PHONE_IMAGE_MAX_TOKENS: Readonly<Record<string, number>> = { instant: 512, fast: 1024, sharp: 1024 };
const DEFAULT_IMAGE_MAX_TOKENS = 512;

/** llama.rn's `image_max_tokens` for the chat model the projector attaches to. */
export const phoneImageMaxTokens = (modelId: string | undefined): number => (modelId ? PHONE_IMAGE_MAX_TOKENS[modelId] : undefined) ?? DEFAULT_IMAGE_MAX_TOKENS;
