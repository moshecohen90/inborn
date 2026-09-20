#!/usr/bin/env node
/**
 * Raw store-screenshot captures from the real app (spec §13.3): six screens per platform per locale.
 *
 *   node design/store/capture.mjs [--platform=android,ios,ipad] [--locale=en,ja,de,fr,es,pt-BR] [--screens=chat,proof,documents,paywall,vault,lock]
 *                                 [--port=8095] [--keep-metro] [--no-install]
 *
 * Needs the dev builds from the README "Run on a phone" / "iOS simulator" recipes:
 *   design/store/raw/app-dev.apk + raw/app-proof.apk                       (node design/store/build.mjs)
 *   apps/mobile/ios/build/ss/Build/Products/Debug-iphonesimulator/Inborndev.app (xcodebuild -sdk iphonesimulator SWIFT_VERSION=5.0)
 * and the models in .models/ (Instant chat model + nomic embedder). It boots Pixel_6_API_33 and the two simulators named
 * below, drives the app through deep links plus the app's own dev hooks (EXPO_PUBLIC_AUTOPROMPT / AUTOINDEX / AUTOASK are
 * bundle-time, so Metro restarts once per locale), and writes design/store/raw/<platform>/<locale>/<screen>.png.
 */
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, "../..");
const MOBILE = join(ROOT, "apps/mobile");
const MODELS = join(ROOT, ".models");
const RAW = join(__dir, "raw");
const APK = join(__dir, "raw/app-dev.apk");
const PROOF_APK = join(__dir, "raw/app-proof.apk");
const IOS_APP = join(MOBILE, "ios/build/ss/Build/Products/Debug-iphonesimulator/Inborndev.app");
const XCTESTRUN = () => join(MOBILE, "ios/build/ss/Build/Products", (existsSync(join(MOBILE, "ios/build/ss/Build/Products")) ? readdirSync(join(MOBILE, "ios/build/ss/Build/Products")).find((f) => f.endsWith(".xctestrun")) : undefined) ?? "none.xctestrun");
const BUNDLE = "com.inbornapp.mobile";
const AVD = "Pixel_6_API_33";
const SIMS = { ios: "inborn-ss-iphone", ipad: "inborn-ss-ipad" };
const SIM_TYPES = {
  ios: ["com.apple.CoreSimulator.SimDeviceType.iPhone-15-Pro-Max", "com.apple.CoreSimulator.SimRuntime.iOS-17-0"],
  ipad: ["com.apple.CoreSimulator.SimDeviceType.iPad-Pro-13-inch-M4-8GB", "com.apple.CoreSimulator.SimRuntime.iOS-17-5"],
};
const CHAT_MODEL = "Qwen3.5-0.8B-Q4_K_M.gguf";
const EMBED_MODEL = "nomic-embed-text-v1.5.f16.gguf";
const FIXTURE = "lease.pdf";
const SCREENS = ["chat", "proof", "documents", "paywall", "vault", "lock"];
const PASSCODE = "2468";

const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=").slice(1).join("=") ?? d;
const flag = (k) => process.argv.includes(`--${k}`);
const PORT = Number(arg("port", "8095"));
const PLATFORMS = arg("platform", "android,ios,ipad").split(",").filter(Boolean);
const LOCALES = arg("locale", "en,ja,de,fr,es,pt-BR").split(",").filter(Boolean);
const ONLY = arg("screens", SCREENS.join(",")).split(",").filter(Boolean);

