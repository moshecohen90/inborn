import { Platform } from "react-native";
import { File } from "expo-file-system";
import {
  BUNDLED_MANIFEST,
  ENGINE_VERSION,
  NOT_INSTALLED,
  assessGguf,
  isInstalled,
  loadManifest,
  modelParts,
  pickDefault,
  requiredFreeBytes,
  transition,
  type CatalogManifest,
  type CatalogModel,
  type DeliverySource,
  type GgufError,
  type InstallEvent,
  type InstallState,
} from "@inborn/core";
import type { DeliveryPlan, ModelDelivery } from "./delivery";
import { DEV_MODELS_BASE_URL, devBuild } from "./devFlags";
import { freeDiskBytes, readDevice, type DeviceInfo } from "./device";
import { fileGgufHeader, fileSha256 } from "./hash";
import { DEV_MODEL_HOSTS, HttpsDelivery, PausedError } from "./httpsDelivery";
import { devFallbackFile, fileSize, modelFile, safeDelete, vaultDir } from "./paths";
import { PlayDelivery } from "./playDelivery";
import { readRecord, writeRecord, type ImportedModel, type VaultRecord } from "./record";

export type VaultEntry = { model: CatalogModel; state: InstallState; plan: DeliveryPlan | null; imported?: ImportedModel };
export type ManifestStatus = { ok: true } | { ok: false; problem: string };

/**
 * Everything the vault screens and the engine need about models on this device (spec §5.4, §8.4).
 * One instance per app run; screens subscribe, the engine asks for the default installed model.
 */
export class VaultStore {
  readonly manifest: CatalogManifest;
  readonly manifestStatus: ManifestStatus;
  readonly device: DeviceInfo;
  private record: VaultRecord;
  private states = new Map<string, InstallState>();
  private listeners = new Set<() => void>();
  private delivery: ModelDelivery;
  private booted: Promise<void> | null = null;

  constructor(manifest: CatalogManifest = BUNDLED_MANIFEST, device?: DeviceInfo) {
    const check = loadManifest(manifest);
    this.manifestStatus = check.ok ? { ok: true } : { ok: false, problem: check.problem };
    /* An unverifiable manifest still lists models (nothing to hide) but every delivery is refused. */
    this.manifest = check.ok ? withDevBaseUrl(check.manifest) : { ...manifest, models: manifest.models, baseUrl: "" };
    this.device = device ?? readDevice();
    this.record = readRecord();
    const ctx = {
      manifest: this.manifest,
      wifiOnly: () => this.record.wifiOnly,
      savedDownload: (id: string) => this.record.downloads[id],
      saveDownload: (id: string, state: unknown | null) => {
        if (state) this.record.downloads[id] = state as VaultRecord["downloads"][string];
        else delete this.record.downloads[id];
        this.persist();
      },
    };
    this.delivery = Platform.OS === "android" ? new PlayDelivery() : new HttpsDelivery(ctx);
    for (const m of this.manifest.models) this.states.set(m.id, NOT_INSTALLED);
  }

  /** Scans disk once; safe to await many times. */
  ready(): Promise<void> {
    return (this.booted ??= this.scan());
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }

  private notify(): void {
    for (const l of this.listeners) l();
  }

  private persist(): void {
    writeRecord(this.record);
  }

  private set(id: string, state: InstallState): void {
    this.states.set(id, state);
    this.notify();
  }

  private dispatch(id: string, event: InstallEvent): InstallState {
    const next = transition(this.states.get(id) ?? NOT_INSTALLED, event);
    this.set(id, next);
    return next;
  }

