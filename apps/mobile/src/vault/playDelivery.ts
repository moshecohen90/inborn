import { Directory, File, Paths } from "expo-file-system";
import { modelParts, type CatalogModel, type Delivery, type InstallEvent } from "@inborn/core";
import { AssetPackErrorCode, AssetPackStatus, addPackListener, cancelPack, fetchPack, getPackPath, getPackState, hasAssetPacks, linkInto, removePack, showPackConfirmation, type AssetPackState } from "../../modules/asset-packs";
import { isPlayUnavailable, type DeliveryPlan, type ModelDelivery } from "./delivery";

type PlayPack = Extract<Delivery, { kind: "play-asset-pack" }>;

/** One pack per shard (Play caps a pack at 1.5 GB, spec §5.1); a single-file model has exactly one. */
const packsOf = (model: CatalogModel): PlayPack[] => model.delivery.filter((d): d is PlayPack => d.kind === "play-asset-pack");

/** Play Asset Delivery: Play downloads (cellular consent, resume, retries are Play's), the app only shows state (spec §5.1, S32). */
export class PlayDelivery implements ModelDelivery {
  /* Once Play has refused to bind, every pack on this device is out of reach for this run: the vault offers import instead of a dead Install. */
  private unavailable = false;

  plan(model: CatalogModel): DeliveryPlan | null {
    return !this.unavailable && packsOf(model).length && hasAssetPacks() ? { via: "play", origin: "Google Play", bytes: model.bytes } : null;
  }

  locate(model: CatalogModel): string | null {
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

  async deliver(model: CatalogModel, emit: (e: InstallEvent) => void): Promise<string> {
    try {
      return await this.deliverPacks(model, emit);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      if (!isPlayUnavailable(message)) throw e;
      this.unavailable = true;
      throw new Error("play-unavailable", { cause: e });
    }
  }

  private async deliverPacks(model: CatalogModel, emit: (e: InstallEvent) => void): Promise<string> {
    const packs = packsOf(model);
    if (!packs.length) throw new Error(`${model.id} has no Play pack`);
    const located = this.locate(model);
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
      await this.fetchOne(pack, bytes, (b) => emit({ type: "progress", bytes: done + b, total: model.bytes }), emit);
      done += bytes;
    }
    const path = this.locate(model);
    if (!path) throw new Error(`packs for ${model.id} completed but a shard is missing`);
    return path;
  }

  private fetchOne(pack: PlayPack, bytes: number, progress: (bytes: number) => void, emit: (e: InstallEvent) => void): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const done = (fn: () => void) => {
        if (settled) return;
        settled = true;
        sub.remove();
        fn();
      };
      const onState = (s: AssetPackState) => {
        if (s.name !== pack.pack) return;
        switch (s.status) {
          case AssetPackStatus.PENDING:
          case AssetPackStatus.DOWNLOADING:
          case AssetPackStatus.TRANSFERRING:
            progress(Math.min(s.bytesDownloaded, bytes));
            return;
          case AssetPackStatus.WAITING_FOR_WIFI:
            emit({ type: "waiting-for-wifi" });
            return;
          case AssetPackStatus.REQUIRES_USER_CONFIRMATION:
            emit({ type: "needs-confirmation" });
            void showPackConfirmation().then((r) => {
              if (r === 0) done(() => reject(new Error("canceled")));
            });
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
        .catch((e: unknown) => done(() => reject(e instanceof Error ? e : new Error(String(e)))));
    });
  }

  async pause(): Promise<void> {
    /* Play has no pause; the user cancels and asks again, Play keeps what it already fetched. */
  }

  async cancel(model: CatalogModel): Promise<void> {
    for (const pack of packsOf(model)) cancelPack(pack.pack);
  }

  async remove(model: CatalogModel): Promise<void> {
    for (const pack of packsOf(model)) await removePack(pack.pack);
    try {
      new Directory(Paths.document, "assetpacks-joined", model.id).delete();
    } catch {
      /* never linked */
    }
  }
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
