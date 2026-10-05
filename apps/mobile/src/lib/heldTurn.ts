import type { PickedImage } from "../images";

/* A model switch remounts the chat on phones and reloads the page on the web, so a held photo turn waits here. */
export interface HeldTurn {
  model: string;
  text: string;
  images: PickedImage[];
  /** The files the draft chat had attached; a switch opens a new chat that would otherwise start without them. */
  docIds?: string[];
}

const KEY = "inborn.heldTurn";
let held: HeldTurn | null = null;

const session = (): Storage | null => {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
};

/** False when a page reload would lose it: the browser refused to store it. */
export function stashHeldTurn(turn: HeldTurn): boolean {
  held = turn;
  const store = session();
  if (!store) return true;
  try {
    store.setItem(KEY, JSON.stringify(turn));
    return true;
  } catch {
    return false;
  }
}

export function takeHeldTurn(model: string): HeldTurn | null {
  let turn = held;
  if (!turn) {
    try {
      const raw = session()?.getItem(KEY);
      turn = raw ? (JSON.parse(raw) as HeldTurn) : null;
    } catch {
      turn = null;
    }
  }
  if (!turn || turn.model !== model) return null;
  held = null;
  try {
    session()?.removeItem(KEY);
  } catch {
    /* nothing kept */
  }
  return turn;
}
