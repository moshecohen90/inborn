export type WebEngine = "wllama" | "chrome-nano";
const ENGINE_KEY = "inborn.web.engine";

/** Web-only preferences in localStorage: the engine switch (spec §14.3). Off (wllama) unless the user opted in. */
export function readEnginePref(): WebEngine {
  try {
    return localStorage.getItem(ENGINE_KEY) === "chrome-nano" ? "chrome-nano" : "wllama";
  } catch {
    return "wllama";
  }
}

export function writeEnginePref(engine: WebEngine): void {
  try {
    if (engine === "wllama") localStorage.removeItem(ENGINE_KEY);
    else localStorage.setItem(ENGINE_KEY, engine);
  } catch {
    /* storage refused: the choice lasts for this page load only */
  }
}
