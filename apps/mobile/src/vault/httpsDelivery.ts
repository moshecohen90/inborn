import { AppState, Platform } from "react-native";
import { DownloadTask, File, type DownloadPauseState, type DownloadTaskOptions } from "expo-file-system";
import { ALLOWED_MODEL_HOSTS, HF_HOST, httpsUrl, isNoSpaceError, modelParts, requestBytes, resumePlan, shouldWait, type CatalogModel, type InstallEvent, type ModelPart } from "@inborn/core";
import type { DeliveryContext, DeliveryPlan, ModelDelivery } from "./delivery";
import { DEV_MODEL_HOST, devBuild } from "./devFlags";
import { hfHeaders, hfSearchAvailable } from "./hf";
import { recordTransfer } from "../proof/transfers";
import { fileSize, modelFile, partialFile, safeDelete } from "./paths";

/* Dev bundles may also talk to the local stand-in (scripts/serve-models.mjs); store bundles never (spec §5.1). */
export const DEV_MODEL_HOSTS: readonly string[] = devBuild() ? ["127.0.0.1", "localhost", "10.0.2.2", ...(DEV_MODEL_HOST ? [DEV_MODEL_HOST] : [])] : [];
/* huggingface.co joins the list only where the in-app search exists (§7.2: iOS, desktop); Android stays store-only. */
export const allowedHosts = (): readonly string[] => [...ALLOWED_MODEL_HOSTS, ...(hfSearchAvailable() ? [HF_HOST] : []), ...DEV_MODEL_HOSTS];

const isHf = (model: CatalogModel): boolean => model.delivery.some((d) => d.kind === "hf");

const hostOf = (url: string): string => new URL(url).hostname;

type SavedDownload = DownloadPauseState & { etag?: string };

export class NoSpaceError extends Error {
  constructor() {
    super("no-space");
  }
}

export class PausedError extends Error {
  constructor() {
    super("paused");
  }
}

/**
 * nsurlsessiond paces a store app's background-session download at ~0.09 MB/s even with the app on screen (F370:
 * iPhone 13 Pro and simulator alike, ~40 MB/s in-process), so iOS downloads in the app's own session.
 */
export const DOWNLOAD_SESSION = Platform.OS === "ios" ? "foreground" : "background";

/** How often a parked download looks at the network again; short enough that a Wi-Fi join is not felt as a stall. */
export const WIFI_POLL_MS = 5_000;

/**
 * Resumable HTTPS delivery for iOS, desktop and the web (spec §5.4, §10.1 #2). Pause/resume uses the platform's
 * resume data and survives a restart through the vault record; after a dropped connection Android continues from
 * the bytes on disk (Range). iOS parks the transfer with its resume data when the app leaves the screen and
 * continues from it on return, since an in-process session cannot run while the app is suspended.
 */
export class HttpsDelivery implements ModelDelivery {
  private tasks = new Map<string, DownloadTask>();
  /** Models parked on the Wi-Fi rule: the value wakes the wait early (a cancel, or a pause the user asked for). */
  private waiting = new Map<string, () => void>();
  private stopped = new Set<string>();

  constructor(
    private readonly ctx: DeliveryContext,
    private readonly wifiPollMs: number = WIFI_POLL_MS,
  ) {}

  private url(model: CatalogModel, part?: ModelPart): string | null {
    const url = httpsUrl(this.ctx.manifest, model, part);
    return url && allowedHosts().includes(hostOf(url)) ? url : null;
  }

  plan(model: CatalogModel): DeliveryPlan | null {
    const url = this.url(model);
    if (!url || Platform.OS === "web") return null;
    return { via: isHf(model) ? "hf" : "https", origin: hostOf(url), host: hostOf(url), bytes: model.bytes };
  }

  locate(model: CatalogModel): string | null {
    const all = modelParts(model).every((p) => modelFile(p.file).exists);
    return all ? modelFile(model.file).uri : null;
  }

  /** Shards download one after another; progress is cumulative so the card shows one bar for the whole model. */
  async deliver(model: CatalogModel, emit: (e: InstallEvent) => void): Promise<string> {
    let done = 0;
    for (const shard of modelParts(model)) {
      const final = modelFile(shard.file);
      if (final.exists && fileSize(final) === shard.bytes) {
        done += shard.bytes;
        continue;
      }
      await this.deliverPart(model, shard, emit, (bytes) => emit({ type: "progress", bytes: done + bytes, total: model.bytes }));
      done += shard.bytes;
    }
    return modelFile(model.file).uri;
  }

