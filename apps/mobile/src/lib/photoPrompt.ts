import type { Message } from "@inborn/core";

/**
 * Puts the photos of this turn back on the prompt's last user message.
 *
 * `buildRagPrompt` rewrites the turn into its own text-only messages (fenced passages + the question), so a photo sent
 * with a question about an attached document was dropped before the engine saw it — and the vision gate, which reads
 * the prompt, never fired to say so: the model simply answered as if no picture had been sent (QA F136).
 */
export function withPhotos(messages: readonly Message[], photos: readonly string[] | undefined): Message[] {
  if (!photos?.length) return [...messages];
  const at = messages.map((m) => m.role).lastIndexOf("user");
  if (at < 0) return [...messages];
  return messages.map((m, i) => (i === at ? { ...m, images: [...photos] } : { ...m }));
}
