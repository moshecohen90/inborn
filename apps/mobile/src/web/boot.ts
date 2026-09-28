import { ALLOWED_MODEL_HOSTS } from "@inborn/core";
import { classifyDevice, readDeviceSignals, type DeviceGate } from "./deviceGate";
import { WebModelDelivery, fetchManifest, type CatalogError, type WebModelSource } from "./modelDelivery";
import type { RoomNote, StorageRoom } from "@inborn/core";
import { chosenSource, webModelChoices, webRoom, webRoomNote, type WebModelChoice } from "./modelChoice";
import { deleteModel, inventoryStatus, modelStatus, opfsInventory, opfsSupported, readyModelStatus, storageEstimate, type ModelStatus, type OpfsInventory } from "./opfs";
import { chromePromptApiAvailable } from "./chromeNano";
import { readEnginePref, readModelPref, writeModelPref, type WebEngine } from "./prefs";
import { removable, storedState, type StoredState } from "./storedModels";
import { markSheetReopen, saveDoorReturn, type DoorReturn } from "./doorReturn";
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
  /** Every offered model's file in this browser's storage, from one OPFS walk; `choices[].installed` and `status` are read from it. */
  stored: ReadonlyMap<string, ModelStatus>;
  /** Free space when the page loaded: the ranking behind `choices` read it, and the sheet must read the same. */
  room: StorageRoom | null;
  /** Set when that space, and nothing else, made the recommendation a smaller model. */
  roomNote: RoomNote | null;
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
    const languageCode = bootLanguage();
    const sources = catalog.models;
    /* Which of the served files this browser already holds: the badge on the cards, the door's own state, and no room needed. */
    const inventory = opfs ? await opfsInventory(navigator.storage).catch(() => null) : null;
    const statuses = opfs ? await Promise.all(sources.map((s) => (inventory ? inventoryStatus(inventory, s.file) : modelStatus(s.file)))) : sources.map((): ModelStatus => ({ kind: "missing" }));
    const room = webRoom(await storageEstimate(), sources, statuses);
    const statusOf = new Map(sources.map((s, i) => [s.id, statuses[i]!]));
    const offered = webModelChoices({ sources, gate, languageCode, room });
    const choices = offered.map((c) => ({ ...c, installed: statusOf.get(c.source.id)?.kind === "ready" }));
    const source = chosenSource(choices, readModelPref());
    const status: ModelStatus = (source && statusOf.get(source.id)) || { kind: "missing" };
    const roomNote = webRoomNote({ sources, gate, languageCode, room });
    boot = { gate, engine: chromePromptApi ? engine : "wllama", chromePromptApi, opfs, choices, source, catalogError: catalog.error, status, stored: statusOf, room, roomNote };
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

/** What the vault, the Model sheet and the door say about one offered model: in use, installed, half-downloaded or not here. */
export function webStoredState(b: WebBoot, id: string): StoredState {
  const choice = b.choices.find((c) => c.source.id === id);
  return storedState(b.stored.get(id) ?? { kind: "missing" }, choice?.source.bytes ?? 0, b.engine !== "chrome-nano" && b.source?.id === id);
}

function applyInventory(b: WebBoot, inventory: OpfsInventory): void {
  const stored = new Map(b.choices.map((c) => [c.source.id, inventoryStatus(inventory, c.source.file)]));
  b.stored = stored;
  b.choices = b.choices.map((c) => ({ ...c, installed: stored.get(c.source.id)?.kind === "ready" }));
  if (b.source) b.status = stored.get(b.source.id) ?? b.status;
}

const storedListeners = new Set<() => void>();

export function onStoredModels(fn: () => void): () => void {
  storedListeners.add(fn);
  return () => void storedListeners.delete(fn);
}

/** Re-walks OPFS after a download or a removal, so every screen prints what is on disk now and not what the page found at load. */
export async function refreshStoredModels(): Promise<void> {
  const b = webBoot();
  if (!b.opfs) return;
  const inventory = await opfsInventory(navigator.storage).catch(() => null);
  if (!inventory) return;
  applyInventory(b, inventory);
  for (const fn of storedListeners) fn();
}

/** Frees a model the page does not run: the GGUF and its sidecars go; photo packs stay, they have their own Remove. */
export async function removeWebModel(id: string): Promise<boolean> {
  const b = webBoot();
  const choice = b.choices.find((c) => c.source.id === id);
  if (!choice || !removable(webStoredState(b, id))) return false;
  await deleteModel(choice.source.file);
  await refreshStoredModels();
  return true;
}

/**
 * The Model sheet or the vault took another model. One this browser holds loads at once; one it does not opens the
 * door, which remembers the screen and the model the reader came from so its back arrow can return there.
 */
export async function switchWebModel(id: string, from: Omit<DoorReturn, "prev">): Promise<void> {
  const prev = webBoot().source?.id ?? null;
  if (!(await chooseWebModel(id))) return;
  saveDoorReturn(webBoot().status.kind === "ready" ? null : { ...from, prev });
  location.assign("/");
}

/** The door's back arrow: the previous model is the pick again, and the page goes back to where the reader was. */
export function leaveDoor(back: DoorReturn): void {
  if (back.prev) writeModelPref(back.prev);
  saveDoorReturn(null);
  if (back.sheet) markSheetReopen();
  location.assign(back.to);
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
