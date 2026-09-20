import { describe, expect, it } from "vitest";
import { joinList, listSeparator } from "../src/list";

const uses = ["Chat", "Summaries", "Voice notes"];

describe("joinList", () => {
  it("joins CJK lists with the ideographic comma", () => {
    expect(joinList("ja", uses)).toBe("Chat、Summaries、Voice notes");
    expect(joinList("zh-Hant", uses)).toBe("Chat、Summaries、Voice notes");
    expect(joinList("zh", uses)).toBe("Chat、Summaries、Voice notes");
  });
  it("keeps the Latin comma for Korean and the Latin locales", () => {
    expect(joinList("ko", uses)).toBe("Chat, Summaries, Voice notes");
    expect(joinList("en", uses)).toBe("Chat, Summaries, Voice notes");
    expect(joinList("de", uses)).toBe("Chat, Summaries, Voice notes");
    expect(joinList("pt-BR", uses)).toBe("Chat, Summaries, Voice notes");
  });
  it("reads the base language of a regional tag and survives an unknown one", () => {
    expect(listSeparator("ja-JP")).toBe("、");
    expect(listSeparator("zh_Hant_TW")).toBe("、");
    expect(listSeparator("")).toBe(", ");
    expect(listSeparator("xx")).toBe(", ");
  });
  it("leaves a single item and an empty list alone", () => {
    expect(joinList("ja", ["Chat"])).toBe("Chat");
    expect(joinList("ja", [])).toBe("");
  });
});
