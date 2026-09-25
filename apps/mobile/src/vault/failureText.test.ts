import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { installErrorKind } from "@inborn/core";
import { installFailureText } from "./failureText";

const locales = join(__dirname, "../../../../packages/i18n/locales");
const load = (f: string) => JSON.parse(readFileSync(join(locales, f), "utf8")) as Record<string, string>;
const tFor =
  (dict: Record<string, string>) =>
  (key: string, options?: Record<string, unknown>): string =>
    (dict[key] ?? key).replace(/\{(\w+)\}/g, (_, k: string) => String(options?.[k] ?? `{${k}}`));

/* Raw texts seen on real stacks: the iOS one is the A12 screenshot of the ios-image-repro run (F349). */
const RAW = {
  ios: "UnableToDownloadException: Unable to download a file: unknown error (at ExpoFileSystem/FileSystemDownloadTask.swift:425)",
  offline: "The Internet connection appears to be offline. (NSURLErrorDomain -1009)",
  androidOffline: "java.net.UnknownHostException: Unable to resolve host \"models.inbornapp.com\"",
  timeout: "The request timed out.",
  space: "Error: ENOSPC: no space left on device, write",
  iosSpace: "NSCocoaErrorDomain Code=640 NSFileWriteOutOfSpaceError",
  hash: "sha256 mismatch for qwen3.5-0.8b.gguf",
  webFetch: "TypeError: Failed to fetch",
  webQuota: "QuotaExceededError: The operation failed because it would cause the application to exceed its storage quota.",
  webStored: "stored file does not match",
  /* Round 93: the CDN answered 404 for the document index model while its upload was blocked. */
  webMissing: "HTTP 404",
};

describe("F349 · a failed download reads as one plain sentence", () => {
  it("classifies connection, space, verification and everything else", () => {
    expect(installErrorKind(RAW.offline)).toBe("offline");
    expect(installErrorKind(RAW.androidOffline)).toBe("offline");
    expect(installErrorKind(RAW.timeout)).toBe("offline");
    expect(installErrorKind(RAW.space)).toBe("no-space");
    expect(installErrorKind(RAW.iosSpace)).toBe("no-space");
    expect(installErrorKind(RAW.hash)).toBe("verify");
    expect(installErrorKind(RAW.ios)).toBe("unknown");
    expect(installErrorKind(RAW.webFetch)).toBe("offline");
    expect(installErrorKind(RAW.webQuota)).toBe("no-space");
    expect(installErrorKind(RAW.webStored)).toBe("verify");
    expect(installErrorKind(RAW.webMissing)).toBe("not-published");
    expect(installErrorKind("HTTP 410")).toBe("not-published");
    expect(installErrorKind("HTTP 503")).toBe("unknown");
  });

  it("no locale ever shows a class name, a file path or the raw text", () => {
    for (const file of ["en.json", "de.json", "es.json", "fr.json", "ja.json", "ko.json", "pt-BR.json", "zh-Hant.json"]) {
      const t = tFor(load(file));
      for (const [name, raw] of Object.entries(RAW)) {
        const text = installFailureText(t, raw, "ios");
        expect(text, `${file} ${name}`).not.toMatch(/Exception|\.swift|\.kt\b|\.java\b|NSURLError|NSCocoa|ENOSPC|\(at |:\d+\)|\{/);
        expect(text, `${file} ${name}`).not.toContain(raw);
        expect(text.trim().length, `${file} ${name}`).toBeGreaterThan(0);
      }
    }
  });

  it("each kind has its own sentence, and the unknown one is not blank", () => {
    const t = tFor(load("en.json"));
    const texts = new Set(Object.values(RAW).map((raw) => installFailureText(t, raw, "ios")));
    expect(texts.size).toBe(5);
    expect(installFailureText(t, RAW.webMissing, "web")).toBe("This model is not on the download server yet. Try again later.");
    expect(installFailureText(t, RAW.ios, "ios")).toBe("Something went wrong. Try again.");
    expect(installFailureText(t, RAW.offline, "ios")).toBe("No connection. Check the internet and try again.");
  });

  it("a browser that knows it is offline says so, whatever the worker reported", () => {
    const t = tFor(load("en.json"));
    expect(installFailureText(t, "model worker failed to start", "web", true)).toBe("No connection. Check the internet and try again.");
    expect(installFailureText(t, "model worker failed to start", "web")).toBe("Something went wrong. Try again.");
  });

  it("a platform with no store path keeps its own advice", () => {
    const t = tFor(load("en.json"));
    expect(installFailureText(t, "no-delivery", "android")).toBe(load("en.json")["vault.state.noDelivery.android"]);
  });
});