/* The user's side of each capture, in the listing language: a table + code block for the chat, one question over the lease. */
const COPY = {
  en: {
    prompt: "Compare tea and coffee in a small table: caffeine and brew time. Then a two-line Python snippet that prints today's date.",
    question: "When does the lease end, and how much is the security deposit?",
  },
  ja: {
    prompt: "紅茶とコーヒーを小さな表で比べて（カフェインと抽出時間）。その後、今日の日付を表示する2行のPythonコードも。",
    question: "この賃貸契約はいつ終了しますか？敷金はいくらですか？",
  },
  de: {
    prompt: "Vergleiche Tee und Kaffee in einer kleinen Tabelle: Koffein und Ziehzeit. Dann ein zweizeiliges Python-Snippet, das das heutige Datum ausgibt.",
    question: "Wann endet der Mietvertrag und wie hoch ist die Kaution?",
  },
  fr: {
    prompt: "Compare le the et le cafe dans un petit tableau : cafeine et temps d'infusion. Puis un extrait Python de deux lignes qui affiche la date du jour.",
    question: "Quand le bail se termine-t-il et quel est le montant du depot de garantie ?",
  },
  es: {
    prompt: "Compara el te y el cafe en una tabla pequena: cafeina y tiempo de preparacion. Luego un fragmento de Python de dos lineas que imprima la fecha de hoy.",
    question: "¿Cuando termina el contrato de alquiler y cuanto es el deposito de garantia?",
  },
  "pt-BR": {
    prompt: "Compare cha e cafe em uma tabela pequena: cafeina e tempo de preparo. Depois um trecho Python de duas linhas que imprima a data de hoje.",
    question: "Quando termina o contrato de aluguel e qual e o valor do deposito caucao?",
  },
  ko: {
    prompt: "차와 커피를 작은 표로 비교해 주세요: 카페인과 우리는 시간. 그다음 오늘 날짜를 출력하는 두 줄짜리 파이썬 코드도요.",
    question: "임대차 계약은 언제 끝나고 보증금은 얼마인가요?",
  },
  "zh-Hant": {
    prompt: "用一個小表格比較茶和咖啡：咖啡因和沖泡時間。然後給我兩行印出今天日期的 Python 程式碼。",
    question: "租約什麼時候到期？押金是多少？",
  },
};

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 << 20, ...opts });
const shOk = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts });
const now = () => Date.now();

const prefsFor = (locale, lock = false) => ({
  onboarded: true,
  installedAt: now() - 12 * 86400e3,
  themeMode: "dark",
  textScale: 1,
  locale,
  answerLanguage: locale,
  haptics: true,
  lock: { enabled: lock, timeoutSec: 0, hideInSwitcher: true, screenshotProtection: false, wipeAfterFailed: lock ? 10 : null },
  lockReminderShown: true,
  autoDeleteDays: 0,
  clipboardExpirySec: 0,
  performance: "balanced",
  autoPower: true,
  neverAutoSwitch: false,
  wifiOnly: true,
  meter: { outBytes: 0, inBytes: 0, lastTx: 0, lastRx: 0, since: now() - 12 * 86400e3 },
});

/* ---------- fixture: a three-page lease the documents screen indexes and answers from ----------
   A hand-written, uncompressed PDF: Android's pdfbox-android extractor returns empty text for a Chromium-printed PDF
   (compressed object streams), so the fixture is built as plain text streams that both PDFKit (iOS) and pdfbox read. */
