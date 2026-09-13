import { describe, expect, it } from "vitest";
import { CLOSED_MESSAGE, ReopeningHandle, errorChain, isDeadHandleError } from "./reopen";

const dead = () => new Error("Call to function 'NativeDatabase.prepareAsync' has been rejected.", { cause: new Error("java.lang.NullPointerException") });

describe("isDeadHandleError (QA F15)", () => {
  it("recognises the Android closed-handle shapes through the cause chain", () => {
    expect(isDeadHandleError(dead())).toBe(true);
    expect(isDeadHandleError(new Error("Access to closed resource"))).toBe(true);
    expect(isDeadHandleError(new Error("InvalidSharedObjectIdException"))).toBe(true);
  });
  it("leaves SQL and application errors alone", () => {
    expect(isDeadHandleError(new Error("UNIQUE constraint failed: chats.id"))).toBe(false);
    expect(isDeadHandleError(new Error("unknown chat abc"))).toBe(false);
    expect(isDeadHandleError(null)).toBe(false);
  });
  it("errorChain joins the messages of the cause chain", () => {
    expect(errorChain(dead())).toBe("Call to function 'NativeDatabase.prepareAsync' has been rejected. | java.lang.NullPointerException");
  });
});

describe("ReopeningHandle", () => {
  const make = () => {
    let opened = 0;
    const events: unknown[] = [];
    const h = new ReopeningHandle<{ id: number }>({ id: 0 }, async () => ({ id: ++opened }), (e) => events.push(e));
    return { h, events, count: () => opened };
  };

  it("runs on the live handle and never reopens on success", async () => {
    const { h, count } = make();
    expect(await h.run(async (db) => db.id)).toBe(0);
    expect(count()).toBe(0);
  });

  it("reopens once and retries the task from the start on a dead handle", async () => {
    const { h, events, count } = make();
    const seen: number[] = [];
    const out = await h.run(async (db) => {
      seen.push(db.id);
      if (db.id === 0) throw dead();
      return "ok";
    });
    expect(out).toBe("ok");
    expect(seen).toEqual([0, 1]);
    expect(count()).toBe(1);
    expect(events).toHaveLength(1);
    expect(h.get().id).toBe(1);
  });

  it("rethrows other errors without reopening", async () => {
    const { h, count } = make();
    await expect(h.run(async () => Promise.reject(new Error("UNIQUE constraint failed")))).rejects.toThrow("UNIQUE");
    expect(count()).toBe(0);
  });

  it("shares one reopen between concurrent statements on the same dead handle", async () => {
    const { h, count } = make();
    const task = async (db: { id: number }) => {
      if (db.id === 0) throw dead();
      return db.id;
    };
    const results = await Promise.all([h.run(task), h.run(task), h.run(task)]);
    expect(results).toEqual([1, 1, 1]);
    expect(count()).toBe(1);
  });

  it("gives up when the second run fails too, so a real fault still surfaces", async () => {
    const { h, count } = make();
    await expect(h.run(async () => Promise.reject(dead()))).rejects.toThrow("NativeDatabase.prepareAsync");
    expect(count()).toBe(1);
  });

  it("propagates a failed reopen", async () => {
    const h = new ReopeningHandle<number>(0, async () => Promise.reject(new Error("file is not a database")));
    await expect(h.run(async () => Promise.reject(dead()))).rejects.toThrow("not a database");
  });
});

