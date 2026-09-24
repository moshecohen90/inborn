import { ALLOWED_MODEL_HOSTS } from "@inborn/core";
import { classifyDevice, readDeviceSignals, type DeviceGate } from "./deviceGate";
import { WebModelDelivery, fetchManifest, pickModel, type CatalogError, type WebModelSource } from "./modelDelivery";
import { modelStatus, opfsSupported, readyModelStatus, type ModelStatus } from "./opfs";
import { chromePromptApiAvailable } from "./chromeNano";
import { readEnginePref, type WebEngine } from "./prefs";

/** Everything the web tier decides before the first screen: gate, which model, whether it is already on this device. */
export interface WebBoot {
  gate: DeviceGate;
  engine: WebEngine;
  chromePromptApi: boolean;
  opfs: boolean;
  source: WebModelSource | null;
  /** Set when the catalog could not be read at all: a browser with no model and a browser with no catalog are not the same screen. */
  catalogError: CatalogError | null;
  status: ModelStatus;
}

export const delivery = new WebModelDelivery();

let boot: WebBoot | null = null;
let pending: Promise<WebBoot> | null = null;

/** Catalog hosts allowed besides our own origin (spec §5.1 allowlist), from the one list the native tiers also use. */
export const ALLOWED_MODEL_ORIGINS: readonly string[] = ALLOWED_MODEL_HOSTS.map((h) => `https://${h}`);

export function webBoot(): WebBoot {
  if (!boot) throw new Error("web boot not awaited; call prepareWebBoot() first");
  return boot;
}

export function prepareWebBoot(): Promise<WebBoot> {
  pending ??= (async () => {
    const gate = classifyDevice(readDeviceSignals());
    const engine = readEnginePref();
    const chromePromptApi = chromePromptApiAvailable();
    const opfs = opfsSupported();
    const catalog = await fetchManifest([...ALLOWED_MODEL_ORIGINS]);
    const source = pickModel(catalog.models, gate.maxTier) ?? null;
    const status: ModelStatus = source && opfs ? await modelStatus(source.file) : { kind: "missing" };
    boot = { gate, engine: chromePromptApi ? engine : "wllama", chromePromptApi, opfs, source, catalogError: catalog.error, status };
    return boot;
  })();
  return pending;
}

/** After a finished download: re-read the file state so createEngine() sees the model, waiting out the OPFS publish before giving a verdict. */
export async function settleModelStatus(): Promise<ModelStatus> {
  const b = webBoot();
  b.status = b.source ? await readyModelStatus(b.source.file) : { kind: "missing" };
  return b.status;
}

/**
 * True when the chat can start now: a verified model on disk, or the user chose Chrome's engine. A browser the
 * catalog never reached is not ready — it used to pass straight through to a chat with no model at all (B1).
 */
export const webReady = (b: WebBoot): boolean => b.engine === "chrome-nano" || b.status.kind === "ready" || (b.source === null && !b.catalogError);
