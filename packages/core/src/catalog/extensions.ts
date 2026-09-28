import registryJson from "./extensions.json";

/**
 * Extensions (Moshe, 26.9.2026): the first visit needs only the text model; anything else a feature needs (the
 * document index, the photo projector, later audio or OCR) is fetched the moment the user reaches for it. Every
 * surface that offers one (the hold card, the vault's Extensions section, the downloader, the web catalog) reads this
 * registry, so a new extension is one entry here plus one `extensions.<id>.*` locale block.
 */
export type ExtensionKind = "vision" | "index" | "audio" | "ocr";
export type ExtensionPlatform = "ios" | "android" | "web" | "desktop";
/** What still works without the extension: `words` = exact-word search over attached files; null = nothing, the turn waits. */
export type ExtensionFallback = "words" | null;
/** Features an extension serves, independent of any attachment (Documents → Ask needs the index with no file in the composer). */
export type ExtensionFeature = "documents-ask" | "chat-documents" | "chat-photos" | (string & {});

export interface ExtensionAppliesTo {
  /** Composer attachment kinds that need it. */
  attachments?: ("photo" | "document")[];
  /** MIME patterns (`image/*` or exact). */
  mime?: string[];
  /** Lower-case file extensions with the dot. */
  ext?: string[];
  features?: ExtensionFeature[];
  /** Absent = any. A projector is built for one model's embedding width and fits no other. */
  models?: string[];
}

export interface Extension {
  /** The catalog id when the file is also a catalog model (the vault installs it by that id on the phones). */
  id: string;
  kind: ExtensionKind;
  file: string;
  bytes: number;
  sha256: string;
  /** Path under the catalog's base URL (models.inbornapp.com/v1/<path>). */
  path: string;
  appliesTo: ExtensionAppliesTo;
  /** Platforms whose app package already carries it: nothing to download, nothing to remove there. */
  bundledOn: ExtensionPlatform[];
  fallback: ExtensionFallback;
}

export interface AttachmentInfo {
  kind: "photo" | "document";
  mime?: string;
  name?: string;
}

const builtIn: readonly Extension[] = (registryJson as { extensions: Extension[] }).extensions;
let registered: Extension[] = [];

/** Every extension, built-in first; the order is the order of the vault's Extensions section. */
export const extensions = (): readonly Extension[] => [...builtIn, ...registered];

export const findExtension = (id: string): Extension | undefined => extensions().find((e) => e.id === id);

/** Adds an extension at run time (tests, a dev build); returns the undo. The shipped ones live in extensions.json. */
export function registerExtension(ext: Extension): () => void {
  registered = [...registered.filter((e) => e.id !== ext.id), ext];
  return () => {
    registered = registered.filter((e) => e !== ext);
  };
}

const mimeMatches = (pattern: string, mime: string): boolean => (pattern.endsWith("/*") ? mime.startsWith(pattern.slice(0, -1)) : pattern === mime);

/** True when this attachment cannot be understood without the extension. */
export function extensionAppliesTo(ext: Extension, a: AttachmentInfo): boolean {
  const { attachments, mime, ext: exts } = ext.appliesTo;
  if (attachments?.includes(a.kind)) return true;
  const type = a.mime?.toLowerCase();
  if (type && mime?.some((p) => mimeMatches(p, type))) return true;
  const name = a.name?.toLowerCase() ?? "";
  const dot = name.lastIndexOf(".");
  return dot >= 0 && !!exts?.includes(name.slice(dot));
}

export const extensionServesModel = (ext: Extension, modelId: string): boolean => !ext.appliesTo.models || ext.appliesTo.models.includes(modelId);

/** The extensions one attachment needs, in registry order; with a model, only those that model can use. */
export const extensionsForAttachment = (a: AttachmentInfo, modelId?: string): Extension[] =>
  extensions().filter((e) => extensionAppliesTo(e, a) && (modelId === undefined || extensionServesModel(e, modelId)));

export const visionPackFor = (modelId: string): Extension | undefined => extensions().find((e) => e.kind === "vision" && !!e.appliesTo.models?.includes(modelId));

export const extensionsForFeature = (feature: ExtensionFeature): Extension[] => extensions().filter((e) => e.appliesTo.features?.includes(feature));

export const extensionOfKind = (kind: ExtensionKind): Extension | undefined => extensions().find((e) => e.kind === kind);

export const extensionBundledOn = (ext: Extension, platform: ExtensionPlatform): boolean => ext.bundledOn.includes(platform);

/** Download URL on the catalog host: the deployed web build and the phones' https delivery both resolve here. */
export const extensionUrl = (ext: Extension, baseUrl: string): string => `${baseUrl.replace(/\/$/, "")}/${ext.path}`;
