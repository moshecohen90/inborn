import { describe, expect, it } from "vitest";
import { createBackgroundHold } from "./bgHold";

const fake = () => {
  const began: string[] = [];
  const ended: number[] = [];
  let next = 0;
  return {
    began,
    ended,
    api: {
      begin(name: string) {
        began.push(name);
        return next++;
      },
      end(token: number) {
        ended.push(token);
      },
    },
  };
};

const hold = () => {
  const f = fake();
  return { ...f, sut: createBackgroundHold(f.api, "inborn.answer") };
};

describe("createBackgroundHold", () => {
  it("takes the hold only once the app is both backgrounded and generating", () => {
    const h = hold();
    h.sut.sync(false, true);
    h.sut.sync(true, false);
    expect(h.began).toEqual([]);
    h.sut.sync(true, true);
    expect(h.began).toEqual(["inborn.answer"]);
    expect(h.sut.token()).toBe(0);
  });

  it("does not stack holds while the same answer keeps streaming", () => {
    const h = hold();
    h.sut.sync(true, true);
    h.sut.sync(true, true);
    h.sut.sync(true, true);
    expect(h.began).toEqual(["inborn.answer"]);
    expect(h.ended).toEqual([]);
  });

  it("gives the hold back when the answer ends off-screen", () => {
    const h = hold();
    h.sut.sync(true, true);
    h.sut.sync(true, false);
    expect(h.ended).toEqual([0]);
    expect(h.sut.token()).toBeNull();
  });

  it("gives the hold back when the app comes to the front mid-answer", () => {
    const h = hold();
    h.sut.sync(true, true);
    h.sut.sync(false, true);
    expect(h.ended).toEqual([0]);
    expect(h.sut.token()).toBeNull();
  });

  it("ends nothing when the platform refused the hold", () => {
    const ended: number[] = [];
    const sut = createBackgroundHold({ begin: () => -1, end: (t) => ended.push(t) }, "inborn.answer");
    sut.sync(true, true);
    expect(sut.token()).toBeNull();
    sut.sync(true, false);
    expect(ended).toEqual([]);
  });

  it("asks for no further time in the background episode the OS reclaimed", () => {
    /* Calling beginBackgroundTask again after an expiration, while still off-screen, is how an app gets killed. */
    const h = hold();
    h.sut.sync(true, true);
    h.sut.expire();
    expect(h.ended).toEqual([0]);
    h.sut.sync(true, true);
    expect(h.began).toEqual(["inborn.answer"]);
    expect(h.sut.token()).toBeNull();
  });

  it("holds again for the next answer once the app has been in front", () => {
    const h = hold();
    h.sut.sync(true, true);
    h.sut.expire();
    h.sut.sync(false, false);
    h.sut.sync(true, true);
    expect(h.began).toEqual(["inborn.answer", "inborn.answer"]);
    expect(h.sut.token()).toBe(1);
  });

  it("is safe to expire when nothing is held", () => {
    const h = hold();
    h.sut.expire();
    h.sut.expire();
    expect(h.ended).toEqual([]);
  });
});
