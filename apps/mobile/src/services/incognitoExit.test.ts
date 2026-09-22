import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ChatStore.endSession() and the library's shipped for a year with no production caller, so incognito chats and
 * their documents survived in RAM for the whole app run. AppServices is the only place that knows the session
 * ended, and it cannot be rendered in node; this asserts the wiring, which is what was missing.
 */
const services = readFileSync(join(__dirname, "AppServices.tsx"), "utf8");
const closeActive = services.slice(services.indexOf("const closeActive"), services.indexOf("const value = useMemo"));

describe("leaving an incognito chat ends the session (spec §5.7, F70/F71)", () => {
  it("the exit ends both sessions: the chats in RAM and the documents in RAM", () => {
    expect(closeActive).toContain("store.endSession()");
    expect(closeActive).toContain("getLibrary().endSession()");
  });

  it("it does nothing when the chat being left was a saved one", () => {
    expect(closeActive).toMatch(/if \(!a\.incognito\) return;/);
  });

  it("a share-in during an incognito session stays incognito", () => {
    const openShared = services.slice(services.indexOf("openShared: (payload)"), services.indexOf("seedConsumed:"));
    expect(openShared).toContain("incognito: a.incognito");
    expect(openShared).not.toContain("incognito: false");
  });

  it("every path that leaves a chat goes through that one exit", () => {
    for (const action of ["openChat: (chat)", "newChat: (incognito, personaId)", "openShared: (payload)"]) {
      const at = services.indexOf(action);
      expect(at, action).toBeGreaterThan(0);
      expect(services.slice(at, at + 400), action).toContain("closeActive(booted.store, a)");
    }
  });
});
