import { describe, expect, it } from "vitest";
import { dispatchViewportResize } from "./viewportResize";

const scope = (withVisualViewport: boolean) => {
  const seen: string[] = [];
  return {
    seen,
    scope: {
      visualViewport: withVisualViewport ? { dispatchEvent: (e: unknown) => (seen.push(`visualViewport:${String(e)}`), true) } : null,
      dispatchEvent: (e: unknown) => (seen.push(`window:${String(e)}`), true),
    },
  };
};

describe("viewport resize bridge (F48)", () => {
  it("sends the event to visualViewport, the only target react-native-web subscribes when it exists", () => {
    const { seen, scope: s } = scope(true);
    dispatchViewportResize(s, "resize");
    expect(seen).toEqual(["visualViewport:resize"]);
  });

  it("falls back to the window when the browser has no visual viewport, the other half of that branch", () => {
    const { seen, scope: s } = scope(false);
    dispatchViewportResize(s, "resize");
    expect(seen).toEqual(["window:resize"]);
  });

  it("never notifies both, which would run Dimensions twice per resize", () => {
    for (const withVv of [true, false]) {
      const { seen, scope: s } = scope(withVv);
      dispatchViewportResize(s, "resize");
      expect(seen).toHaveLength(1);
    }
  });
});
