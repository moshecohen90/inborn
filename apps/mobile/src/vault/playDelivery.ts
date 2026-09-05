import { File } from "expo-file-system";
import { modelParts, type CatalogModel, type InstallEvent } from "@inborn/core";
import { AssetPackErrorCode, AssetPackStatus, addPackListener, cancelPack, fetchPack, getPackPath, getPackState, hasAssetPacks, removePack, showPackConfirmation, type AssetPackState } from "../../modules/asset-packs";
import type { DeliveryPlan, ModelDelivery } from "./delivery";

const packOf = (model: CatalogModel) => model.delivery.find((d) => d.kind === "play-asset-pack");

/** Play Asset Delivery: Play downloads (cellular consent, resume, retries are Play's), the app only shows state (spec §5.1, S32). */
export class PlayDelivery implements ModelDelivery {
  plan(model: CatalogModel): DeliveryPlan | null {
    return packOf(model) && hasAssetPacks() ? { via: "play", origin: "Google Play", bytes: model.bytes } : null;
  }

  locate(model: CatalogModel): string | null {
    const pack = packOf(model);
    const dir = pack ? getPackPath(pack.pack) : null;
    if (!pack || !dir) return null;
    /* Pack assets carry the catalog file names, so the same part list serves Play, HTTPS and the boot scan. */
    const all = modelParts(model).every((p) => new File(`file://${dir}`, p.file).exists);
    return all ? new File(`file://${dir}`, pack.file).uri : null;
  }

  async deliver(model: CatalogModel, emit: (e: InstallEvent) => void): Promise<string> {
    const pack = packOf(model);
    if (!pack) throw new Error(`${model.id} has no Play pack`);
    const located = this.locate(model);
    if (located) return located;
    return new Promise<string>((resolve, reject) => {
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
            emit({ type: "progress", bytes: s.bytesDownloaded, total: s.totalBytes || model.bytes });
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
            const path = this.locate(model);
            done(() => (path ? resolve(path) : reject(new Error(`pack ${pack.pack} completed but ${pack.file} is missing`))));
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
    const pack = packOf(model);
    if (pack) cancelPack(pack.pack);
  }

  async remove(model: CatalogModel): Promise<void> {
    const pack = packOf(model);
    if (pack) await removePack(pack.pack);
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
