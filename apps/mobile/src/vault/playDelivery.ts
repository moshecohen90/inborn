import { Directory, File, Paths } from "expo-file-system";
import { modelParts, type CatalogModel, type Delivery, type InstallEvent } from "@inborn/core";
import { AssetPackErrorCode, AssetPackStatus, addPackListener, adoptInto, cancelPack, fetchPack, getPackPath, getPackState, hasAssetPacks, linkInto, removePack, showPackConfirmation, type AssetPackState } from "../../modules/asset-packs";
import { modelFile, safeDelete, vaultDir } from "./paths";
import { isPlayUnavailable, type DeliverOptions, type DeliveryPlan, type ModelDelivery } from "./delivery";

type PlayPack = Extract<Delivery, { kind: "play-asset-pack" }>;

/** One pack per shard (Play caps a pack at 1.5 GB, spec §5.1); a single-file model has exactly one. */
const packsOf = (model: CatalogModel): PlayPack[] => model.delivery.filter((d): d is PlayPack => d.kind === "play-asset-pack");

/** Play Asset Delivery: Play downloads (cellular consent, resume, retries are Play's), the app only shows state (spec §5.1, S32). */
export class PlayDelivery implements ModelDelivery {
  /* Once Play has refused to bind, every pack on this device is out of reach for this run: the vault offers import instead of a dead Install. */
  private unavailable = false;
  /* Packs a user tap is fetching right now: Play's dialog approves every pending pack, so any other one is cancelled first. */
  private readonly asked = new Set<string>();

  constructor(private readonly allPacks: readonly string[] = []) {}

  plan(model: CatalogModel): DeliveryPlan | null {
    return this.reachable() && packsOf(model).length ? { via: "play", origin: "Google Play", bytes: model.bytes } : null;
  }

  reachable(): boolean {
    return !this.unavailable && hasAssetPacks();
  }

  /** The vault's own copy first; a pack still bound in Play's directory is the fallback for installs made before adopt(). */
  locate(model: CatalogModel): string | null {
    return this.owned(model) ?? this.inPlay(model);
  }

  private owned(model: CatalogModel): string | null {
    if (!packsOf(model).length) return null;
    return modelParts(model).every((p) => modelFile(p.file).exists) ? modelFile(model.file).uri : null;
  }