const LEASE_PAGES = [
  [
    "Residential Lease Agreement",
    "",
    "Premises: 12 Maple Street, Apartment 4B, Portland, Oregon 97205.",
    "Landlord: Maple Street Holdings LLC.    Tenant: Dana Whitfield.",
    "",
    "1. Parties and premises",
    "The Landlord leases to the Tenant the premises above, with one assigned",
    "parking space and one basement storage locker, for residential use only.",
    "",
    "2. Use and occupancy",
    "The Tenant shall use the premises as a private residence. Guests may stay",
    "up to fourteen consecutive nights without the Landlord's written consent.",
    "",
    "3. Pets",
    "One cat is permitted. Other animals need written consent and a $300 deposit.",
  ],
  [
    "4. Term",
    "The lease begins on September 1, 2026 and ends on August 31, 2027.",
    "After the initial term it continues month to month on the same conditions",
    "unless either party gives written notice as described in section 9.",
    "",
    "5. Rent",
    "Rent is $1,850 per month, payable in advance on the first day of each month.",
    "Rent received after the fifth day of the month incurs a late charge of $50.",
    "",
    "6. Security deposit",
    "On signing, the Tenant pays a security deposit of $2,500. It is returned",
    "within 30 days after the Tenant moves out, less any lawful deductions for",
    "unpaid rent or damage beyond normal wear and tear.",
    "",
    "7. Utilities",
    "The Landlord pays water, sewer and garbage. The Tenant pays electricity,",
    "gas and internet, each in the Tenant's own name.",
  ],
  [
    "8. Maintenance and repairs",
    "The Tenant keeps the premises clean and reports defects promptly. The",
    "Landlord repairs heating, plumbing and electrical systems within a",
    "reasonable time. Repairs caused by the Tenant's negligence are charged",
    "to the Tenant.",
    "",
    "9. Notice and termination",
    "Either party may end the month-to-month tenancy by giving at least 60",
    "days' written notice. Early termination of the initial term needs the",
    "Landlord's written consent and a fee of one month's rent.",
    "",
    "10. Signatures",
    "Signed at Portland, Oregon, on August 12, 2026.",
    "Landlord: __________________     Tenant: __________________",
  ],
];
function leasePdf() {
  const esc = (s) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const objs = ["<< /Type /Catalog /Pages 2 0 R >>", null]; // catalog, pages (filled below)
  const pageRefs = [];
  const fontRef = 3; // object 3 = the shared font
  objs.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  LEASE_PAGES.forEach((lines) => {
    const body = `BT /F1 12 Tf 60 740 Td 17 TL\n${lines.map((l) => `(${esc(l)}) Tj T*`).join("\n")}\nET`;
    const contentObj = objs.push(`<< /Length ${Buffer.byteLength(body, "latin1")} >>\nstream\n${body}\nendstream`);
    const pageObj = objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontRef} 0 R >> >> /Contents ${contentObj} 0 R >>`);
    pageRefs.push(`${pageObj} 0 R`);
  });
  objs[1] = `<< /Type /Pages /Kids [${pageRefs.join(" ")}] /Count ${pageRefs.length} >>`;
  let pdf = Buffer.from("%PDF-1.4\n", "latin1");
  const offsets = [];
  objs.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf = Buffer.concat([pdf, Buffer.from(`${i + 1} 0 obj\n${o}\nendobj\n`, "latin1")]);
  });
  const xref = pdf.length;
  let tail = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) tail += `${String(off).padStart(10, "0")} 00000 n \n`;
  tail += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.concat([pdf, Buffer.from(tail, "latin1")]);
}
async function ensureFixture() {
  const out = join(RAW, FIXTURE);
  mkdirSync(RAW, { recursive: true });
  if (!existsSync(out)) {
    writeFileSync(out, leasePdf());
    log("fixture", out);
  }
  return out;
}

/* ---------- Metro (one per locale: the dev prompts are inlined at bundle time) ---------- */
let metro = null;
const killPort = () => {
  for (const pid of shOk("lsof", ["-nP", `-iTCP:${PORT}`, "-sTCP:LISTEN", "-t"]).stdout.split("\n").filter(Boolean)) shOk("kill", ["-9", pid]);
};
/* Two passes per locale: "chat" auto-answers a prompt (chat/proof/paywall/vault/lock); "docs" auto-indexes the lease and
   asks over it (documents). They never share a Metro, so the single engine and dev-run.json are not contended. */
async function startMetro(locale, mode) {
  await stopMetro();
  killPort();
  const env = {
    ...process.env,
    APP_VARIANT: "development",
    CI: "1",
    EXPO_NO_TELEMETRY: "1",
    /* the emulator reports 4 GB, which marks most of the catalog "too big"; a mainstream 8 GB phone is the honest vault to show */
    EXPO_PUBLIC_DEV_RAM_GB: "8",
    ...(mode === "docs" ? { EXPO_PUBLIC_AUTOINDEX: FIXTURE, EXPO_PUBLIC_AUTOASK: COPY[locale].question } : { EXPO_PUBLIC_AUTOPROMPT: COPY[locale].prompt }),
  };
  metro = spawn("npx", ["expo", "start", "--port", String(PORT), "--clear"], { cwd: MOBILE, env, stdio: ["ignore", "pipe", "pipe"] });
  metro.stdout.on("data", (d) => process.env.SS_VERBOSE && process.stdout.write(`[metro] ${d}`));
  metro.stderr.on("data", (d) => process.env.SS_VERBOSE && process.stderr.write(`[metro] ${d}`));
  const t0 = now();
  while (now() - t0 < 60_000) {
    const r = shOk("curl", ["-s", "-m", "2", `http://127.0.0.1:${PORT}/status`]);
    if (/packager-status:running/.test(r.stdout)) return log(`metro up on ${PORT} (${locale}/${mode})`);
    await sleep(1000);
  }
  throw new Error("Metro did not come up");
}
async function stopMetro() {
  if (!metro) return;
  const child = metro;
  metro = null;
  child.kill("SIGTERM");
  await sleep(1500);
  if (child.exitCode === null) child.kill("SIGKILL");
  /* expo start forks a bundler that survives its parent on SIGTERM */
  killPort();
}

