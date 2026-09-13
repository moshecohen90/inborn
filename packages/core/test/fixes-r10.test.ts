import { describe, expect, it } from "vitest";
import { guardVaultAction, type VaultAction } from "../src/work/vault";

const ACTIONS: VaultAction[] = ["open", "move-in", "move-out", "rename", "delete", "unvault", "change-code"];

describe("guardVaultAction (QA F17, §7.8)", () => {
  it("a plain folder allows everything", () => {
    for (const a of ACTIONS) expect(guardVaultAction({ isVault: false, isOpen: false }, a)).toBe("allow");
  });
  it("an open vault allows everything", () => {
    for (const a of ACTIONS) expect(guardVaultAction({ isVault: true, isOpen: true }, a)).toBe("allow");
  });
  it("a locked vault asks for the code before any read or change, including Unvault", () => {
    for (const a of ACTIONS.filter((x) => x !== "move-in")) expect(guardVaultAction({ isVault: true, isOpen: false }, a)).toBe("verify");
  });
  it("a locked vault refuses a move in outright", () => {
    expect(guardVaultAction({ isVault: true, isOpen: false }, "move-in")).toBe("deny");
  });
});