  private async scan(): Promise<void> {
    if (Platform.OS === "web") return;
    for (const model of this.manifest.models) {
      const rec = this.record.installs[model.id];
      const located = this.delivery.locate(model);
      if (rec && located && fileSize(new File(located)) === rec.bytes) {
        const via = rec.via;
        this.states.set(model.id, rec.loading || rec.quarantined ? { kind: "quarantined", path: located, bytes: rec.bytes, sha256: rec.sha256, via } : { kind: "ready", path: located, bytes: rec.bytes, sha256: rec.sha256, via });
        if (rec.loading) rec.quarantined = true;
        continue;
      }
      if (located && !rec) {
        /* Delivered outside this store (fast-follow pack on first launch, a file put in place by hand): verify before trusting. */
        await this.adopt(model, located, Platform.OS === "android" ? "play" : "https");
        continue;
      }
      if (this.record.downloads[model.id]) {
        this.states.set(model.id, { kind: "delivering", via: "https", bytes: fileSize(modelFile(`${model.file}.part`)), total: model.bytes, paused: true, waitingForWifi: false, needsConfirmation: false });
        continue;
      }
      if (rec && !located) delete this.record.installs[model.id];
      this.states.set(model.id, NOT_INSTALLED);
    }
    for (const imp of Object.values(this.record.imports)) {
      const f = modelFile(imp.file);
      if (!f.exists) delete this.record.imports[imp.id];
      else this.states.set(imp.id, { kind: "ready", path: f.uri, bytes: imp.bytes, sha256: imp.sha256, via: "import" });
    }
    this.persist();
    this.notify();
    /* Play delivers fast-follow packs by itself after install; asking once makes local testing and a slow first launch behave the same (S02). */
    for (const model of this.manifest.models) {
      const fastFollow = model.delivery.some((d) => d.kind === "play-asset-pack" && d.mode === "fast-follow");
      if (fastFollow && this.states.get(model.id)?.kind === "not-installed" && this.delivery.plan(model)?.via === "play") void this.install(model.id);
    }
  }

  /** Verifies a file found on disk against the catalog (hash + header) and records it. */
  private async adopt(model: CatalogModel, path: string, via: DeliverySource): Promise<InstallState> {
    this.set(model.id, { kind: "verifying", via, bytes: fileSize(new File(path)) });
    return this.checkAndRecord(model, path, via, (s) => this.set2(model.id, s));
  }

  /** Every shard is hashed against the manifest (spec §5.4); one bad shard makes the whole model corrupt. */
  private async checkAndRecord(model: CatalogModel, path: string, via: DeliverySource, commit: (s: InstallState) => InstallState): Promise<InstallState> {
    const dir = path.slice(0, path.lastIndexOf("/") + 1);
    try {
      let total = 0;
      for (const shard of modelParts(model)) {
        const file = new File(`${dir}${shard.file}`);
        const sha = await fileSha256(file);
        if (sha !== shard.sha256) {
          console.warn(`[vault] ${model.id}: ${shard.file} sha256 ${sha} != catalog ${shard.sha256}`);
          if (via !== "play") for (const p of modelParts(model)) safeDelete(new File(`${dir}${p.file}`));
          return commit({ kind: "corrupt", reason: "hash-mismatch", via });
        }
        total += fileSize(file);
      }
      this.record.installs[model.id] = { file: model.file, bytes: total, sha256: model.sha256, via, installedAt: Date.now() };
      this.persist();
      return commit({ kind: "ready", path, bytes: total, sha256: model.sha256, via });
    } catch (e: unknown) {
      return commit({ kind: "failed", via, error: errorText(e), retryable: true });
    }
  }

  private set2(id: string, state: InstallState): InstallState {
    this.set(id, state);
    return state;
  }

  // ---- queries ----------------------------------------------------------------

  entries(): VaultEntry[] {
    const catalog = this.manifest.models.map((model) => ({ model, state: this.states.get(model.id) ?? NOT_INSTALLED, plan: this.manifestStatus.ok ? this.delivery.plan(model) : null }));
    const imports = Object.values(this.record.imports).map((imp) => ({ model: importedAsModel(imp), state: this.states.get(imp.id) ?? NOT_INSTALLED, plan: null, imported: imp }));
    return [...catalog, ...imports];
  }

  state(id: string): InstallState {
    return this.states.get(id) ?? NOT_INSTALLED;
  }

  model(id: string): CatalogModel | undefined {
    return this.manifest.models.find((m) => m.id === id) ?? (this.record.imports[id] ? importedAsModel(this.record.imports[id]!) : undefined);
  }