/* ---------- Android ---------- */
class Android {
  name = "android";
  serial = null;
  uid = null;
  bootedHere = false;
  async setup() {
    this.serial = this.find();
    if (!this.serial) {
      log(`booting ${AVD}`);
      const emu = spawn(join(process.env.ANDROID_HOME ?? `${process.env.HOME}/Library/Android/sdk`, "emulator/emulator"), ["-avd", AVD, "-port", "5570", "-no-snapshot-load", "-no-snapshot-save", "-no-boot-anim", "-memory", "4096"], { detached: true, stdio: "ignore" });
      emu.unref();
      this.bootedHere = true;
      const t0 = now();
      while (now() - t0 < 180_000) {
        await sleep(3000);
        this.serial = this.find();
        if (this.serial && shOk("adb", ["-s", this.serial, "shell", "getprop", "sys.boot_completed"]).stdout.trim() === "1") break;
      }
      if (!this.serial) throw new Error(`${AVD} did not boot`);
      await sleep(5000);
    }
    log(`android: ${this.serial}`);
    if (!flag("no-install")) {
      log("installing apk");
      sh("adb", ["-s", this.serial, "install", "-r", APK]);
    }
    /* files/ exists after the first launch; the model must be there before the screens are driven */
    this.launch("inborn://");
    await sleep(6000);
    this.stop();
    this.pushOnce(join(MODELS, CHAT_MODEL), "files/instant.gguf");
    this.pushOnce(join(MODELS, EMBED_MODEL), "files/embed.gguf");
    this.pushOnce(join(RAW, FIXTURE), `files/${FIXTURE}`);
    this.adb("shell", "cmd", "uimode", "night", "yes");
    /* Dev screens reach Metro over 10.0.2.2 (set in launch()), which needs the radios on; the airplane glyph is SystemUI demo
       mode (cosmetic) here. The Proof screen's honest OUT 0 B comes from the store build in real airplane mode (proofSetup). */
    this.demoBar();
  }
  demoBar() {
    this.adb("shell", "settings", "put", "global", "sysui_demo_allowed", "1");
    for (const a of [
      ["command", "enter"],
      ["command", "clock", "-e", "hhmm", "0941"],
      ["command", "battery", "-e", "level", "100", "-e", "plugged", "false"],
      ["command", "network", "-e", "airplane", "show", "-e", "wifi", "hide", "-e", "mobile", "hide"],
      ["command", "notifications", "-e", "visible", "false"],
    ]) this.adb("shell", "am", "broadcast", "-a", "com.android.systemui.demo", "-e", ...a);
  }
  find() {
    for (const line of shOk("adb", ["devices"]).stdout.split("\n")) {
      const m = /^(emulator-\d+)\s+device/.exec(line);
      if (m && shOk("adb", ["-s", m[1], "emu", "avd", "name"]).stdout.split("\n")[0].trim() === AVD) return m[1];
    }
    return null;
  }
  adb(...args) {
    return shOk("adb", ["-s", this.serial, ...args]).stdout;
  }
  runAs(cmd) {
    return shOk("adb", ["-s", this.serial, "shell", `run-as ${BUNDLE} sh -c '${cmd}'`]).stdout;
  }
  pushOnce(src, dest) {
    const size = statSync(src).size;
    const have = this.runAs(`stat -c %s ${dest} 2>/dev/null`).trim();
    if (have === String(size)) return;
    log(`push ${dest} (${(size / 1e6).toFixed(0)} MB)`);
    execFileSync("sh", ["-c", `adb -s ${this.serial} exec-in "run-as ${BUNDLE} sh -c 'cat > ${dest}'" < "${src}"`], { stdio: "ignore" });
  }
  writeFile(rel, text) {
    execFileSync("sh", ["-c", `printf '%s' "$SS_TEXT" | adb -s ${this.serial} exec-in "run-as ${BUNDLE} sh -c 'cat > ${rel}'"`], { env: { ...process.env, SS_TEXT: text }, stdio: "ignore" });
  }
  readFile(rel) {
    return this.runAs(`cat ${rel} 2>/dev/null`);
  }
  reset(locale, lock = false) {
    this.stop();
    this.runAs("rm -rf files/SQLite files/documents files/dev-run.json files/documents.json");
    this.writeFile("files/prefs.json", JSON.stringify(prefsFor(locale, lock)));
  }
  launch(url) {
    /* Metro over 10.0.2.2 (the emulator's host-loopback alias), not adb reverse: the reverse relay drops after force-stop on
       this image, 10.0.2.2 survives it. Radios stay on (demo-mode airplane glyph), so the NAT route to the host is up. */
    this.setDebugHost();
    this.adb("shell", "am", "start", "-W", "-a", "android.intent.action.VIEW", "-d", url, BUNDLE);
  }
  setDebugHost() {
    if (this.debugHostSet) return;
    const xml = `<?xml version="1.0" encoding="utf-8" standalone="yes" ?>\n<map>\n<string name="debug_http_host">10.0.2.2:${PORT}</string>\n</map>\n`;
    this.runAs(`mkdir -p shared_prefs; printf '%s' '${xml}' > shared_prefs/${BUNDLE}_preferences.xml`);
    this.debugHostSet = true;
  }
  open(url) {
    this.launch(url);
  }
  stop() {
    this.adb("shell", "am", "force-stop", BUNDLE);
  }
  async shot(file) {
    this.demoBar();
    await sleep(400);
    const png = execFileSync("adb", ["-s", this.serial, "exec-out", "screencap", "-p"], { maxBuffer: 64 << 20 });
    writeFileSync(file, png);
  }
  /* uiautomator sees RN testIDs as resource-id; tap the centre of the first match (three tries: the dump waits for idle) */
  async tap(query) {
    for (let i = 0; i < 3; i++) {
      this.adb("shell", "uiautomator", "dump", "/sdcard/ss-ui.xml");
      const xml = this.adb("exec-out", "cat", "/sdcard/ss-ui.xml");
      const re = new RegExp(`<node[^>]*(?:resource-id|text|content-desc)="${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`);
      const m = re.exec(xml);
      if (m) {
        this.adb("shell", "input", "tap", String((Number(m[1]) + Number(m[3])) / 2), String((Number(m[2]) + Number(m[4])) / 2));
        return true;
      }
      await sleep(1000);
    }
    log(`android: no element "${query}"`);
    return false;
  }
  async has(query) {
    this.adb("shell", "uiautomator", "dump", "/sdcard/ss-ui.xml");
    return this.adb("exec-out", "cat", "/sdcard/ss-ui.xml").includes(`"${query}"`);
  }
  async dismissNotice(labels) {
    return this.tap(labels.dismiss);
  }
  async scrollChat() {
    this.adb("shell", "input", "swipe", "540", "1900", "540", "600", "350");
  }
  async setPasscode(labels) {
    this.open("inborn://settings");
    await sleep(3000);
    if (!(await this.tap(labels.setPasscode))) {
      this.adb("shell", "input", "swipe", "540", "1500", "540", "900", "300");
      await sleep(800);
      /* the Keystore keeps the passcode across runs: the row then reads "Change passcode" and nothing needs typing */
      if (await this.has(labels.changePasscode)) return true;
      if (!(await this.tap(labels.setPasscode))) return false;
    }
    for (let i = 0; i < 2; i++) {
      await sleep(1200);
      this.adb("shell", "input", "text", PASSCODE);
      await sleep(300);
      await this.tap("passcode-submit");
    }
    await sleep(1000);
    return true;
  }
  /* Proof screen: the store build (no INTERNET permission, no Metro) after a clean uninstall, so the kernel counter starts at zero */
  async proofSetup() {
    if (!existsSync(PROOF_APK)) throw new Error(`missing ${PROOF_APK} (design/store/build.mjs makes it)`);
    /* the store build has no run-as debuggability, so its files/ is reached as root; adb root only happens in this phase,
       after every Metro-dependent capture is done; the dev screens reach Metro over 10.0.2.2, not a reverse. */
    this.adb("root");
    if (this.serial) this.adb("wait-for-device");
    this.stop();
    this.adb("uninstall", BUNDLE);
    /* the store build has no INTERNET permission and no Metro; real airplane mode makes the meter's OUT 0 B honest */
    this.adb("shell", "cmd", "connectivity", "airplane-mode", "enable");
    sh("adb", ["-s", this.serial, "install", PROOF_APK]);
    this.uid = /userId=(\d+)/.exec(this.adb("shell", "dumpsys", "package", BUNDLE))?.[1];
    this.launch("inborn://");
    await sleep(5000);
    this.stop();
    this.rootPush(join(MODELS, CHAT_MODEL), "instant.gguf");
  }
  rootPush(src, name) {
    const dest = `/data/data/${BUNDLE}/files/${name}`;
    sh("adb", ["-s", this.serial, "push", src, "/data/local/tmp/ss-push"]);
    this.adb("shell", `mv /data/local/tmp/ss-push ${dest} && chown ${this.uid}:${this.uid} ${dest} && chmod 600 ${dest} && restorecon ${dest}`);
  }
  async proof(locale, file) {
    this.stop();
    const tmp = join(RAW, "prefs.tmp.json");
    writeFileSync(tmp, JSON.stringify(prefsFor(locale)));
    this.rootPush(tmp, "prefs.json");
    this.launch("inborn://");
    await sleep(6000);
    this.open("inborn://proof");
    await sleep(3000);
    await this.shot(file);
    this.stop();
  }
  async teardown() {
    this.stop();
    this.adb("shell", "am", "broadcast", "-a", "com.android.systemui.demo", "-e", "command", "exit");
    this.adb("shell", "cmd", "connectivity", "airplane-mode", "disable");
    if (this.bootedHere) this.adb("emu", "kill");
  }
}

