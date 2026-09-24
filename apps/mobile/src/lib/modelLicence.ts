import notice from "../../../../docs/legal/NOTICE.json";

export interface LicenceSubject {
  /** What the licence covers, for the sheet title. */
  name: string;
  /** SPDX id or the licence's own name, as `NOTICE.json` and the catalogue spell it. */
  license: string;
  /** The component's copyright line; MIT needs it, Apache-2.0 ignores it. */
  attribution?: string;
  licenseUrl?: string;
}

interface NoticeComponent {
  id: string;
  group: string;
  name: string;
  license: string;
  attribution?: string;
  licenseUrl?: string;
}

const COMPONENTS = (notice as { components: NoticeComponent[] }).components;

/**
 * F54 · which `NOTICE.json` entry backs each catalogue model. Spelled out rather than matched on the family
 * string, because "whisper.cpp base" and "Whisper base" are the same model and no rule connects them; a test
 * fails when the manifest gains a model this map does not name.
 */
const NOTICE_ID: Readonly<Record<string, string>> = {
  instant: "qwen3.5-0.8b",
  fast: "qwen3.5-2b",
  sharp: "qwen3.5-4b",
  "sharp-phi": "phi-4-mini-instruct",
  "embed-e5": "multilingual-e5-large-instruct",
  "speech-whisper-base": "whisper-base",
  "vision-qwen35": "qwen3.5-mmproj",
};

/** Every catalogue model has an entry; `catalogue-licence` in the mobile tests fails when one does not. */
export const NOTICE_IDS = NOTICE_ID;

/** The full-text sheet's subject for one model. An imported file has no NOTICE entry, so it carries its own licence tag alone. */
export function licenceSubjectFor(model: { id: string; name: string; license: string }): LicenceSubject {
  const c = COMPONENTS.find((x) => x.id === NOTICE_ID[model.id]);
  return {
    name: model.name,
    license: model.license,
    ...(c?.attribution ? { attribution: c.attribution } : {}),
    ...(c?.licenseUrl ? { licenseUrl: c.licenseUrl } : {}),
  };
}
