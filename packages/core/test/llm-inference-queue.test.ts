import { describe, expect, it } from "vitest";
import { InferenceQueue, QueuedAbortError, isQueuedAbort } from "../src/index";

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

/** A stand-in for the one native context: it records overlap, which is exactly the crash the queue prevents. */
function context() {
  let inside = 0;
  let overlapped = false;
  const order: string[] = [];
  return {
    order,
    get overlapped() {
      return overlapped;
    },
    async run(name: string, steps = 3): Promise<void> {
      inside++;
      if (inside > 1) overlapped = true;
      order.push(`start:${name}`);
      for (let i = 0; i < steps; i++) await tick();
      order.push(`end:${name}`);
      inside--;
    },
  };
}

describe("inference queue (spec §10.3 case 23): one generation at a time on one context", () => {
  it("without the queue two calls overlap on the same context", async () => {
    const ctx = context();
    await Promise.all([ctx.run("a"), ctx.run("b")]);
    expect(ctx.overlapped).toBe(true);
  });

  it("serializes concurrent turns in the order they asked, and never overlaps", async () => {
    const q = new InferenceQueue();
    const ctx = context();
    const turn = async (name: string) => {
      const release = await q.acquire();
      try {
        await ctx.run(name);
      } finally {
        release();
      }
    };
    await Promise.all([turn("chat"), turn("documents"), turn("quick-action")]);
    expect(ctx.overlapped).toBe(false);
    expect(ctx.order).toEqual(["start:chat", "end:chat", "start:documents", "end:documents", "start:quick-action", "end:quick-action"]);
    expect(q.depth).toBe(0);
    expect(q.busy).toBe(false);
  });

  it("counts what is waiting and what is running", async () => {
    const q = new InferenceQueue();
    const first = await q.acquire();
    expect(q.busy).toBe(true);
    expect(q.depth).toBe(1);
    const second = q.acquire();
    const third = q.acquire();
    await tick();
    expect(q.waiting).toBe(2);
    expect(q.depth).toBe(3);
    first();
    (await second)();
    (await third)();
    expect(q.depth).toBe(0);
  });

  it("a turn cancelled while it waits never reaches the context, and the ones behind it still run", async () => {
    const q = new InferenceQueue();
    const ctx = context();
    const release = await q.acquire();
    const ac = new AbortController();
    const cancelled = q.acquire(ac.signal).then(
      () => "ran",
      (e: unknown) => (isQueuedAbort(e) ? "cancelled" : "other"),
    );
    const behind = q.acquire().then(async (r) => {
      await ctx.run("behind");
      r();
      return "ran";
    });
    await tick();
    ac.abort();
    expect(await cancelled).toBe("cancelled");
    release();
    expect(await behind).toBe("ran");
    expect(ctx.order).toEqual(["start:behind", "end:behind"]);
    expect(q.depth).toBe(0);
  });

  it("refuses a turn whose signal is already aborted, without waiting for the queue", async () => {
    const q = new InferenceQueue();
    await expect(q.acquire(AbortSignal.abort())).rejects.toBeInstanceOf(QueuedAbortError);
    expect(q.depth).toBe(0);
  });

  it("a failed turn does not wedge the queue", async () => {
    const q = new InferenceQueue();
    const release = await q.acquire();
    const next = q.acquire();
    release();
    const second = await next;
    second();
    expect(q.depth).toBe(0);
    const third = await q.acquire();
    third();
    expect(q.depth).toBe(0);
  });

  it("releasing twice does not hand the context to two turns at once", async () => {
    const q = new InferenceQueue();
    const release = await q.acquire();
    release();
    release();
    expect(q.depth).toBe(0);
    const again = await q.acquire();
    expect(q.busy).toBe(true);
    again();
  });
});