/* ---------- iOS simulator (iPhone + iPad share the code; only the device differs) ----------
   Taps happen inside an XCUITest (ios-tests/ScreenshotDriverUITests.swift) because nothing else reaches the simulator's screen;
   one xcodebuild test run per locale drives the whole step list and writes the PNGs itself. */
class Sim {
  constructor(kind) {
    this.name = kind;
    this.kind = kind;
    this.udid = null;
    this.bootedHere = false;
  }
  async setup() {
    const list = sh("xcrun", ["simctl", "list", "devices", "-j"]);
    const devices = Object.values(JSON.parse(list).devices).flat();
    let dev = devices.find((d) => d.name === SIMS[this.kind] && d.isAvailable);
    if (!dev) {
      const [type, runtime] = SIM_TYPES[this.kind];
      const udid = sh("xcrun", ["simctl", "create", SIMS[this.kind], type, runtime]).trim();
      dev = { udid, state: "Shutdown" };
      log(`created ${SIMS[this.kind]} ${udid}`);
    }
    this.udid = dev.udid;
    if (dev.state !== "Booted") {
      shOk("xcrun", ["simctl", "boot", this.udid]);
      this.bootedHere = true;
    }
    sh("xcrun", ["simctl", "bootstatus", this.udid, "-b"]);
    log(`${this.kind}: ${this.udid}`);
    if (!existsSync(XCTESTRUN())) throw new Error("no .xctestrun under apps/mobile/ios/build/ss (node design/store/build.mjs --ios)");
    if (!flag("no-install")) {
      log("installing app");
      sh("xcrun", ["simctl", "install", this.udid, IOS_APP]);
    }
    /* RN reads the packager host:port from the app's NSUserDefaults; every other worktree's Metro sits on 8081 */
    sh("xcrun", ["simctl", "spawn", this.udid, "defaults", "write", BUNDLE, "RCT_jsLocation", `localhost:${PORT}`]);
    mkdirSync(join(this.container(), "Documents"), { recursive: true });
    this.copyOnce(join(MODELS, CHAT_MODEL), "Documents/instant.gguf");
    this.copyOnce(join(MODELS, EMBED_MODEL), "Documents/embed.gguf");
    this.copyOnce(join(RAW, FIXTURE), `Documents/${FIXTURE}`);
    sh("xcrun", ["simctl", "ui", this.udid, "appearance", "dark"]);
    sh("xcrun", ["simctl", "status_bar", this.udid, "override", "--time", "9:41", "--batteryState", "charged", "--batteryLevel", "100", "--cellularMode", "notSupported", "--wifiMode", "active", "--wifiBars", "3"]);
  }
  container() {
    /* the data-container UUID changes whenever the app is reinstalled, so resolve it fresh, never cache */
    return sh("xcrun", ["simctl", "get_app_container", this.udid, BUNDLE, "data"]).trim();
  }
  copyOnce(src, rel) {
    const dest = join(this.container(), rel);
    if (existsSync(dest) && statSync(dest).size === statSync(src).size) return;
    log(`copy ${rel}`);
    sh("cp", [src, dest]);
  }
  reset(locale, lock = false) {
    shOk("xcrun", ["simctl", "terminate", this.udid, BUNDLE]);
    const c = this.container();
    for (const p of ["Documents/SQLite", "Documents/documents", "Documents/dev-run.json", "Documents/documents.json"]) rmSync(join(c, p), { recursive: true, force: true });
    writeFileSync(join(c, "Documents/prefs.json"), JSON.stringify(prefsFor(locale, lock)));
  }
  /* one test run = one step list; the runner writes the PNGs into `dir` */
  drive(steps, dir) {
    /* TEST_RUNNER_ variables do not reach a test-without-building runner; the step list travels through /tmp, keyed by udid */
    writeFileSync(`/tmp/inborn-ss-driver-${this.udid}.json`, JSON.stringify({ steps, out: dir, docs: join(this.container(), "Documents") }));
    const r = spawnSync(
      "xcodebuild",
      ["test-without-building", "-xctestrun", XCTESTRUN(), "-destination", `id=${this.udid}`, "-only-testing:InbornUITests/ScreenshotDriverUITests/testDrive"],
      { encoding: "utf8", cwd: join(MOBILE, "ios"), maxBuffer: 64 << 20 },
    );
    const lines = (r.stdout + r.stderr).split("\n");
    for (const l of lines) if (/\[ss\] (no element|unknown)|error:|failed/.test(l) && !/^\s*$/.test(l)) log(`${this.kind}: ${l.trim().slice(0, 200)}`);
    if (!/TEST EXECUTE SUCCEEDED|Test Suite .* passed/.test(r.stdout)) log(`${this.kind}: driver run did not report success (see xcodebuild output)`);
    return r.status === 0;
  }
  async captureLocale(locale, labels, dir, screens) {
    const want = (s) => screens.includes(s);
    if (want("documents")) {
      /* docs pass: no chat auto-prompt, so the engine serves the RAG ask straight away */
      this.reset(locale);
      this.drive(["launch", "sleep:3", "open:inborn://documents", "waitfile:dev-run.json:ask:300", "sleep:2.5", "shot:documents", "terminate"], dir);
      if (!existsSync(join(dir, "documents.png"))) throw new Error(`${this.kind}/${locale}: no documents.png`);
      return;
    }
    const steps = ["launch", "waitfile:dev-run.json:reply:300", "sleep:2", `tap:${labels.dismiss}`, "sleep:1.2", "dragup", "sleep:1.5"];
    if (want("chat")) steps.push("shot:chat");
    if (want("proof")) steps.push("open:inborn://proof", "sleep:3", "shot:proof");
    if (want("paywall")) steps.push("open:inborn://paywall", "sleep:4", "shot:paywall");
    if (want("vault")) steps.push("open:inborn://vault", "sleep:3", "shot:vault");
    if (want("lock") && !this.passcodeDone) steps.push("open:inborn://settings", "sleep:3", `tap:${labels.setPasscode}`, "sleep:1.5", `type:${PASSCODE}`, "tap:passcode-submit", "sleep:1.5", `type:${PASSCODE}`, "tap:passcode-submit", "sleep:1");
    steps.push("terminate");
    this.reset(locale);
    log(`${this.kind}/${locale}: driving ${steps.length} steps`);
    this.drive(steps, dir);
    this.passcodeDone = true;
    if (want("lock")) {
      this.reset(locale, true);
      this.drive(["launch", "sleep:8", "shot:lock", "terminate"], dir);
    }
    for (const s of screens) if (!existsSync(join(dir, `${s}.png`))) throw new Error(`${this.kind}/${locale}: no ${s}.png`);
  }
  async teardown() {
    shOk("xcrun", ["simctl", "terminate", this.udid, BUNDLE]);
    shOk("xcrun", ["simctl", "status_bar", this.udid, "clear"]);
    if (this.bootedHere) shOk("xcrun", ["simctl", "shutdown", this.udid]);
  }
}

