import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { commitEdit } from "../../../scripts/lib/play-api.mjs";

/**
 * vc22 uploaded 5.1 GB, then Play refused the commit with 400 "Some of the Android App Bundle uploads are not
 * completed yet" because it was still ingesting the bundle. The caller deleted the edit on that error, so the whole
 * upload was discarded and had to be repeated. `commitEdit` waits for exactly that message and nothing else.
 */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_SCRIPT = path.resolve(HERE, "../../../scripts/play-upload.mjs");
const INGESTING = 'POST /com.inbornapp.mobile/edits/1:commit → 400\n{ "error": { "code": 400, "message": "Some of the Android App Bundle uploads are not completed yet.", "status": "INVALID_ARGUMENT" } }';

const fakeApi = (failures: number, message = INGESTING) => {
  const calls: string[] = [];
  return {
    calls,
    post: async (url: string) => {
      calls.push(url);
      if (calls.length <= failures) throw new Error(message);
      return { id: "committed-1" };
    },
    del: async (url: string) => {
      calls.push(`DELETE ${url}`);
      return {};
    },
  };
};

describe("commitEdit", () => {
  it("retries the commit while Play is still ingesting the bundle, and never deletes the edit", async () => {
    const api = fakeApi(3);
    const waits: number[] = [];
    const r = await commitEdit(api, "com.inbornapp.mobile", "1", { tries: 20, waitMs: 60_000, sleep: (ms: number) => (waits.push(ms), Promise.resolve()) });
    expect(r).toEqual({ id: "committed-1" });
    expect(api.calls).toHaveLength(4);
    expect(api.calls.every((c) => c.endsWith("/edits/1:commit"))).toBe(true);
    expect(api.calls.some((c) => c.startsWith("DELETE"))).toBe(false);
    expect(waits).toEqual([60_000, 60_000, 60_000]);
  });

  it("commits on the first attempt when Play is ready, with no wait", async () => {
    const api = fakeApi(0);
    const waits: number[] = [];
    await commitEdit(api, "com.inbornapp.mobile", "1", { sleep: (ms: number) => (waits.push(ms), Promise.resolve()) });
    expect(api.calls).toHaveLength(1);
    expect(waits).toEqual([]);
  });

  it("does NOT retry any other error — a deleted edit or a rejected bundle fails at once", async () => {
    const api = fakeApi(1, 'POST /edits/1:commit → 400\n{ "error": { "message": "This Edit has been deleted.", "status": "FAILED_PRECONDITION" } }');
    const waits: number[] = [];
    await expect(commitEdit(api, "com.inbornapp.mobile", "1", { sleep: (ms: number) => (waits.push(ms), Promise.resolve()) })).rejects.toThrow(/has been deleted/);
    expect(api.calls).toHaveLength(1);
    expect(waits).toEqual([]);
  });

  it("gives up after `tries` attempts instead of waiting for ever", async () => {
    const api = fakeApi(99);
    await expect(commitEdit(api, "com.inbornapp.mobile", "1", { tries: 3, sleep: () => Promise.resolve() })).rejects.toThrow(/not completed yet/);
    expect(api.calls).toHaveLength(3);
  });

  it("play-upload.mjs commits through commitEdit, not through a bare api.post", () => {
    const src = readFileSync(UPLOAD_SCRIPT, "utf8");
    expect(src).toContain("commitEdit(api, pkg, edit.id");
    expect(src).not.toMatch(/api\.post\(`\$\{API\}\/\$\{pkg\}\/edits\/\$\{edit\.id\}:commit`/);
  });
});