  private async deliverPart(model: CatalogModel, shard: ModelPart, emit: (e: InstallEvent) => void, progress: (bytes: number) => void): Promise<void> {
    const url = this.url(model, shard);
    if (!url) throw new Error(`no allowed https delivery for ${model.id}`);
    await this.waitForWifi(model, shard, emit);
    const part = partialFile(shard.file);
    /* Every byte already here (a verify that failed after the transfer, QA F20): rename, never fetch from 0 again. */
    if (fileSize(part) === shard.bytes) {
      this.ctx.saveDownload(model.id, null);
      await this.finish(shard, part);
      return;
    }
    const saved = this.ctx.savedDownload(model.id) as SavedDownload | undefined;
    /* A gated repository needs the user's token; models.inbornapp.com gets no header at all. */
    const headers = isHf(model) ? await hfHeaders() : undefined;
    let written = 0;
    const opts: DownloadTaskOptions = {
      sessionType: DOWNLOAD_SESSION,
      ...(headers && Object.keys(headers).length ? { headers } : {}),
      onProgress: ({ bytesWritten }) => {
        written = bytesWritten;
        progress(bytesWritten);
      },
    };
    await this.untilOnScreen(model.id);
    let task = await this.taskFor(model, shard, url, part, saved, opts);
    this.tasks.set(model.id, task);
    const before = fileSize(part);
    try {
      for (;;) {
        const leave = this.parkOnLeave(task);
        let result: Awaited<ReturnType<DownloadTask["downloadAsync"]>>;
        try {
          result = task.state === "paused" ? await task.resumeAsync() : await task.downloadAsync();
        } finally {
          leave.stop();
        }
        if (result) break;
        const state: SavedDownload = { ...(this.ctx.savedDownload(model.id) as SavedDownload | undefined), ...task.savable() };
        this.ctx.saveDownload(model.id, state);
        if (!leave.parked()) throw new PausedError();
        await this.untilOnScreen(model.id);
        task = DownloadTask.fromSavable({ ...state, fileUri: part.uri }, opts);
        this.tasks.set(model.id, task);
        emit({ type: "resumed", at: Date.now() });
      }
      this.ctx.saveDownload(model.id, null);
      await this.finish(shard, part);
    } catch (e: unknown) {
      /* A full disk is a pause with a reason: the part and the resume state stay so "Try again" continues from the same byte (QA R4-F14). */
      if (isNoSpaceError(e)) {
        try {
          this.ctx.saveDownload(model.id, { ...(this.ctx.savedDownload(model.id) as SavedDownload | undefined), ...task.savable() });
        } catch {
          /* the record is best effort on a disk this full */
        }
        throw new NoSpaceError();
      }
      throw e;
    } finally {
      this.tasks.delete(model.id);
      /* S50 honesty: what this request moved, whether it finished, paused or failed. */
      recordTransfer({ host: hostOf(url), bytesOut: requestBytes(url), bytesIn: Math.max(0, written - before), purpose: "model" });
    }
  }

  /** iOS only: pauses the running leg when the app goes to the background, where an in-process session would stall. */
  private parkOnLeave(task: DownloadTask): { parked: () => boolean; stop: () => void } {
    if (DOWNLOAD_SESSION !== "foreground") return { parked: () => false, stop: () => undefined };
    let parked = false;
    const sub = AppState.addEventListener("change", (next) => {
      if (next !== "background" || parked || task.state !== "active") return;
      parked = true;
      void task.pauseAsync().catch(() => undefined);
    });
    return { parked: () => parked, stop: () => sub.remove() };
  }

  /** iOS only: a parked or not-yet-started download waits for the screen; Pause and Cancel end the wait. */
  private async untilOnScreen(id: string): Promise<void> {
    if (DOWNLOAD_SESSION !== "foreground") return;
    while (AppState.currentState === "background") {
      await new Promise<void>((resolve) => {
        const done = (): void => {
          sub.remove();
          this.waiting.delete(id);
          resolve();
        };
        const sub = AppState.addEventListener("change", (next) => {
          if (next !== "background") done();
        });
        this.waiting.set(id, done);
      });
      if (this.stopped.delete(id)) throw new PausedError();
    }
  }