  /** Bytes the vault holds (catalog files + imports), for the header counter (S30). */
  storageUsedBytes(): number {
    let sum = 0;
    for (const s of this.states.values()) if (isInstalled(s)) sum += s.bytes;
    return sum;
  }

  freeDiskBytes(): number {
    return freeDiskBytes();
  }

  recommendedId(): string | undefined {
    return pickDefault(this.manifest.models, this.device)?.id;
  }

  wifiOnly(): boolean {
    return this.record.wifiOnly;
  }

  setWifiOnly(v: boolean): void {
    this.record.wifiOnly = v;
    this.persist();
    this.notify();
  }

  /** The model the engine loads: the chosen default if installed, else the recommended one, else any installed chat model. */
  activeModel(): { model: CatalogModel; path: string } | null {
    const order = [this.record.defaultModelId, this.recommendedId(), ...this.manifest.models.map((m) => m.id), ...Object.keys(this.record.imports)];
    for (const id of order) {
      if (!id) continue;
      const s = this.states.get(id);
      const m = this.model(id);
      if (s?.kind === "ready" && m?.role === "chat") return { model: m, path: s.path };
    }
    const dev = devFallbackFile();
    if (dev.exists) {
      const instant = this.model("instant");
      if (instant) return { model: instant, path: dev.uri };
    }
    return null;
  }

  defaultModelId(): string | undefined {
    return this.record.defaultModelId;
  }

  setDefault(id: string): void {
    this.record.defaultModelId = id;
    this.persist();
    this.notify();
  }

  /** Called around engine.load(): a crash between the two calls leaves `loading` set, which quarantines the model at next boot. */
  markLoading(id: string, loading: boolean): void {
    if (Platform.OS === "web") return;
    const rec = this.record.installs[id];
    if (rec) {
      rec.loading = loading;
      if (!loading) {
        rec.lastLoadedAt = Date.now();
        rec.quarantined = false;
      }
      this.persist();
    }
    if (!loading) this.dispatch(id, { type: "load-ok" });
  }

  // ---- commands ---------------------------------------------------------------

  async install(id: string): Promise<InstallState> {
    const model = this.model(id);
    if (!model) throw new Error(`unknown model ${id}`);
    const plan = this.manifestStatus.ok ? this.delivery.plan(model) : null;
    if (!plan) return this.set2(id, { kind: "failed", via: "https", error: "no-delivery", retryable: false });
    const state = this.dispatch(id, { type: "request", via: plan.via, requiredBytes: requiredFreeBytes(model.bytes), freeBytes: freeDiskBytes() });
    if (state.kind !== "delivering") return state;
    try {
      const path = await this.delivery.deliver(model, (e) => this.dispatch(id, e));
      this.dispatch(id, { type: "delivered", bytes: fileSize(new File(path)) });
      return this.verify(model, path, plan.via);
    } catch (e: unknown) {
      if (e instanceof PausedError) return this.dispatch(id, { type: "pause" });
      const msg = errorText(e);
      if (msg === "canceled") return this.dispatch(id, { type: "cancel" });
      return this.dispatch(id, { type: "error", error: msg, retryable: msg !== "play-unavailable" });
    }
  }

  private verify(model: CatalogModel, path: string, via: DeliverySource): Promise<InstallState> {
    return this.checkAndRecord(model, path, via, (s) => {
      if (s.kind === "ready") return this.dispatch(model.id, { type: "verified", path: s.path, bytes: s.bytes, sha256: s.sha256 });
      if (s.kind === "corrupt") return this.dispatch(model.id, { type: "rejected", reason: s.reason });
      return this.dispatch(model.id, { type: "error", error: s.kind === "failed" ? s.error : s.kind, retryable: true });
    });
  }

  async pause(id: string): Promise<void> {
    const m = this.model(id);
    if (m) await this.delivery.pause(m);
  }

  async resume(id: string): Promise<InstallState> {
    const s = this.state(id);
    if (s.kind === "delivering" && s.paused) this.set(id, NOT_INSTALLED);
    return this.install(id);
  }

