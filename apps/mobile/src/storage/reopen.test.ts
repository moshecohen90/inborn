import { describe, expect, it } from "vitest";
import { ReopeningHandle, errorChain, isDeadHandleError } from "./reopen";

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
