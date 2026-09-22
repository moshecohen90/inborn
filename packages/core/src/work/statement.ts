/**
 * Printable architecture statement (spec §7.5 Work row, §7.9: "הצהרת ארכיטקטורה להדפסה לתיקי ציות"): a dated
 * description of where data lives and what the app can and cannot do, for a compliance file. Facts only, from
 * the build; it deliberately makes no claim of certification under any regulation.
 */

export interface StatementInput {
  appVersion: string;
  buildHash?: string;
  platform: "ios" | "android" | "windows" | "macos" | "web";
  /** ISO date printed on the document. */
  date: string;
  /** Verified tier at print time. */
  tier: "free" | "pro" | "work";
  /** Model in use, as the vault names it. */
  modelName?: string;
  /** Vaults on this device (names only; no content). */
  vaults?: readonly string[];
  /** Ed25519 public key of this installation's signing key, if one exists. */
  signingPublicKeyHex?: string;
}

const PLATFORM_LINES: Record<StatementInput["platform"], string[]> = {
  ios: ["Release builds contact only the App Store (purchases, delivery of the built-in model) and, on request, the model host for downloads the user starts.", "Chats are stored in an SQLCipher database; its key lives in the iOS Keychain (this device only, not in backups)."],
  android: ["Release builds declare no INTERNET permission: the process cannot open a socket. Models arrive through Google Play asset delivery; purchases go through Play Billing.", "Chats are stored in an SQLCipher database; its key lives in the Android Keystore."],
  windows: ["The desktop shell can open one connection only when the user clicks Check for Updates; the model engine and the database run in-process.", "Chats are stored in an SQLCipher database; its key lives in Windows Credential Manager."],
  macos: ["The desktop shell can open one connection only when the user clicks Check for Updates; the model engine and the database run in-process.", "Chats are stored in an SQLCipher database; its key lives in the macOS Keychain."],
  web: ["The browser version talks only to its own origin (Content-Security-Policy connect-src 'self'); the model runs in WebAssembly inside the tab.", "Chats are stored in the browser's IndexedDB for this origin; the browser vendor's own policies apply."],
};

export function architectureStatement(input: StatementInput): string {
  const p = PLATFORM_LINES[input.platform];
  const vaults = input.vaults?.length ? input.vaults.map((v) => `- ${v}`).join("\n") : "- none";
  return [
    `# Inborn · Architecture statement`,
    ``,
    `Date: ${input.date}  `,
    `Application: Inborn ${input.appVersion}${input.buildHash ? ` (build ${input.buildHash})` : ""} on ${input.platform}  `,
    `Licence tier at print time: ${input.tier === "work" ? "Pro for Work" : input.tier === "pro" ? "Pro" : "Free"}  `,
    `Prepared on the device that runs the software. No part of this document was fetched from a server.`,
    ``,
    `## 1. What the software is`,
    ``,
    `Inborn is a chat assistant that runs a language model (${input.modelName ?? "an open-weight model from the app's catalogue"}) entirely on this device. There is no user account, no server side, no analytics and no telemetry. Every conversation, document, note and setting is created, stored and processed locally.`,
    ``,
    `## 2. Data flow`,
    ``,
    `- Input (typed text, dictation, photos, imported documents) is processed by the model on the device's CPU/GPU and never transmitted.`,
    `- ${p[0]}`,
    `- The app keeps an exit meter: bytes sent by the process since installation, shown on the Proof screen with the per-session network log.`,
    ``,
    `## 3. Storage and encryption`,
    ``,
    `- ${p[1]}`,
    `- Documents in the library are indexed on the device; the index lives in the same encrypted database.`,
    `- Incognito chats are held in memory only and are discarded when closed.`,
    `- Purchase entitlements are verified on the device against the store's signature and cached in a sealed file keyed from the same secret.`,
    ``,
    `## 4. Access control`,
    ``,
    `- App lock: biometric or passcode, engaged on launch and after a configurable time in the background; optional emergency wipe after N failed attempts.`,
    `- Client vaults: a folder can carry its own passcode (salted hash, never the code). Chats in a vault are hidden until the vault is opened, and the vault closes again whenever the app locks or after 30 minutes.`,
    `- Vaults on this device at print time:`,
    vaults,
    ``,
    `## 5. Records`,
    ``,
    `- Each vault keeps an append-only audit log (event, time, subject; never message content). Entries are hash-chained, so a removed or altered entry is detectable.`,
    `- Signed export: a chat can be exported as JSON with a SHA-256 content hash and an Ed25519 signature from a key generated on this installation. The public key is included in the file and printed here: ${input.signingPublicKeyHex ?? "no signing key yet (created at the first signed export)"}.`,
    ``,
    `## 6. What this document does not claim`,
    ``,
    `This statement describes the software's architecture as built. It is not a certification of compliance with any law or standard (including health-privacy, legal-privilege or financial-records rules), not a security audit, and not a substitute for the professional's own duties over the device, its passcodes and its backups. Model output can be wrong and must be reviewed by a qualified person before use.`,
    ``,
    `Checking this independently: the network claims above can be verified from outside the app (the Android build declares no INTERNET permission; the iOS App Privacy Report and any firewall show the same). The application's own source code is not published, and this build is not reproducible from it, so neither is offered as evidence here.`,
  ].join("\n");
}
