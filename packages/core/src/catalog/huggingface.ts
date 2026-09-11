import { HF_HOST } from "../proof/allowlist";
import { ENGINE_VERSION, type CatalogModel } from "./types";

/** In-app Hugging Face search (spec §7.2, iOS + desktop): URLs, response parsing and the catalog shape of a picked file. Pure. */
export const HF_API_BASE = `https://${HF_HOST}`;
export const HF_MODEL_PREFIX = "hf:";
export const HF_SEARCH_LIMIT = 20;

export const isHfModelId = (id: string): boolean => id.startsWith(HF_MODEL_PREFIX);

export function hfSearchUrl(query: string, limit = HF_SEARCH_LIMIT): string {
  const q = new URLSearchParams({ search: query.trim(), filter: "gguf", sort: "downloads", direction: "-1", limit: String(limit) });
  return `${HF_API_BASE}/api/models?${q.toString()}&expand[]=gated&expand[]=downloads&expand[]=likes&expand[]=lastModified`;
}

export const hfRepoInfoUrl = (repo: string): string => `${HF_API_BASE}/api/models/${encodeRepo(repo)}?blobs=true`;

export const hfResolveUrl = (repo: string, path: string, revision = "main"): string => `${HF_API_BASE}/${encodeRepo(repo)}/resolve/${encodeURIComponent(revision)}/${path.split("/").map(encodeURIComponent).join("/")}`;

const encodeRepo = (repo: string): string => repo.split("/").map(encodeURIComponent).join("/");