  async cancel(id: string): Promise<void> {
    const m = this.model(id);
    if (m) await this.delivery.cancel(m);
    this.dispatch(id, { type: "cancel" });
  }

  async remove(id: string): Promise<void> {
    const imp = this.record.imports[id];
    if (imp) {
      safeDelete(modelFile(imp.file));
      delete this.record.imports[id];
    } else {
      const m = this.model(id);
      if (m) await this.delivery.remove(m);
      delete this.record.installs[id];
    }
    if (this.record.defaultModelId === id) delete this.record.defaultModelId;
    this.persist();
    this.dispatch(id, { type: "removed" });
  }

  /** Import any GGUF the user picked or opened (spec §7.2): header check, copy into the vault, hash, register. */
  async importFile(sourceUri: string, displayName?: string): Promise<{ ok: true; model: CatalogModel } | { ok: false; reason: GgufError["reason"] | "copy-failed" | "no-space" }> {
    const source = new File(sourceUri);
    const name = displayName ?? source.name ?? "model.gguf";
    let header;
    try {
      header = await fileGgufHeader(source);
    } catch (e: unknown) {
      const reason = (e as Partial<GgufError>).reason ?? "not-gguf";
      return { ok: false, reason };
    }
    const verdict = assessGguf(header);
    if (!verdict.ok) return { ok: false, reason: verdict.reason };
    const bytes = fileSize(source);
    if (freeDiskBytes() < requiredFreeBytes(bytes)) return { ok: false, reason: "no-space" };
    const id = `import:${name.replace(/[^a-zA-Z0-9._-]+/g, "_")}`;
    const fileName = `${id.slice("import:".length)}`.replace(/\.gguf$/i, "") + ".gguf";
    const dest = modelFile(fileName);
    try {
      safeDelete(dest);
      source.copy(dest);
    } catch (e: unknown) {
      console.warn("[vault] import copy failed", e);
      return { ok: false, reason: "copy-failed" };
    }
    this.set(id, { kind: "verifying", via: "import", bytes });
    const sha256 = await fileSha256(dest);
    const imp: ImportedModel = { id, name: header.name ?? name.replace(/\.gguf$/i, ""), file: fileName, bytes, sha256, arch: header.arch, sizeLabel: header.sizeLabel, quant: header.quant, contextLength: header.contextLength, importedAt: Date.now() };
    this.record.imports[id] = imp;
    this.persist();
    this.set(id, { kind: "ready", path: dest.uri, bytes, sha256, via: "import" });
    return { ok: true, model: importedAsModel(imp) };
  }

  vaultPath(): string {
    return vaultDir().uri;
  }
}

/* Applied only after the signature verified: dev bundles may point the base at scripts/serve-models.mjs (allow-listed host). */
function withDevBaseUrl(manifest: CatalogManifest): CatalogManifest {
  const base = devBuild() ? DEV_MODELS_BASE_URL : undefined;
  if (!base) return manifest;
  try {
    return DEV_MODEL_HOSTS.includes(new URL(base).hostname) ? { ...manifest, baseUrl: base } : manifest;
  } catch {
    return manifest;
  }
}

export function importedAsModel(imp: ImportedModel): CatalogModel {
  return {
    id: imp.id,
    role: "chat",
    name: imp.name,
    vendor: "Imported",
    family: imp.arch,
    params: imp.sizeLabel ?? "?",
    quant: imp.quant ?? "?",
    arch: imp.arch,
    file: imp.file,
    bytes: imp.bytes,
    sha256: imp.sha256,
    license: "Apache-2.0",
    minRamGB: 0,
    recommendedRamGB: 0,
    contextLength: imp.contextLength ?? 0,
    vision: false,
    tools: false,
    goodFor: "",
    battery: "medium",
    goodLanguages: [],
    delivery: [],
    proOnly: false,
    minEngine: ENGINE_VERSION,
  };
}

const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

let shared: VaultStore | null = null;
export function getVault(): VaultStore {
  return (shared ??= new VaultStore());
}