describe("ReopeningHandle close gate (QA F18)", () => {
  type Db = { id: number; closed: boolean };
  const defer = <T,>() => {
    let resolve!: (v: T) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
  const make = () => {
    let opened = 0;
    const closes: number[] = [];
    const h = new ReopeningHandle<Db>({ id: 0, closed: false }, async () => ({ id: ++opened, closed: false }), () => undefined, async (db) => {
      db.closed = true;
      closes.push(db.id);
    });
    return { h, closes, count: () => opened };
  };
  const tick = () => new Promise((r) => setTimeout(r, 0));

  it("close waits for the in-flight statement before closing the handle", async () => {
    const { h, closes } = make();
    const gate = defer<string>();
    const stmt = h.run(() => gate.promise);
    expect(h.inFlightCount).toBe(1);
    const closing = h.close();
    await tick();
    expect(closes).toEqual([]);
    gate.resolve("row");
    expect(await stmt).toBe("row");
    expect(await closing).toEqual({ waitedFor: 1, drained: true });
    expect(closes).toEqual([0]);
    expect(h.inFlightCount).toBe(0);
  });

  it("a statement that arrives during a close waits for it, then rejects as closed and never reopens", async () => {
    const { h, closes, count } = make();
    const gate = defer<void>();
    void h.run(() => gate.promise);
    const closing = h.close();
    const late = h.run(async (db) => db.id);
    await tick();
    expect(closes).toEqual([]);
    gate.resolve();
    await closing;
    await expect(late).rejects.toThrow(CLOSED_MESSAGE);
    expect(count()).toBe(0);
    expect(isDeadHandleError(new Error(CLOSED_MESSAGE))).toBe(false);
  });

  it("closeUnderneath drains, closes the live handle and lets the next statement reopen on it", async () => {
    const { h, closes, count } = make();
    const gate = defer<void>();
    void h.run(() => gate.promise);
    const closing = h.closeUnderneath();
    const seen: number[] = [];
    const next = h.run(async (db) => {
      seen.push(db.id);
      if (db.closed) throw new Error("Access to closed resource");
      return db.id;
    });
    await tick();
    expect(closes).toEqual([]);
    gate.resolve();
    expect(await closing).toEqual({ waitedFor: 1, drained: true });
    expect(await next).toBe(1);
    expect(seen).toEqual([0, 1]);
    expect(count()).toBe(1);
    expect(h.isClosed).toBe(false);
  });

  it("closeUnderneath twice on the same dead handle closes it once", async () => {
    const { h, closes } = make();
    await h.closeUnderneath();
    expect(await h.closeUnderneath()).toEqual({ waitedFor: 0, drained: true });
    expect(closes).toEqual([0]);
    expect(await h.run(async (db) => (db.closed ? Promise.reject(new Error("Access to closed resource")) : db.id))).toBe(1);
    await h.closeUnderneath();
    expect(closes).toEqual([0, 1]);
  });

  it("a close that times out on a hung statement still closes and reports it", async () => {
    const { h, closes } = make();
    const hung = defer<void>();
    const stmt = h.run(() => hung.promise);
    expect(await h.close(5)).toEqual({ waitedFor: 1, drained: false });
    expect(closes).toEqual([0]);
    hung.resolve();
    await stmt;
  });

  it("concurrent closes share one drain and the second close is a no-op", async () => {
    const { h, closes } = make();
    const gate = defer<void>();
    void h.run(() => gate.promise);
    const a = h.close();
    const b = h.close();
    gate.resolve();
    expect(await a).toEqual(await b);
    expect(closes).toEqual([0]);
    expect(await h.close()).toEqual({ waitedFor: 0, drained: true });
  });

  it("a dead-handle failure during a terminal close does not reopen", async () => {
    const { h, count } = make();
    const gate = defer<void>();
    const stmt = h.run(() => gate.promise);
    const closing = h.close();
    gate.reject(dead());
    await expect(stmt).rejects.toThrow(CLOSED_MESSAGE);
    await closing;
    expect(count()).toBe(0);
  });

  it("a close that starts during a reopen waits for it, closes the fresh handle and rejects the retry", async () => {
    const { h, closes } = make();
    let opens = 0;
    const slow = new ReopeningHandle<Db>({ id: 0, closed: false }, () => new Promise((r) => setTimeout(() => r({ id: ++opens, closed: false }), 5)), () => undefined, async (db) => {
      closes.push(db.id);
    });
    const first = slow.run(async (db) => {
      if (db.id === 0) throw dead();
      return db.id;
    });
    await tick();
    const closing = slow.close();
    await expect(first).rejects.toThrow(CLOSED_MESSAGE);
    await closing;
    expect(opens).toBe(1);
    expect(closes).toEqual([1]);
    void h;
  });
});
