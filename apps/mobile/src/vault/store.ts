import { Platform } from "react-native";
import { File } from "expo-file-system";
import {
  BUNDLED_MANIFEST,
  DeliveryLanes,
  ENGINE_VERSION,
  NOT_INSTALLED,
  assessGguf,
  isInstalled,
  loadManifest,
  modelParts,
  pickDefault,
  isNoSpaceError,
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
import { DEV_MODEL_HOSTS, HttpsDelivery, NoSpaceError, PausedError } from "./httpsDelivery";
import { reportStorageFull } from "../services/storageFull";
import { pickModelLocation, type ModelLocation } from "./locate";
import { bundledModelFile, devFallbackFile, fileSize, modelFile, safeDelete, vaultDir } from "./paths";
import { PlayDelivery } from "./playDelivery";
import { readRecord, writeRecord, type ImportedModel, type VaultRecord } from "./record";

/** A .gguf in the vault folder that neither the catalog nor an import registered (copied by hand, a crash mid-import): shown, counted, removable, never loaded. */
export interface StrayFile {
  file: string;
  bytes: number;
  path: string;
}
export const STRAY_PREFIX = "stray:";

/** `importOnly`: this platform's store never carries the file (sharp-phi has no Play pack), so the card offers import instead of a dead Install. */
export type VaultEntry = { model: CatalogModel; state: InstallState; plan: DeliveryPlan | null; imported?: ImportedModel; stray?: StrayFile; importOnly?: boolean; hf?: boolean };
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
  private strays: StrayFile[] = [];
  private listeners = new Set<() => void>();
  private delivery: ModelDelivery;
  private booted: Promise<void> | null = null;
  private lanes = new DeliveryLanes();
  private spacePoll: ReturnType<typeof setInterval> | null = null;

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
    /* Debug APKs cannot reach Play Core; pointing a dev bundle at scripts/serve-models.mjs gives Android the same HTTPS path the other platforms use. */
    this.delivery = Platform.OS === "android" && !(devBuild() && DEV_MODELS_BASE_URL) ? new PlayDelivery() : new HttpsDelivery(ctx);
    for (const m of this.deliverable()) this.states.set(m.id, NOT_INSTALLED);
  }

  /** Catalog models plus the Hugging Face picks (§7.2): everything the platform delivery can fetch and verify. */
  private deliverable(): CatalogModel[] {
    return [...this.manifest.models, ...Object.values(this.record.hf)];
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
    if (state.kind === "needs-space" && !this.spacePoll) this.spacePoll = setInterval(() => this.recheckSpace(), SPACE_POLL_MS);
    this.notify();
  }

  /** "Free up N" follows the disk: the line updates or clears as space comes back, without another Install tap (QA O11). */
  recheckSpace(): void {
    const ids = [...this.states].filter(([, s]) => s.kind === "needs-space").map(([id]) => id);
    if (!ids.length) {
      if (this.spacePoll) clearInterval(this.spacePoll);
      this.spacePoll = null;
      return;
    }
    const freeBytes = freeDiskBytes();
    for (const id of ids) this.dispatch(id, { type: "space-check", freeBytes });
  }

  private dispatch(id: string, event: InstallEvent): InstallState {
    const next = transition(this.states.get(id) ?? NOT_INSTALLED, event);
    this.set(id, next);
    return next;
  }

  private async scan(): Promise<void> {
    if (Platform.OS === "web") return;
    for (const model of this.deliverable()) {
      const bundled = bundledModelFile(model.id) ?? devBundledStandIn(model.id);
      if (bundled) {
        this.adoptBundled(model, bundled);
        continue;
      }
      const rec = this.record.installs[model.id];
      const located = this.delivery.locate(model);
      if (rec && located && onDiskBytes(model, located) === rec.bytes) {
        const via = rec.via;
        this.states.set(model.id, rec.loading || rec.quarantined ? { kind: "quarantined", path: located, bytes: rec.bytes, sha256: rec.sha256, via } : { kind: "ready", path: located, bytes: rec.bytes, sha256: rec.sha256, via });
        if (rec.loading) rec.quarantined = true;
        continue;
      }
      if (located && !rec) {
        /* Delivered outside this store (fast-follow pack on first launch, a file put in place by hand): verify before trusting. */
        await this.adopt(model, located, Platform.OS === "android" ? "play" : this.record.hf[model.id] ? "hf" : "https");
        continue;
      }
      if (this.record.downloads[model.id]) {
        this.states.set(model.id, { kind: "delivering", via: this.record.hf[model.id] ? "hf" : "https", bytes: fileSize(modelFile(`${model.file}.part`)), total: model.bytes, paused: true, waitingForWifi: false, needsConfirmation: false });
        continue;
      }
      /* Play unbinds every on-demand pack from the app on a version update while the bytes stay on the phone;
         forgetting the record here is what made the vault offer a fresh 1.2 GB download (purchases run §K). */
      if (rec && !located && rec.via !== "play") delete this.record.installs[model.id];
      this.states.set(model.id, NOT_INSTALLED);
    }
    for (const imp of Object.values(this.record.imports)) {
      const f = modelFile(imp.file);
      if (!f.exists) delete this.record.imports[imp.id];
      else this.states.set(imp.id, { kind: "ready", path: f.uri, bytes: imp.bytes, sha256: imp.sha256, via: "import" });
    }
    this.strays = this.scanStrays();
    this.persist();
    this.notify();
    this.requestKnownPacks();
  }

  /**
   * Asks Play for the packs this device should already have: fast-follow ones Play delivers by itself after an install
   * (S02), and any pack the vault recorded as delivered, which every app update unbinds (purchases run §K). Both are one
   * request away from bytes that are on the phone, and Play serves them without downloading again. Runs on the boot scan
   * and on vault open.
   */
  requestKnownPacks(): void {
    for (const model of this.manifest.models) {
      if (this.states.get(model.id)?.kind !== "not-installed") continue;
      const fastFollow = model.delivery.some((d) => d.kind === "play-asset-pack" && d.mode === "fast-follow");
      const delivered = this.record.installs[model.id]?.via === "play";
      if ((fastFollow || delivered) && this.delivery.plan(model)?.via === "play") void this.install(model.id);
    }
  }

  /** The copy the store signed is ready at once; it is hashed once, in the background, and the verdict is kept so no launch re-reads 500 MB (§5.4). */
  private adoptBundled(model: CatalogModel, file: File): void {
    const bytes = fileSize(file);
    const rec = this.record.installs[model.id];
    const known = rec?.via === "bundled" && rec.verifiedAt && rec.bytes === bytes ? rec : undefined;
    if (known) {
      if (known.sha256 !== model.sha256) {
        this.states.set(model.id, { kind: "corrupt", reason: "hash-mismatch", via: "bundled" });
        return;
      }
      this.states.set(model.id, known.loading || known.quarantined ? { kind: "quarantined", path: file.uri, bytes, sha256: known.sha256, via: "bundled" } : { kind: "ready", path: file.uri, bytes, sha256: known.sha256, via: "bundled" });
      if (known.loading) known.quarantined = true;
      return;
    }
    this.record.installs[model.id] = { file: model.file, bytes, sha256: model.sha256, via: "bundled", installedAt: rec?.installedAt ?? Date.now() };
    this.states.set(model.id, { kind: "ready", path: file.uri, bytes, sha256: model.sha256, via: "bundled" });
    void this.verifyBundled(model, file);
  }

  private async verifyBundled(model: CatalogModel, file: File): Promise<void> {
    try {
      const sha = await fileSha256(file);
      const rec = this.record.installs[model.id];
      if (rec?.via !== "bundled") return;
      rec.sha256 = sha;
      rec.verifiedAt = Date.now();
      this.persist();
      if (sha !== model.sha256) {
        console.warn(`[vault] ${model.id}: bundled copy sha256 ${sha} != catalog ${model.sha256}`);
        this.set(model.id, { kind: "corrupt", reason: "hash-mismatch", via: "bundled" });
      }
    } catch (e: unknown) {
      console.warn(`[vault] ${model.id}: bundled copy not hashed`, e);
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
    const catalog = this.manifest.models.map((model) => {
      const plan = this.manifestStatus.ok ? this.delivery.plan(model) : null;
      const importOnly = !plan && Platform.OS === "android" && !model.delivery.some((d) => d.kind === "play-asset-pack");
      return { model, state: this.states.get(model.id) ?? NOT_INSTALLED, plan, importOnly };
    });
    const hf = Object.values(this.record.hf).map((model) => ({ model, state: this.states.get(model.id) ?? NOT_INSTALLED, plan: this.manifestStatus.ok ? this.delivery.plan(model) : null, hf: true }));
    const imports = Object.values(this.record.imports).map((imp) => ({ model: importedAsModel(imp), state: this.states.get(imp.id) ?? NOT_INSTALLED, plan: null, imported: imp }));
    const strays = this.strays.map((s) => ({ model: strayAsModel(s), state: { kind: "ready", path: s.path, bytes: s.bytes, sha256: "", via: "import" } as InstallState, plan: null, stray: s }));
    return [...catalog, ...hf, ...imports, ...strays];
  }

  /** Files in the vault folder that no catalog part, import or download owns (QA B17). */
  private scanStrays(): StrayFile[] {
    const known = new Set<string>(["vault.json"]);
    for (const m of this.deliverable()) for (const p of modelParts(m)) known.add(p.file);
    for (const imp of Object.values(this.record.imports)) known.add(imp.file);
    const out: StrayFile[] = [];
    try {
      for (const e of vaultDir().list()) if (e instanceof File && /\.gguf$/i.test(e.name) && !known.has(e.name)) out.push({ file: e.name, bytes: fileSize(e), path: e.uri });
    } catch {
      /* no vault directory yet */
    }
    return out;
  }

  state(id: string): InstallState {
    return this.states.get(id) ?? NOT_INSTALLED;
  }

  model(id: string): CatalogModel | undefined {
    return this.manifest.models.find((m) => m.id === id) ?? this.record.hf[id] ?? (this.record.imports[id] ? importedAsModel(this.record.imports[id]!) : undefined);
  }

  /** A file picked in the Hugging Face search joins the vault as a not-installed model; Install then runs the usual HTTPS + hash path. */
  addHfModel(model: CatalogModel): VaultEntry {
    if (!this.record.hf[model.id]) {
      this.record.hf[model.id] = model;
      this.states.set(model.id, NOT_INSTALLED);
      this.persist();
      this.notify();
    }
    const stored = this.record.hf[model.id]!;
    return { model: stored, state: this.state(model.id), plan: this.manifestStatus.ok ? this.delivery.plan(stored) : null, hf: true };
  }

  /** Bytes the vault holds (catalog files + imports), for the header counter (S30). */
  storageUsedBytes(): number {
    let sum = 0;
    for (const s of this.states.values()) if (isInstalled(s) && s.via !== "bundled") sum += s.bytes;
    for (const s of this.strays) sum += s.bytes;
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
    const order = [this.record.defaultModelId, this.recommendedId(), ...this.manifest.models.map((m) => m.id), ...Object.keys(this.record.hf), ...Object.keys(this.record.imports)];
    for (const id of order) {
      if (!id) continue;
      const m = this.model(id);
      if (m?.role !== "chat") continue;
      const loc = this.locate(id);
      if (loc) return { model: m, path: loc.path };
    }
    return null;
  }

  /** Where the engine would load this model from right now: bundled > hand-pushed Documents file > vault copy, else null. */
  locate(id: string): ModelLocation | null {
    const s = this.states.get(id);
    const ready = s?.kind === "ready" ? s : null;
    const bundled = ready?.via === "bundled" ? ready.path : null;
    const dev = !bundled && id === "instant" && Platform.OS !== "web" ? devFallbackFile() : null;
    return pickModelLocation({ bundled, documents: dev?.exists ? dev.uri : null, downloaded: ready && !bundled ? ready.path : null });
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
    await this.lanes.acquire(id, model.bytes);
    if (this.state(id).kind !== "delivering") return this.state(id);
    try {
      let lastTick = 0;
      const path = await this.delivery.deliver(model, (e) => {
        /* Five parallel downloads tick every 100 ms each; one repaint per file per half second keeps the JS thread free for the small file's verify. */
        if (e.type === "progress" && e.bytes < e.total && Date.now() - lastTick < PROGRESS_TICK_MS) return;
        if (e.type === "progress") lastTick = Date.now();
        this.dispatch(id, e);
      });
      this.lanes.release(id);
      const deliveredAt = Date.now();
      this.dispatch(id, { type: "delivered", bytes: fileSize(new File(path)) });
      const verified = await this.verify(model, path, plan.via);
      if (__DEV__) console.log(`[vault] ${id} ${verified.kind} · verified in ${Date.now() - deliveredAt} ms`);
      return verified;
    } catch (e: unknown) {
      this.lanes.release(id);
      if (e instanceof PausedError) return this.dispatch(id, { type: "pause" });
      if (e instanceof NoSpaceError || isNoSpaceError(e)) {
        reportStorageFull();
        return this.dispatch(id, { type: "no-space", requiredBytes: requiredFreeBytes(model.bytes), freeBytes: freeDiskBytes() });
      }
      const msg = errorText(e);
      if (msg === "canceled") return this.dispatch(id, { type: "cancel" });
      /* Play cannot serve this build at all (QA F26): the vault says so in its own words and offers import, instead of a raw Play message behind a Try again that can never work. */
      if (msg === "play-unavailable") return this.dispatch(id, { type: "error", error: "no-delivery", retryable: false });
      return this.dispatch(id, { type: "error", error: msg, retryable: true });
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
    this.lanes.release(id);
  }

  async remove(id: string): Promise<void> {
    if (id.startsWith(STRAY_PREFIX)) {
      const stray = this.strays.find((s) => strayId(s) === id);
      if (stray) safeDelete(new File(stray.path));
      this.strays = this.scanStrays();
      this.notify();
      return;
    }
    const current = this.state(id);
    if (current.kind === "ready" && current.via === "bundled") return;
    const imp = this.record.imports[id];
    if (imp) {
      safeDelete(modelFile(imp.file));
      delete this.record.imports[id];
    } else {
      const m = this.model(id);
      if (m) await this.delivery.remove(m);
      delete this.record.installs[id];
      delete this.record.hf[id];
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
    if (bytes <= 0) return { ok: false, reason: "truncated" };
    const id = `import:${name.replace(/[^a-zA-Z0-9._-]+/g, "_")}`;
    const fileName = `${id.slice("import:".length)}`.replace(/\.gguf$/i, "") + ".gguf";
    const dest = modelFile(fileName);
    /* The same file again (the dev auto-import on every vault mount, a second tap): keep the verified copy, which may be the one the engine has mapped. */
    const known = this.record.imports[id];
    if (known && known.bytes === bytes && dest.exists && fileSize(dest) === bytes) {
      this.set(id, { kind: "ready", path: dest.uri, bytes, sha256: known.sha256, via: "import" });
      return { ok: true, model: importedAsModel(known) };
    }
    if (freeDiskBytes() < requiredFreeBytes(bytes)) return { ok: false, reason: "no-space" };
    try {
      safeDelete(dest);
      await source.copy(dest);
    } catch (e: unknown) {
      console.warn("[vault] import copy failed", e);
      return { ok: false, reason: "copy-failed" };
    }
    this.set(id, { kind: "verifying", via: "import", bytes });
    /* File.copy() returns while Android is still writing (a 508 MB import hashed at 342 MB); hash only once the copy has all the bytes. */
    for (let i = 0; fileSize(dest) < bytes && i < 600; i++) await new Promise((r) => setTimeout(r, 200));
    if (fileSize(dest) !== bytes) {
      safeDelete(dest);
      delete this.record.imports[id];
      this.persist();
      this.set(id, NOT_INSTALLED);
      return { ok: false, reason: "copy-failed" };
    }
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

/* A sharded model records the sum of its parts, so the scan must measure every shard next to the first one. */
function onDiskBytes(model: CatalogModel, firstPart: string): number {
  const dir = firstPart.slice(0, firstPart.lastIndexOf("/") + 1);
  return modelParts(model).reduce((sum, p) => sum + fileSize(new File(`${dir}${p.file}`)), 0);
}

/* Dev builds have no store pack; a hand-pushed Documents/instant.gguf stands in for the bundled copy so the vault and the engine agree. */
function devBundledStandIn(modelId: string): File | null {
  if (modelId !== "instant" || !devBuild()) return null;
  const f = devFallbackFile();
  return f.exists ? f : null;
}

const strayId = (s: StrayFile): string => `${STRAY_PREFIX}${s.file}`;

/** A stray file wears the catalog shape so the vault list can render it; its id never reaches the engine. */
export function strayAsModel(s: StrayFile): CatalogModel {
  return importedAsModel({ id: strayId(s), name: s.file, file: s.file, bytes: s.bytes, sha256: "", arch: "?", importedAt: 0 });
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

const PROGRESS_TICK_MS = 500;
const SPACE_POLL_MS = 5_000;

const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

let shared: VaultStore | null = null;
export function getVault(): VaultStore {
  return (shared ??= new VaultStore());
}
