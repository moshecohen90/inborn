/** Phones find their GGUF synchronously (devModel.native.ts); only the web has to ask its host first (prepare.web.ts). */
export const prepareEngine = (): Promise<void> => Promise.resolve();
