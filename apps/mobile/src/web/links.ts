/** The marketing site (spec §13.4) is a separate origin; these are only links, never a fetch. */
export const GET_APP_URL = "https://inbornapp.com/";

/** Where a browser reader goes to buy. Each points at the site's download page until that store listing is live. */
export const STORE_LINKS: Readonly<Record<"appStore" | "play" | "desktop", string>> = {
  appStore: `${GET_APP_URL}download`,
  play: `${GET_APP_URL}download`,
  desktop: `${GET_APP_URL}download`,
};
