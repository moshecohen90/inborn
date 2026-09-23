import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { COMPARE_ROWS, COMPARE_TIERS, PAYWALL_REASONS, can, compareCell, compareRowShips, limits, paywallFor, reasonOf, type Feature } from "../src/licence";

const en = JSON.parse(readFileSync(join(__dirname, "../../i18n/locales/en.json"), "utf8")) as Record<string, string>;

describe("Free / Pro / Work table (§7.3)", () => {
  it("every row ships in this build, so the table promises nothing we do not have", () => {
    for (const row of COMPARE_ROWS) expect(compareRowShips(row), row.id).toBe(true);
  });
  it("every row and column has an en.json label", () => {
    expect(COMPARE_ROWS.map((r) => r.id).filter((id) => !(`paywall.compare.row.${id}` in en))).toEqual([]);
    for (const k of ["title", "free", "pro", "work", "yes", "no", "unlimited"]) expect(`paywall.compare.${k}` in en, k).toBe(true);
  });
  it("row ids are unique", () => {
    expect(new Set(COMPARE_ROWS.map((r) => r.id)).size).toBe(COMPARE_ROWS.length);
  });
  it("shows the three tiers in Free → Pro → Work order", () => {
    expect(COMPARE_TIERS).toEqual(["free", "pro", "work"]);
  });
  it("a cell never contradicts the gate the screens ask", () => {
    for (const row of COMPARE_ROWS) {
      for (const tier of COMPARE_TIERS) {
        const cell = compareCell(row, tier);
        if (row.kind === "feature") expect(cell.kind === "yes", `${row.id}/${tier}`).toBe(can(tier, row.feature));
        if (row.kind === "limit") expect(cell.kind === "unlimited" ? Infinity : (cell as { n: number }).n).toBe(limits(tier)[row.limit]);
        if (row.kind === "always") expect(cell).toEqual({ kind: "yes" });
      }
    }
  });
  it("names the Free limits the spec decided: one file per chat, three personas, one photo", () => {
    expect(compareCell(COMPARE_ROWS.find((r) => r.id === "files")!, "free")).toEqual({ kind: "count", n: 1 });
    expect(compareCell(COMPARE_ROWS.find((r) => r.id === "personas")!, "free")).toEqual({ kind: "count", n: 3 });
    expect(compareCell(COMPARE_ROWS.find((r) => r.id === "photos")!, "free")).toEqual({ kind: "count", n: 1 });
    expect(compareCell(COMPARE_ROWS.find((r) => r.id === "files")!, "pro")).toEqual({ kind: "unlimited" });
  });
  it("Work is worth its column: rows Pro does not have", () => {
    const workOnly = COMPARE_ROWS.filter((r) => compareCell(r, "work").kind === "yes" && compareCell(r, "pro").kind === "no");
    expect(workOnly.map((r) => r.id)).toEqual(["vaults", "redaction", "office", "audit", "signed"]);
  });
});

describe("why the paywall opened", () => {
  it("a feature moment carries its own feature as the reason", () => {
    expect(reasonOf({ kind: "feature", feature: "memory" })).toBe("memory");
    expect(reasonOf({ kind: "document", existing: 1 })).toBe("document");
    expect(reasonOf({ kind: "persona", existing: 3 })).toBe("persona");
    expect(reasonOf({ kind: "model", proOnly: true })).toBe("model");
  });
  /* F201: three features are the same refusal as a moment; they shipped the same sentence twice in every locale. */
  it("a feature that is the same refusal as a moment answers with the moment's reason", () => {
    expect(reasonOf({ kind: "feature", feature: "unlimitedPersonas" })).toBe("persona");
    expect(reasonOf({ kind: "feature", feature: "proModels" })).toBe("model");
    expect(reasonOf({ kind: "feature", feature: "officeIngest" })).toBe("office");
    for (const f of ["unlimitedPersonas", "proModels", "officeIngest"] as const) expect(PAYWALL_REASONS).not.toContain(f);
  });
  it("no two reasons ship the same sentence, so there is nothing to drift", () => {
    const byText = new Map<string, string[]>();
    for (const r of PAYWALL_REASONS) {
      const text = (en as Record<string, string>)[`paywall.why.${r}`]!;
      byText.set(text, [...(byText.get(text) ?? []), r]);
    }
    expect([...byText.values()].filter((rs) => rs.length > 1)).toEqual([]);
  });
  it("every reason a screen can raise has a one-line why in en.json", () => {
    expect(PAYWALL_REASONS.filter((r) => !(`paywall.why.${r}` in en))).toEqual([]);
  });
  it("carries no reason for a capability this build does not ship", () => {
    expect(PAYWALL_REASONS).not.toContain("neuralVoices");
    expect(PAYWALL_REASONS).not.toContain("professionPacks");
  });
  it("every reason is one a Free user can actually meet", () => {
    for (const r of PAYWALL_REASONS) {
      if (r === "document") expect(paywallFor("free", { kind: "document", existing: 1 })).toBe(true);
      else if (r === "persona") expect(paywallFor("free", { kind: "persona", existing: 3 })).toBe(true);
      else if (r === "model") expect(paywallFor("free", { kind: "model", proOnly: true })).toBe(true);
      else if (r === "office" || r === "photos") expect(limits("free").filesPerChat).toBeLessThan(Infinity);
      else expect(paywallFor("free", { kind: "feature", feature: r as Feature }), r).toBe(true);
    }
  });
});