  private async taskFor(model: CatalogModel, shard: ModelPart, url: string, part: File, saved: SavedDownload | undefined, opts: DownloadTaskOptions): Promise<DownloadTask> {
    /* The saved state carries an absolute file URI; iOS moves the container on every update, so the part's current URI replaces it (QA F12). */
    if (saved?.url === url && saved.resumeData) return DownloadTask.fromSavable({ ...saved, fileUri: part.uri }, opts);
    const have = fileSize(part);
    const head = await this.head(url);
    if (head.total && head.total !== shard.bytes) throw new Error(`size mismatch: ${hostOf(url)} says ${head.total} bytes, catalog ${shard.bytes}`);
    const plan = resumePlan(have > 0 && saved?.url === url ? { url, bytes: have, etag: saved.etag, total: shard.bytes } : null, head);
    /* Android's native task appends from the byte offset; iOS has no byte-offset resume, only its own resume data. */
    if (plan.action === "resume" && plan.start > 0 && Platform.OS === "android") {
      return DownloadTask.fromSavable({ url, fileUri: part.uri, isDirectory: false, resumeData: String(plan.start) }, opts);
    }
    safeDelete(part);
    this.ctx.saveDownload(model.id, { url, fileUri: part.uri, isDirectory: false, etag: head.etag });
    return File.createDownloadTask(url, part, opts);
  }

  /**
   * §10.1 #4: a model over 100 MB does not spend the user's data plan. The card says "Waiting for Wi-Fi" and the
   * bytes wait, here rather than in Play's downloader, so iOS and the desktop honour the switch Android already did.
   */
  private async waitForWifi(model: CatalogModel, shard: ModelPart, emit: (e: InstallEvent) => void): Promise<void> {
    let announced = false;
    while (shouldWait(shard.bytes, await this.ctx.network(), this.ctx.wifiOnly())) {
      if (!announced) {
        announced = true;
        emit({ type: "waiting-for-wifi" });
      }
      let wake = (): void => undefined;
      const slept = new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, this.wifiPollMs);
        wake = () => {
          clearTimeout(timer);
          resolve();
        };
      });
      this.waiting.set(model.id, wake);
      try {
        await slept;
      } finally {
        this.waiting.delete(model.id);
      }
      /* Cancel and pause both leave the queue through the same door: nothing was written, so there is nothing to keep. */
      if (this.stopped.delete(model.id)) throw new PausedError();
    }
  }

  /** Real size from a HEAD before anything is written (spec S30 edge cases). */
  private async head(url: string): Promise<{ total: number; etag?: string; acceptRanges: boolean }> {
    const r = await fetch(url, { method: "HEAD", headers: hostOf(url) === HF_HOST ? await hfHeaders() : undefined });
    recordTransfer({ host: hostOf(url), bytesOut: requestBytes(url, "HEAD"), bytesIn: 0, purpose: "model" });
    if (!r.ok) throw new Error(`HEAD ${r.status} from ${hostOf(url)}`);
    return { total: Number(r.headers.get("content-length") ?? 0), etag: r.headers.get("etag") ?? undefined, acceptRanges: r.headers.get("accept-ranges") === "bytes" };
  }

  /** Bytes are complete: rename .part into place; the caller hashes it (spec §5.4) before it is "ready". */
  private async finish(shard: ModelPart, part: File): Promise<void> {
    const final = modelFile(shard.file);
    safeDelete(final);
    /* SDK 57 File.move() is a promise; hashing before it settles read ENOENT on a busy disk (QA O10). */
    await part.move(final);
  }

  async pause(model: CatalogModel): Promise<void> {
    this.stopWaiting(model.id);
    const t = this.tasks.get(model.id);
    if (t?.state === "active") await t.pauseAsync();
  }

  private stopWaiting(id: string): void {
    const wake = this.waiting.get(id);
    if (!wake) return;
    this.stopped.add(id);
    wake();
  }

  async cancel(model: CatalogModel): Promise<void> {
    this.stopWaiting(model.id);
    const t = this.tasks.get(model.id);
    if (t) {
      t.cancel();
      this.tasks.delete(model.id);
    }
    for (const shard of modelParts(model)) safeDelete(partialFile(shard.file));
    this.ctx.saveDownload(model.id, null);
  }

  async remove(model: CatalogModel): Promise<void> {
    await this.cancel(model);
    for (const shard of modelParts(model)) safeDelete(modelFile(shard.file));
  }
}
