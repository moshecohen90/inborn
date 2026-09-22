import { beforeEach, describe, expect, it, vi } from "vitest";
import { droppedPaths, queueDroppedPaths, subscribeDroppedPaths, takeDroppedPaths } from "./dropQueue";

beforeEach(() => void takeDroppedPaths());

describe("the desktop drop hand-off (§8.9, F64)", () => {
  it("queues what was dropped and hands it over exactly once", () => {
    queueDroppedPaths(["/a/one.pdf", "/a/two.pdf"]);
    expect(droppedPaths()).toEqual(["/a/one.pdf", "/a/two.pdf"]);
    expect(takeDroppedPaths()).toEqual(["/a/one.pdf", "/a/two.pdf"]);
    expect(takeDroppedPaths()).toEqual([]);
    expect(droppedPaths()).toEqual([]);
  });

  it("a second drop while the first is still waiting joins the queue", () => {
    queueDroppedPaths(["/a/one.pdf"]);
    queueDroppedPaths(["/a/two.pdf"]);
    expect(takeDroppedPaths()).toEqual(["/a/one.pdf", "/a/two.pdf"]);
  });

  it("the same file dropped twice before the screen drains is one import", () => {
    queueDroppedPaths(["/a/one.pdf"]);
    queueDroppedPaths(["/a/one.pdf", "/a/two.pdf"]);
    expect(takeDroppedPaths()).toEqual(["/a/one.pdf", "/a/two.pdf"]);
  });

  it("tells the screen when something arrived, and when it was taken", () => {
    const seen = vi.fn();
    const off = subscribeDroppedPaths(seen);
    queueDroppedPaths(["/a/one.pdf"]);
    expect(seen).toHaveBeenCalledTimes(1);
    queueDroppedPaths([]);
    expect(seen).toHaveBeenCalledTimes(1);
    takeDroppedPaths();
    expect(seen).toHaveBeenCalledTimes(2);
    off();
    queueDroppedPaths(["/a/two.pdf"]);
    expect(seen).toHaveBeenCalledTimes(2);
  });
});
