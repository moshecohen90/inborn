import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

/**
 * Gap #6 (spec conformance, 22.9.2026): `scripts/check-android-permissions.sh` is the whole of the "the app has no
 * INTERNET permission" claim, and it had never been watched fail — it ran by hand, on one artifact, and only ever
 * passed. These cases sabotage a real merged manifest and assert the red, including the one that matters most:
 * pointing the gate at the *pre-merge* manifest, where a library's INTERNET is not visible yet, must not pass.
 */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.resolve(HERE, "../../../scripts/check-android-permissions.sh");
const dir = mkdtempSync(path.join(tmpdir(), "inborn-perm-gate-"));

afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** The nine permissions the release manifest is allowed to carry (docs/legal/app-privacy-details.md §4.2). */
const ALLOWED = [
  "android.permission.RECORD_AUDIO",
  "android.permission.USE_BIOMETRIC",
  "android.permission.VIBRATE",
  "com.android.vending.BILLING",
  "android.permission.CAMERA",
  "android.permission.ACCESS_NETWORK_STATE",
  "android.permission.FOREGROUND_SERVICE",
  "android.permission.FOREGROUND_SERVICE_DATA_SYNC",
  "com.inbornapp.mobile.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION",
];

/** Shaped like what `processReleaseManifest` writes: a <uses-sdk> block and no tools namespace. */
function merged(permissions: string[]): string {
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<manifest xmlns:android="http://schemas.android.com/apk/res/android"',
    '    package="com.inbornapp.mobile"',
    '    android:versionCode="1"',
    '    android:versionName="1.0.0" >',
    '    <uses-sdk android:minSdkVersion="26" android:targetSdkVersion="36" />',
    ...permissions.map((p) => `    <uses-permission android:name="${p}" />`),
    '    <application android:allowBackup="false" android:label="Inborn" />',
    "</manifest>",
  ].join("\n");
}

/** Shaped like `app/src/main/AndroidManifest.xml` before the merge: tools namespace, blocked entries still listed. */
function preMerge(): string {
  return [
    '<manifest xmlns:android="http://schemas.android.com/apk/res/android" xmlns:tools="http://schemas.android.com/tools">',
    '  <uses-permission android:name="android.permission.INTERNET" tools:node="remove"/>',
    ...ALLOWED.map((p) => `  <uses-permission android:name="${p}"/>`),
    '  <application android:allowBackup="false"/>',
    "</manifest>",
  ].join("\n");
}

function gate(name: string, xml: string): { code: number; out: string } {
  const file = path.join(dir, `${name}.xml`);
  writeFileSync(file, xml);
  const r = spawnSync("bash", [SCRIPT, file], { encoding: "utf8" });
  return { code: r.status ?? -1, out: `${r.stdout}${r.stderr}` };
}

describe("check-android-permissions.sh", () => {
  it("passes the manifest the app actually ships", () => {
    const r = gate("clean", merged(ALLOWED));
    expect(r.out).toContain("OK: no INTERNET permission");
    expect(r.out).toContain("(9 declared)");
    expect(r.code).toBe(0);
  });

  it("fails on INTERNET, which is the one permission the whole privacy claim rests on", () => {
    const r = gate("internet", merged([...ALLOWED, "android.permission.INTERNET"]));
    expect(r.out).toContain("FAIL: android.permission.INTERNET is declared");
    expect(r.code).toBe(1);
  });

  it("fails on a permission a library added that nobody documented", () => {
    const r = gate("stray", merged([...ALLOWED, "android.permission.ACCESS_FINE_LOCATION"]));
    expect(r.out).toContain("FAIL: permission not in the allowlist: android.permission.ACCESS_FINE_LOCATION");
    expect(r.code).toBe(1);
  });

  it("refuses the pre-merge manifest instead of passing it", () => {
    /* The dangerous near-miss: this file says INTERNET is removed and carries only allowed permissions, so a naive
       reader passes it — while every INTERNET a dependency contributes is still unmerged and unseen. */
    const r = gate("premerge", preMerge());
    expect(r.out).toContain("is not a merged manifest");
    expect(r.out).not.toContain("OK:");
    expect(r.code).toBe(2);
  });

  it("refuses a file that does not exist rather than reporting a pass", () => {
    const r = spawnSync("bash", [SCRIPT, path.join(dir, "absent.xml")], { encoding: "utf8" });
    expect(`${r.stdout}${r.stderr}`).toContain("usage:");
    expect(r.status).toBe(2);
  });
});
