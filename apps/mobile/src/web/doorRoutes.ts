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
