/**
 * Which browser routes the model-download door may stand in front of (F293).
 *
 * Only a chat needs a model. The door replaced every route, so a first-time visitor could not read the price list,
 * the legal texts or the proof screen without first taking 1.3 GB — the one screen that has to be reachable before
 * anyone downloads anything was behind the download.
 */
export const MODEL_FREE_ROUTES = ["/paywall", "/settings", "/proof", "/vault", "/legal", "/lock"] as const;

/** Normalises a browser path to its route: no query, no hash, no trailing slash, always leading slash. */
function routeOf(path: string): string {
  const cut = path.split(/[?#]/)[0] ?? "";
  const withSlash = cut.startsWith("/") ? cut : `/${cut}`;
  return withSlash.length > 1 ? withSlash.replace(/\/+$/, "") : "/";
}

/** True when this route cannot be shown without a model, and so may be replaced by the download door. */
export function needsModel(path: string): boolean {
  const route = routeOf(path);
  return !MODEL_FREE_ROUTES.some((r) => route === r || route.startsWith(`${r}/`));
}

/** Screens a visitor may read before onboarding: the price list, the legal texts and the proof the Sealed step links to. */
export const READ_BEFORE_ONBOARDING = ["/paywall", "/legal", "/proof"] as const;

export type WebRoute =
  | { kind: "children" }
  | { kind: "redirect"; to: string }
  | { kind: "model-step" }
  | { kind: "catalog" }
  /* Onboarded, no model, and whether the browser keeps any chat or document is still being read. */
  | { kind: "pending" }
  /* Onboarded, no model and nothing kept: the shell clears `onboarded` and the first-visit rules take over. */
  | { kind: "restart-onboarding" };

const under = (route: string, roots: readonly string[]) => roots.some((r) => route === r || route.startsWith(`${r}/`));

/**
 * What the browser shows for a path (round 103, Moshe 26.9: "I want the whole app experience from the start"). A first
 * visit is onboarding, as on the phone, and the download is its Model step. Sealed and Lock follow a model, so they
 * wait for one. After onboarding, a missing model brings back the Model step alone when the browser still keeps chats or
 * documents, and the whole onboarding when it keeps nothing (F405). `ready` is `webReady()`, `hasSource` whether the
 * catalog offered anything at all, `keeps` whether IndexedDB holds any of the user's data (null until read).
 */
export function webRoute(path: string, s: { ready: boolean; onboarded: boolean; hasSource: boolean; keeps: boolean | null }): WebRoute {
  const route = routeOf(path);
  const gated = !s.ready && needsModel(route);
  if (!s.onboarded) {
    if (under(route, READ_BEFORE_ONBOARDING)) return { kind: "children" };
    /* The chat root sends itself to onboarding in-app (app/index.tsx); every other screen waits for it. */
    if (route === "/") return { kind: "children" };
    if (!under(route, ["/onboarding"])) return { kind: "redirect", to: "/onboarding" };
    if (gated && !s.hasSource) return { kind: "catalog" };
    if (!s.ready && under(route, ["/onboarding/sealed", "/onboarding/lock"])) return { kind: "redirect", to: "/onboarding/model" };
    return { kind: "children" };
  }
  if (!gated) return { kind: "children" };
  if (s.keeps === null) return { kind: "pending" };
  if (!s.keeps) return { kind: "restart-onboarding" };
  return s.hasSource ? { kind: "model-step" } : { kind: "catalog" };
}
