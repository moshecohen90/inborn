import { ALLOWED_MODEL_HOSTS } from "@inborn/core";
import { classifyDevice, readDeviceSignals, type DeviceGate } from "./deviceGate";
import { WebModelDelivery, fetchManifest, type CatalogError, type WebModelSource } from "./modelDelivery";
import { chosenSource, webModelChoices, type WebModelChoice } from "./modelChoice";
import { modelStatus, opfsSupported, readyModelStatus, type ModelStatus } from "./opfs";
import { chromePromptApiAvailable } from "./chromeNano";
import { readEnginePref, readModelPref, writeModelPref, type WebEngine } from "./prefs";
import { bootLanguage } from "./language";

/** Everything the web tier decides before the first screen: gate, which model, whether it is already on this device. */
export interface WebBoot {
  gate: DeviceGate;
  engine: WebEngine;
  chromePromptApi: boolean;
  opfs: boolean;
  /** Every model this browser can install, best first; the door, the vault and onboarding all read this one list. */
  choices: WebModelChoice[];
  /** The chosen one (the reader's pick, else the recommendation): what the engine loads and the door offers. */
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
    const offered = webModelChoices({ sources: catalog.models, gate, languageCode: bootLanguage() });
    /* Which of the offered files this browser already holds: the badge on the cards, and the door's own state. */
    const statuses = opfs ? await Promise.all(offered.map((c) => modelStatus(c.source.file))) : offered.map((): ModelStatus => ({ kind: "missing" }));
    const choices = offered.map((c, i) => ({ ...c, installed: statuses[i]!.kind === "ready" }));
    const source = chosenSource(choices, readModelPref());
    const at = choices.findIndex((c) => c.source.id === source?.id);
    const status: ModelStatus = at >= 0 ? statuses[at]! : { kind: "missing" };
    boot = { gate, engine: chromePromptApi ? engine : "wllama", chromePromptApi, opfs, choices, source, catalogError: catalog.error, status };
    return boot;
  })();
  return pending;
}

/**
 * The reader picked another model. It is remembered for the next visits and becomes what this page offers and
 * loads; the caller reloads when an engine is already up, because the engine is chosen once per page load.
 */
export async function chooseWebModel(id: string): Promise<WebModelSource | null> {
  const b = webBoot();
  const choice = b.choices.find((c) => c.source.id === id);
  if (!choice) return null;
  writeModelPref(id);
  b.source = choice.source;
  /* Its own state, not the last model's: the pick may be complete already, or half-downloaded and resumable. */
  b.status = b.opfs ? await modelStatus(choice.source.file) : { kind: "missing" };
  return choice.source;
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