/* ---------- the drive: six screens per locale ---------- */
async function waitFor(dev, key, timeoutMs) {
  const t0 = now();
  while (now() - t0 < timeoutMs) {
    const txt = dev.readFile(dev.name === "android" ? "files/dev-run.json" : "Documents/dev-run.json");
    if (txt.includes(`"${key}"`)) return txt;
    await sleep(1500);
  }
  throw new Error(`${dev.name}: timed out waiting for ${key} in dev-run.json`);
}

async function captureLocale(dev, locale, labels, screens) {
  const dir = join(RAW, dev.name, locale);
  mkdirSync(dir, { recursive: true });
  const want = (s) => screens.includes(s);
  const file = (s) => join(dir, `${s}.png`);
  if (want("documents")) {
    /* docs pass (no chat auto-prompt): open the library, let it index the lease and answer, capture the cited answer */
    dev.reset(locale);
    dev.launch("inborn://");
    await sleep(3000);
    dev.open("inborn://documents");
    log(`${dev.name}/${locale}: indexing the lease + asking`);
    await waitFor(dev, "ask", 300_000);
    await sleep(2500);
    await dev.shot(file("documents"));
    return;
  }
  dev.reset(locale);
  dev.launch("inborn://");
  log(`${dev.name}/${locale}: waiting for the chat answer`);
  const chat = await waitFor(dev, "reply", 300_000);
  const { reply, ...stats } = JSON.parse(chat);
  log(`${dev.name}/${locale}: reply ${reply?.length ?? 0} chars · ${Number(stats.tokPerSec ?? 0).toFixed(1)} tok/s`);
  await sleep(2000);
  /* the first-run "it can be wrong" notice is dismissed once per database; the database is fresh per locale */
  await dev.dismissNotice(labels);
  await sleep(1200);
  /* the answer runs past the fold on a fresh chat: bring the table and the code block into view */
  await dev.scrollChat();
  await sleep(1500);
  if (want("chat")) await dev.shot(file("chat"));
  if (want("proof") && dev.name !== "android") {
    dev.open("inborn://proof");
    await sleep(3000);
    await dev.shot(file("proof"));
  }
  if (want("paywall")) {
    dev.open("inborn://paywall");
    await sleep(3500);
    await dev.shot(file("paywall"));
  }
  if (want("vault")) {
    dev.open("inborn://vault");
    await sleep(3000);
    await dev.shot(file("vault"));
  }
  if (want("lock")) {
    /* a passcode lives in the Keystore/Keychain, so once per install is enough; the lock screen itself needs a relaunch */
    if (!dev.passcodeDone) dev.passcodeDone = await dev.setPasscode(labels);
    if (dev.passcodeDone) {
      dev.reset(locale, true);
      dev.launch("inborn://");
      await sleep(9000);
      await dev.shot(file("lock"));
    } else {
      log(`${dev.name}/${locale}: could not set a passcode; capturing the Security settings instead`);
      dev.open("inborn://settings");
      await sleep(3000);
      await dev.shot(file("lock"));
    }
  }
}