  /**
   * Hard-links (else copies) the delivered pack files into the vault directory, so the model no longer needs Play's
   * pack and release() can take it out of Play: an installed on-demand pack is re-downloaded by Play on every app update.
   */
  adopt(model: CatalogModel): string | null {
    const files: Record<string, string> = {};
    for (const part of modelParts(model)) {
      const pack = packsOf(model).find((p) => p.file === part.file) ?? packsOf(model)[0];
      const dir = pack ? getPackPath(pack.pack) : null;
      if (!dir || !new File(`file://${dir}`, part.file).exists) return null;
      files[part.file] = `${dir}/${part.file}`;
    }
    return adoptInto(vaultDir().uri.replace(/^file:\/\//, "").replace(/\/$/, ""), files) ? this.owned(model) : null;
  }

  /** After the vault verified its own copy: Play forgets the packs, so no update re-delivers them. Never fails the install. */
  async release(model: CatalogModel, path: string): Promise<void> {
    if (path !== this.owned(model)) return;
    for (const pack of packsOf(model)) await removePack(pack.pack).catch((e: unknown) => console.warn(`[vault] removePack ${pack.pack}`, e));
  }

  /* Play restores every pack it once delivered to this account on each reinstall, before the app runs (OnePlus 11, 12.10: 1.9 GB). */
  async dropUnrequested(requested: ReadonlySet<string>, sweep: boolean): Promise<string[]> {
    const dropped: string[] = [];
    if (!this.reachable()) return dropped;
    for (const name of this.allPacks) {
      if (requested.has(name) || this.asked.has(name)) continue;
      const s = await getPackState(name).catch(() => null);
      const absent = !s || s.status === AssetPackStatus.NOT_INSTALLED;
      if (absent && !sweep) continue;
      if (s && !absent && s.status !== AssetPackStatus.COMPLETED) cancelPack(name);
      await removePack(name).catch(() => undefined);
      if (!absent) dropped.push(name);
    }
    return dropped;
  }

  private inPlay(model: CatalogModel): string | null {
    const packs = packsOf(model);
    const first = packs[0];
    if (!first) return null;
    /* Pack assets carry the catalog file names, so the same part list serves Play, HTTPS and the boot scan. */
    const found: { file: string; dir: string }[] = [];
    for (const part of modelParts(model)) {
      const pack = packs.find((p) => p.file === part.file) ?? first;
      const dir = getPackPath(pack.pack);
      if (!dir || !new File(`file://${dir}`, part.file).exists) return null;
      found.push({ file: part.file, dir });
    }
    const dirs = new Set(found.map((f) => f.dir));
    const [one] = dirs;
    if (dirs.size === 1 && one) return new File(`file://${one}`, model.file).uri;
    /* Shards from different packs: llama.cpp opens the first and expects the rest beside it, so a directory of links joins them. Relinked on every locate because Play may move a pack. */
    const joined = new Directory(Paths.document, "assetpacks-joined", model.id);
    const dir = linkInto(joined.uri.replace(/^file:\/\//, ""), Object.fromEntries(found.map((f) => [f.file, `${f.dir}/${f.file}`])));
    return dir ? new File(`file://${dir}`, model.file).uri : null;
  }

  async heldOnDevice(model: CatalogModel): Promise<boolean> {
    const packs = packsOf(model);
    if (!packs.length) return false;
    for (const pack of packs) {
      const s = await getPackState(pack.pack).catch(() => null);
      if (s?.status !== AssetPackStatus.COMPLETED) return false;
    }
    return true;
  }

  async deliver(model: CatalogModel, emit: (e: InstallEvent) => void, opts: DeliverOptions = {}): Promise<string> {
    try {
      return await this.deliverPacks(model, emit, opts.silent === true);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      if (!isPlayUnavailable(message)) throw e;
      this.unavailable = true;
      throw new Error("play-unavailable", { cause: e });
    }
  }

  private async deliverPacks(model: CatalogModel, emit: (e: InstallEvent) => void, silent: boolean): Promise<string> {
    const packs = packsOf(model);
    if (!packs.length) throw new Error(`${model.id} has no Play pack`);
    const located = this.owned(model) ?? this.adoptAndRelease(model) ?? this.inPlay(model);
    if (located) return located;
    /* Packs arrive one after another; progress is cumulative so the card shows one bar for the whole model. */
    let done = 0;
    for (const pack of packs) {
      const part = modelParts(model).find((p) => p.file === pack.file);
      const bytes = part?.bytes ?? model.bytes;
      const dir = getPackPath(pack.pack);
      if (dir && new File(`file://${dir}`, pack.file).exists) {
        done += bytes;
        continue;
      }
      await this.fetchOne(pack, bytes, (b) => emit({ type: "progress", bytes: done + b, total: model.bytes }), emit, silent);
      done += bytes;
    }
    const path = this.adoptAndRelease(model) ?? this.inPlay(model);
    if (!path) throw new Error(`packs for ${model.id} completed but a shard is missing`);
    return path;
  }

  /* Release follows the hard link, not the minutes-long hash after it: an app backgrounded or updated in between must not leave an installed pack behind (6T 32→33, 11.10). */
  private adoptAndRelease(model: CatalogModel): string | null {
    const path = this.adopt(model);
    if (path) void this.release(model, path);
    return path;
  }

  private fetchOne(pack: PlayPack, bytes: number, progress: (bytes: number) => void, emit: (e: InstallEvent) => void, silent: boolean): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const asked = { wifi: false, confirm: false };
      const done = (fn: () => void) => {
        if (settled) return;
        settled = true;
        this.asked.delete(pack.pack);
        sub.remove();
        fn();
      };
      const onState = (s: AssetPackState) => {
        if (s.name !== pack.pack) return;
        /* Play wants a real download after all: without a tap the request is withdrawn, never put to the user as Play's dialog. */
        if (silent && AWAITING_DIALOG.has(s.status)) {
          cancelPack(pack.pack);
          done(() => reject(new Error("canceled")));
          return;
        }
        switch (s.status) {
          case AssetPackStatus.PENDING:
          case AssetPackStatus.DOWNLOADING:
          case AssetPackStatus.TRANSFERRING:
            progress(Math.min(s.bytesDownloaded, bytes));
            return;
          case AssetPackStatus.WAITING_FOR_WIFI:
            emit({ type: "waiting-for-wifi" });
            /* Play's own "download over mobile data?" dialog, once per fetch; a No keeps the pack waiting for Wi-Fi. */
            if (!asked.wifi) {
              asked.wifi = true;
              void this.confirm().catch(() => undefined);
            }
            return;
          case AssetPackStatus.REQUIRES_USER_CONFIRMATION:
            emit({ type: "needs-confirmation" });
            if (asked.confirm) return;
            asked.confirm = true;
            void this.confirm().then((r) => {
              if (r === 0) done(() => reject(new Error("canceled")));
            }, () => undefined);
            return;
          case AssetPackStatus.COMPLETED: {
            const dir = getPackPath(pack.pack);
            const ok = dir ? new File(`file://${dir}`, pack.file).exists : false;
            done(() => (ok ? resolve() : reject(new Error(`pack ${pack.pack} completed but ${pack.file} is missing`))));
            return;
          }
          case AssetPackStatus.CANCELED:
            done(() => reject(new Error("canceled")));
            return;
          case AssetPackStatus.FAILED:
            done(() => reject(new Error(describePlayError(s.errorCode))));
            return;
          default:
            return;
        }
      };
      const sub = addPackListener(onState);
      if (!silent) this.asked.add(pack.pack);
      fetchPack(pack.pack)
        .then((s) => {
          if (s) onState(s);
          /* Local-testing (bundletool) delivers without always firing the listener; a slow poll closes the gap. */
          const poll = setInterval(() => {
            if (settled) return clearInterval(poll);
            getPackState(pack.pack)
              .then((st) => st && onState(st))
              .catch(() => undefined);
          }, 1500);
        })
        .catch((e: unknown) => done(() => reject(playFetchError(e))));
    });
  }

  /* Instant and its projector wait for Wi-Fi together; one dialog answers for both, and for nothing the user did not ask for. */
  private confirm(): Promise<number> {
    confirming ??= this.cancelUnasked()
      .then(() => showPackConfirmation())
      .finally(() => {
        confirming = null;
      });
    return confirming;
  }

  private async cancelUnasked(): Promise<void> {
    for (const name of this.allPacks) {
      if (this.asked.has(name)) continue;
      const s = await getPackState(name).catch(() => null);
      if (s && AWAITING_DIALOG.has(s.status)) cancelPack(name);
    }
  }

  async pause(): Promise<void> {
    /* Play has no pause; the user cancels and asks again, Play keeps what it already fetched. */
  }

  async cancel(model: CatalogModel): Promise<void> {
    for (const pack of packsOf(model)) cancelPack(pack.pack);
  }

  /* Idempotent: a pack release() already took out of Play is simply not there to remove. */
  async remove(model: CatalogModel): Promise<void> {
    for (const pack of packsOf(model)) await removePack(pack.pack).catch(() => undefined);
    for (const part of modelParts(model)) safeDelete(modelFile(part.file));
    try {
      new Directory(Paths.document, "assetpacks-joined", model.id).delete();
    } catch {
      /* never linked */
    }
  }
}

let confirming: Promise<number> | null = null;
const AWAITING_DIALOG = new Set<number>([AssetPackStatus.WAITING_FOR_WIFI, AssetPackStatus.REQUIRES_USER_CONFIRMATION]);

/** `fetch` itself can refuse with Play's code in its message ("-15: Asset Pack Download Error(-15)", a sideload): the same words as a FAILED state. */
export function playFetchError(e: unknown): Error {
  const message = e instanceof Error ? e.message : String(e);
  const m = /Asset Pack Download Error\((-?\d+)\)|^(-?\d+):/.exec(message);
  const code = m ? Number(m[1] ?? m[2]) : NaN;
  if (Number.isFinite(code)) return new Error(describePlayError(code), { cause: e });
  return e instanceof Error ? e : new Error(message);
}

export function describePlayError(code: number): string {
  switch (code) {
    case AssetPackErrorCode.INSUFFICIENT_STORAGE:
      return "insufficient-storage";
    case AssetPackErrorCode.NETWORK_ERROR:
      return "network";
    case AssetPackErrorCode.APP_NOT_OWNED:
    case AssetPackErrorCode.UNRECOGNIZED_INSTALLATION:
    case AssetPackErrorCode.PLAY_STORE_NOT_FOUND:
    case AssetPackErrorCode.API_NOT_AVAILABLE:
      return "play-unavailable";
    default:
      return `play-error-${code}`;
  }
}