export interface HfRepo {
  id: string;
  downloads: number;
  likes: number;
  /** Needs a token + licence acceptance on huggingface.co (S30 edge case). */
  gated: boolean;
  updatedAt: string | null;
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const numberOf = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const gatedOf = (v: unknown): boolean => v === true || v === "auto" || v === "manual";

/** `GET /api/models?search=…&filter=gguf` → repos, unknown shapes skipped. */
export function parseHfSearch(json: unknown): HfRepo[] {
  if (!Array.isArray(json)) return [];
  const out: HfRepo[] = [];
  for (const item of json) {
    if (!isRecord(item) || typeof item.id !== "string" || item.private === true) continue;
    out.push({ id: item.id, downloads: numberOf(item.downloads), likes: numberOf(item.likes), gated: gatedOf(item.gated), updatedAt: typeof item.lastModified === "string" ? item.lastModified : null });
  }
  return out;
}

export interface HfFile {
  path: string;
  bytes: number;
  /** The LFS object id is the file's SHA-256; a GGUF without one cannot be verified and is not offered. */
  sha256: string;
  quant: string | null;
  params: string | null;
}

export interface HfRepoInfo {
  id: string;
  gated: boolean;
  license: string | null;
  arch: string | null;
  contextLength: number | null;
  files: HfFile[];
}

const SHARD = /-\d{5}-of-\d{5}\.gguf$/i;
const QUANT = /(?:^|[-_.])((?:IQ|Q)\d(?:_[A-Z0-9]+)*|F16|F32|BF16|MXFP4|UD-[A-Z0-9_]+)(?=[-_.]|$)/i;
const PARAMS = /(?:^|[-_.])(\d+(?:\.\d+)?B(?:-A\d+(?:\.\d+)?B)?)(?=[-_.]|$)/i;

export const quantOf = (fileName: string): string | null => QUANT.exec(fileName.replace(/\.gguf$/i, ""))?.[1]?.toUpperCase() ?? null;
export const paramsOf = (name: string): string | null => PARAMS.exec(name)?.[1]?.toUpperCase() ?? null;

/**
 * `GET /api/models/<repo>?blobs=true` → the downloadable GGUF files. Vision projectors (`mmproj-*`) and split shards are
 * left out: the vault installs one file per model from Hugging Face; the projector companion comes from the catalog.
 */
export function parseHfRepoInfo(json: unknown): HfRepoInfo | null {
  if (!isRecord(json) || typeof json.id !== "string") return null;
  const gguf = isRecord(json.gguf) ? json.gguf : {};
  const card = isRecord(json.cardData) ? json.cardData : {};
  const files: HfFile[] = [];
  for (const s of Array.isArray(json.siblings) ? json.siblings : []) {
    if (!isRecord(s) || typeof s.rfilename !== "string") continue;
    const path = s.rfilename;
    const base = path.split("/").pop() ?? path;
    if (!/\.gguf$/i.test(base) || /^mmproj/i.test(base) || SHARD.test(base)) continue;
    const lfs = isRecord(s.lfs) ? s.lfs : null;
    const sha256 = typeof lfs?.sha256 === "string" ? lfs.sha256 : typeof lfs?.oid === "string" ? lfs.oid : null;
    const bytes = numberOf(lfs?.size ?? s.size);
    if (!sha256 || !/^[0-9a-f]{64}$/i.test(sha256) || bytes <= 0) continue;
    files.push({ path, bytes, sha256: sha256.toLowerCase(), quant: quantOf(base), params: paramsOf(base) ?? paramsOf(json.id) });
  }
  files.sort((a, b) => a.bytes - b.bytes);
  return {
    id: json.id,
    gated: gatedOf(json.gated),
    license: typeof card.license === "string" ? card.license : null,
    arch: typeof gguf.architecture === "string" ? gguf.architecture : null,
    contextLength: typeof gguf.context_length === "number" ? gguf.context_length : null,
    files,
  };
}

const GB = 1024 ** 3;

/** RAM floor and comfort for a file of this size: weights plus ~1 GB of context and app, then head-room (§6.3 fit tags). */
export function ramNeedGB(bytes: number): { min: number; recommended: number } {
  const min = Math.max(2, Math.ceil(bytes / GB + 1));
  return { min, recommended: min + 2 };
}

export const hfModelId = (repo: string, path: string): string => `${HF_MODEL_PREFIX}${repo}/${path}`;

/** The on-disk name: repo and path flattened so two repos' "model-Q4_K_M.gguf" never collide in the vault folder. */
export const hfVaultFileName = (repo: string, path: string): string => `${[...repo.split("/"), ...path.split("/")].join("--")}`.replace(/[^a-zA-Z0-9._-]+/g, "_");

/** Plain name for the cartridge: the file without extension and quant tag, e.g. "Qwen3-0.6B". */
export function hfDisplayName(path: string): string {
  const base = (path.split("/").pop() ?? path).replace(/\.gguf$/i, "");
  const quant = quantOf(base);
  const trimmed = quant ? base.replace(new RegExp(`[-_.]${quant.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"), "") : base;
  return trimmed || base;
}

/** A picked file as a catalog model, so the vault installs, hashes and lists it like any other (§5.4 "one manifest shape"). */
export function hfFileAsModel(info: HfRepoInfo, file: HfFile): CatalogModel {
  return {
    id: hfModelId(info.id, file.path),
    role: "chat",
    name: hfDisplayName(file.path),
    vendor: "Hugging Face",
    family: info.id,
    params: file.params ?? "",
    quant: file.quant ?? "",
    arch: info.arch ?? "?",
    file: hfVaultFileName(info.id, file.path),
    bytes: file.bytes,
    sha256: file.sha256,
    license: info.license ?? "unknown",
    minRamGB: ramNeedGB(file.bytes).min,
    recommendedRamGB: ramNeedGB(file.bytes).recommended,
    contextLength: info.contextLength ?? 0,
    vision: false,
    tools: false,
    goodFor: "",
    battery: file.bytes > 3 * GB ? "high" : file.bytes > 1 * GB ? "medium" : "low",
    goodLanguages: [],
    delivery: [{ kind: "hf", repo: info.id, revision: "main", path: file.path }],
    proOnly: false,
    minEngine: ENGINE_VERSION,
  };
}

/** Roughly how a request looks on the wire: method, path, host and the few headers we send. Counted as OUT bytes (S50 honesty). */
export function requestBytes(url: string, method = "GET"): number {
  const u = new URL(url);
  return method.length + u.pathname.length + u.search.length + u.host.length + 160;
}