const mkdirRaw = (name, locale) => {
  const dir = join(RAW, name, locale);
  mkdirSync(dir, { recursive: true });
  return dir;
};
const strings = (locale) => JSON.parse(readFileSync(join(ROOT, "packages/i18n/locales", `${locale}.json`), "utf8"));

async function main() {
  mkdirSync(RAW, { recursive: true });
  await ensureFixture();
  if (!existsSync(join(MODELS, CHAT_MODEL))) throw new Error(`missing ${join(MODELS, CHAT_MODEL)}`);
  const devices = [];
  if (PLATFORMS.includes("android")) {
    if (!existsSync(APK)) throw new Error(`missing ${APK} (node design/store/build.mjs --android)`);
    devices.push(new Android());
  }
  for (const k of ["ios", "ipad"]) if (PLATFORMS.includes(k)) {
    if (!existsSync(IOS_APP)) throw new Error(`missing ${IOS_APP}`);
    devices.push(new Sim(k));
  }
  const failures = [];
  /* the Android Proof screen comes from the store build (separate phase); iOS/iPad Proof is captured in the chat pass */
  const chatScreens = ONLY.filter((s) => s !== "documents" && !(s === "proof" && PLATFORMS.every((p) => p === "android")));
  const docScreens = ONLY.filter((s) => s === "documents");
  const run = async (dev, locale, labels, screens) => {
    if (!screens.length) return;
    if (!dev.udid && !dev.serial) await dev.setup();
    try {
      if (dev.captureLocale) await dev.captureLocale(locale, labels, mkdirRaw(dev.name, locale), screens);
      else await captureLocale(dev, locale, labels, screens);
    } catch (e) {
      failures.push(`${dev.name}/${locale}: ${e.message}`);
      log("FAIL", e.message);
    }
  };
  try {
    for (const locale of LOCALES) {
      const s = strings(locale);
      const labels = { setPasscode: s["passcode.set"], changePasscode: s["passcode.change"], save: s["chats.save"], dismiss: s["safety.dismiss"] };
      if (chatScreens.length) {
        await startMetro(locale, "chat");
        for (const dev of devices) await run(dev, locale, labels, chatScreens);
      }
      if (docScreens.length) {
        await startMetro(locale, "docs");
        for (const dev of devices) await run(dev, locale, labels, docScreens);
      }
    }
    if (!flag("keep-metro")) await stopMetro();
    const android = devices.find((d) => d.name === "android");
    if (android && ONLY.includes("proof")) {
      if (!android.serial) await android.setup();
      log("android: proof screens from the store build");
      await android.proofSetup();
      for (const locale of LOCALES) {
        try {
          mkdirSync(join(RAW, "android", locale), { recursive: true });
          await android.proof(locale, join(RAW, "android", locale, "proof.png"));
        } catch (e) {
          failures.push(`android/${locale}/proof: ${e.message}`);
          log("FAIL", e.message);
        }
      }
    }
  } finally {
    if (!flag("keep-metro")) await stopMetro();
    for (const dev of devices) if (dev.udid || dev.serial) await dev.teardown();
  }
  if (failures.length) {
    console.error(failures.join("\n"));
    process.exit(1);
  }
  log("done →", RAW);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
