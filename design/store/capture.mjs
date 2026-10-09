#!/usr/bin/env node
/**
 * Raw store-screenshot captures from the real app (spec §13.3): six screens per platform per locale.
 *
 *   node design/store/capture.mjs [--platform=android,ios,ipad] [--locale=en,ja,de,fr,es,pt-BR,ko,zh-Hant]
 *                                 [--screens=chat,proof,documents,photo,paywall,vault,lock] [--copy=<prompts.json>] [--proof-text=<content_size>|''] [--no-install] [--keep-booted]
 *
 * Needs the builds design/store/build.mjs makes: the QA variant (com.inbornapp.mobile.qa, bundle embedded, QA bridge on)
 * for the iOS simulator and for Android, plus the Android store build for the Proof screen. The app is driven through the
 * in-app QA bridge (apps/mobile/src/qa: scripts in Documents/qa/in, screenshots acknowledged under Documents/qa/ack), the
 * same transport scripts/ios-qa.mjs uses, so there is no Metro and no XCUITest runner. Writes
 * design/store/raw/<android|ios|ipad>/<locale>/<screen>.png.
 */
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, "../..");
const MOBILE = join(ROOT, "apps/mobile");
const MODELS = process.env.INBORN_MODELS_DIR || join(ROOT, ".models");
const RAW = join(__dir, "raw");
const QA_AAB = join(RAW, "app-qa.aab");
const BUNDLETOOL = process.env.BUNDLETOOL || join(ROOT, ".tools/bundletool-all-1.18.3.jar");
const PROOF_APK = join(RAW, "app-proof.apk");
const IOS_APP = join(MOBILE, "ios/build/qa-sim/Build/Products/Release-iphonesimulator/Inborndev.app");
const QA_BUNDLE = "com.inbornapp.mobile.qa";
const STORE_BUNDLE = "com.inbornapp.mobile";
/* any arm64 Android 13 google_apis AVD with root and a 32 GB /data (a Pixel 6 copy): the Fast and Sharp packs are copied out of
   the local-testing packs, which stay beside them, so the default 16 GB fills up */
const AVD = process.argv.find((a) => a.startsWith("--avd="))?.slice(6) ?? "inborn-ss-pixel6";
const EMU_PORT = 5570;
/* named per device type + runtime, so a simulator left from an older pipeline (iPhone 15 Pro Max / iOS 17) is never reused */
/* "-kb": a device that has never seen a hardware keyboard, so the passcode sheet shows its on-screen keypad */
const SIMS = { ios: "inborn-ss-iphone17promax-ios26-kb", ipad: "inborn-ss-ipadpro13m5-ios26" };
/* 6.9" class (1320×2868 native) and the 13" iPad, on the runtime the app ships against */
const SIM_TYPES = {
  ios: ["com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro-Max", "com.apple.CoreSimulator.SimRuntime.iOS-26-2"],
  ipad: ["com.apple.CoreSimulator.SimDeviceType.iPad-Pro-13-inch-M5-12GB", "com.apple.CoreSimulator.SimRuntime.iOS-26-2"],
};
/* Fast (Qwen3.5 2B) and Sharp (Qwen3.5 4B, two shards): see MODEL_FOR */
const CHAT_MODEL_FILES = ["Qwen3.5-2B-Q4_K_M.gguf", "Qwen3.5-4B-Q4_K_M-00001-of-00002.gguf", "Qwen3.5-4B-Q4_K_M-00002-of-00002.gguf"];
const EMBED_MODEL = "multilingual-e5-large-instruct-Q6_K.gguf";
/* Fast and Sharp read photos through their projectors (extensions vision-qwen35-2b / -4b) */
const VISION_MODELS = ["mmproj-Qwen3.5-2B-F16.gguf", "mmproj-Qwen3.5-4B-F16.gguf"];
const PHOTO = "receipt.png";
const FIXTURE = "lease.pdf";
const SCREENS = ["chat", "proof", "documents", "photo", "paywall", "vault", "lock"];
const PASSCODE = "2468";
const TMP = process.env.SS_TMP || "/private/tmp/claude-501/inborn-store-shots";

const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=").slice(1).join("=") ?? d;
const flag = (k) => process.argv.includes(`--${k}`);
const PLATFORMS = arg("platform", "android,ios,ipad").split(",").filter(Boolean);
const LOCALES = arg("locale", "en,ja,de,fr,es,pt-BR,ko,zh-Hant").split(",").filter(Boolean);
const ONLY = arg("screens", SCREENS.join(",")).split(",").filter(Boolean);
/* the meter card is the Proof panel's message: iOS Dynamic Type size, and the Android font scale that matches it */
const PROOF_TEXT = arg("proof-text", "extra-extra-extra-large");
const PROOF_SCALE = "1.3";

/* The user's side of each capture, in the listing language (docs/store messaging plan 2026-10-08): a note and a raise request
   with no facts to get wrong, a summary and questions over the lease, "what can you do" and a question over the receipt. The
   electricity question is EN only (a short query in another language than the English lease misses retrieval); Sharp's
   languages ask what was bought, because Sharp miscounts the items. */
const COPY = {
  en: {
    warmup: "Write a short, friendly note telling my team the Monday meeting moved to 3 pm. Sign it Sam.",
    prompt: "Help me ask my manager for a raise. Three sentences, confident.",
    prequestion: "Who pays for electricity and internet?",
    summary: "Summarize this file in three bullets.",
    question: "When does my lease end, and how much is the deposit?",
    photoPre: "What can you do?",
    photo: "What is the total on this receipt, and how many items were bought?",
  },
  ja: {
    warmup: "月曜の会議が15時に変更になったことをチームに伝える、短くて感じのいいメモを書いて。署名はサムで。",
    prompt: "上司に昇給をお願いしたい。自信のある3文で書いて。",
    summary: "このファイルを3つの箇条書きで要約して。",
    question: "この賃貸契約はいつ終了しますか？敷金はいくらですか？",
    photoPre: "何ができますか？",
    photo: "このレシートの合計はいくら？何を買いましたか？",
  },
  de: {
    warmup: "Schreib eine kurze, freundliche Nachricht an mein Team: Das Meeting am Montag ist auf 15 Uhr verschoben. Unterschreib mit Sam.",
    prompt: "Hilf mir, meinen Chef um eine Gehaltserhöhung zu bitten. Drei Sätze, selbstbewusst.",
    summary: "Fasse diese Datei in drei Stichpunkten zusammen.",
    question: "Wann endet der Mietvertrag und wie hoch ist die Kaution?",
    photoPre: "Was kannst du?",
    photo: "Wie hoch ist die Summe auf diesem Kassenbon, und was wurde gekauft?",
  },
  fr: {
    warmup: "Écris un petit mot sympa pour prévenir mon équipe que la réunion de lundi est déplacée à 15h. Signe Sam.",
    prompt: "Écris un message à mon manager pour lui demander une augmentation. Trois phrases, avec assurance.",
    summary: "Résume ce fichier en trois points.",
    question: "Quand le bail se termine-t-il et quel est le montant du dépôt de garantie ?",
    photoPre: "Que sais-tu faire ?",
    photo: "Quel est le total de ce ticket, et combien d'articles ont été achetés ?",
  },
  es: {
    warmup: "Escribe una nota breve y amable para avisar a mi equipo de que la reunión del lunes pasa a las 15:00. Firma como Sam.",
    prompt: "Escribe un mensaje para mi jefe pidiéndole un aumento. Tres frases, con seguridad.",
    summary: "Resume este archivo en tres puntos.",
    question: "¿Cuándo termina el contrato de alquiler y cuánto es el depósito de garantía?",
    photoPre: "¿Qué puedes hacer?",
    photo: "¿Cuál es el total de este recibo y cuántos artículos se compraron?",
  },
  "pt-BR": {
    warmup: "Escreva um recado curto e simpático avisando minha equipe que a reunião de segunda mudou para as 15h. Assine como Sam.",
    prompt: "Escreva uma mensagem para o meu chefe pedindo um aumento. Três frases, com confiança.",
    summary: "Resuma este arquivo em três tópicos.",
    /* Fast's summary of the English lease drifted into Spanish and wrong terms in Portuguese */
    docsModel: "sharp",
    question: "Quando termina o contrato de locação e qual é o valor da caução?",
    photoPre: "O que você sabe fazer?",
    photo: "Qual é o total deste recibo e quantos itens foram comprados?",
  },
  ko: {
    warmup: "월요일 회의가 오후 3시로 바뀌었다고 팀에 알리는 짧고 친근한 메모를 써 줘. 서명은 샘으로 해 줘.",
    prompt: "상사에게 연봉 인상을 요청하고 싶어. 자신감 있게 세 문장으로 써 줘.",
    summary: "이 파일을 세 개의 글머리 기호로 요약해 줘.",
    question: "임대차 계약은 언제 끝나고 보증금은 얼마인가요?",
    photoPre: "무엇을 할 수 있나요?",
    photo: "이 영수증의 합계는 얼마이고, 무엇을 샀나요?",
  },
  "zh-Hant": {
    warmup: "幫我寫一則簡短友善的訊息，告訴團隊星期一的會議改到下午三點。署名用 Sam。",
    prompt: "幫我寫一則給主管的訊息，由我請求加薪。三句話，語氣要有自信。",
    summary: "請用三個重點摘要這份文件。",
    question: "租約什麼時候到期？押金是多少？",
    photoPre: "你能做什麼？",
    photo: "這張收據的總金額是多少？買了幾件商品？",
  },
};

/* --copy=<file>: { "<locale>": { "<key>": "text" } } over the defaults above, so a store-copy plan sets the asks without a code change */
const COPY_FILE = arg("copy", "");
if (COPY_FILE) for (const [locale, keys] of Object.entries(JSON.parse(readFileSync(COPY_FILE, "utf8")))) COPY[locale] = { ...COPY[locale], ...keys };

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 << 20, ...opts });
const shOk = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 << 20, ...opts });
const now = () => Date.now();

const prefsFor = (locale, lock = false) => ({
  onboarded: true,
  installedAt: now() - 12 * 86400e3,
  themeMode: "dark",
  textScale: 1,
  locale,
  answerLanguage: locale,
  haptics: true,
  /* "hide in app switcher" sets FLAG_SECURE on Android, which blanks screenshots, the lock screen's included */
  lock: { enabled: lock, timeoutSec: 0, hideInSwitcher: !lock, screenshotProtection: false, wipeAfterFailed: lock ? 10 : null },
  lockReminderShown: true,
  autoDeleteDays: 0,
  clipboardExpirySec: 0,
  contentSafety: true,
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

/* The photo screen's picture: the receipt the per-model photo QA reads (docs/qa/photo-per-model), known answer 17.59, five items. */
function ensurePhoto() {
  const out = join(RAW, PHOTO);
  if (!existsSync(out)) copyFileSync(join(ROOT, "docs/qa/photo-per-model/photos", PHOTO), out);
  return out;
}

/* ---------- the QA bridge driver: push a script, take each screenshot it asks for, acknowledge, read the report ---------- */
let runSeq = 0;
async function bridge(dev, name, steps, dir, timeoutMs = 600_000) {
  /* the device and pid keep runs of parallel capture processes (one per device) apart in the shared TMP */
  const runId = `ss-${name}-${dev.name}-${process.pid}-${Date.now().toString(36)}-${runSeq++}`;
  mkdirSync(TMP, { recursive: true });
  const local = join(TMP, `${runId}.json`);
  writeFileSync(local, JSON.stringify({ runId, steps }));
  dev.push(local, `qa/in/${runId}.json`);
  rmSync(local, { force: true });
  const took = new Set();
  const until = now() + timeoutMs;
  let done = null;
  while (now() < until && !done) {
    const text = dev.pull(`qa/out/${runId}/progress.json`);
    let p = null;
    try {
      p = text ? JSON.parse(text) : null;
    } catch {
      /* half-written; the next poll reads it whole */
    }
    if (p?.awaiting && !took.has(p.awaiting)) {
      await dev.shot(join(dir, `${p.awaiting}.png`));
      const ok = join(TMP, `${runId}-${p.awaiting}.ok`);
      writeFileSync(ok, p.awaiting);
      dev.push(ok, `qa/ack/${runId}/${p.awaiting}.ok`);
      rmSync(ok, { force: true });
      took.add(p.awaiting);
      log(`${dev.name}: shot ${p.awaiting}`);
    }
    if (p?.state === "done" || p?.state === "crashed") done = p;
    else await sleep(800);
  }
  const result = dev.pull(`qa/out/${runId}/result.json`);
  if (!result) throw new Error(`${dev.name}/${name}: no bridge result (last progress ${JSON.stringify(done)})`);
  const r = JSON.parse(result);
  writeFileSync(join(dir, `bridge-${name}.json`), JSON.stringify(r, null, 2));
  for (const s of r.steps) if (!s.ok) log(`${dev.name}/${name}: step ${s.i} ${s.op} failed: ${String(s.detail).slice(0, 160)}`);
  return r;
}

/* Launch, then wait until the bridge has written boot.json for this process (a stale one is removed first). */
async function launchAndWait(dev) {
  dev.remove("qa");
  dev.launch();
  const t0 = now();
  /* a cold start takes minutes when other builds and emulators share the Mac */
  while (now() - t0 < 300_000) {
    if (dev.pull("qa/boot.json")) return;
    await sleep(1000);
  }
  throw new Error(`${dev.name}: the QA bridge never booted (is this the EXPO_PUBLIC_QA=1 build?)`);
}

/* ---------- Android emulator (root: the QA build is a release build, so run-as is not available) ---------- */
class Android {
  name = "android";
  serial = `emulator-${EMU_PORT}`;
  bundle = QA_BUNDLE;
  bootedHere = false;
  emuPid = null;
  get docDir() {
    return `/data/data/${this.bundle}/files`;
  }
  adb(...args) {
    return shOk("adb", ["-s", this.serial, ...args]).stdout;
  }
  booted() {
    return shOk("adb", ["-s", this.serial, "shell", "getprop", "sys.boot_completed"]).stdout.trim() === "1";
  }
  async setup() {
    if (!this.booted()) {
      log(`booting ${AVD} on ${EMU_PORT}`);
      const emu = spawn(join(process.env.ANDROID_HOME ?? `${process.env.HOME}/Library/Android/sdk`, "emulator/emulator"), ["-avd", AVD, "-port", String(EMU_PORT), "-no-snapshot-load", "-no-snapshot-save", "-no-boot-anim", "-memory", "8192", "-no-audio"], { detached: true, stdio: "ignore" });
      emu.unref();
      this.emuPid = emu.pid;
      this.bootedHere = true;
      const t0 = now();
      while (now() - t0 < 240_000 && !this.booted()) await sleep(3000);
      if (!this.booted()) throw new Error(`${AVD} did not boot`);
      await sleep(5000);
    }
    log(`android: ${this.serial}`);
    this.adb("root");
    await sleep(2000);
    this.adb("wait-for-device");
    /* the clock is set by hand for the status bar */
    this.adb("shell", "settings", "put", "global", "auto_time", "0");
    /* the passcode panel shows its on-screen keypad even though the emulator has a host keyboard */
    this.adb("shell", "settings", "put", "secure", "show_ime_with_hard_keyboard", "1");
    if (!flag("no-install")) {
      /* --local-testing: the packs ride along and Play Core serves them from the device, as Play would after a store install */
      log("installing the QA bundle (bundletool --local-testing)");
      const apks = join(TMP, "app-qa.apks");
      mkdirSync(TMP, { recursive: true });
      sh("java", ["-jar", BUNDLETOOL, "build-apks", "--bundle", QA_AAB, "--output", apks, "--local-testing", "--overwrite"]);
      this.adb("uninstall", this.bundle);
      sh("java", ["-jar", BUNDLETOOL, "install-apks", "--apks", apks, "--device-id", this.serial, "--adb", join(process.env.ANDROID_HOME ?? `${process.env.HOME}/Library/Android/sdk`, "platform-tools/adb")]);
      rmSync(apks, { force: true });
    }
    this.uid = /userId=(\d+)/.exec(this.adb("shell", "dumpsys", "package", this.bundle))?.[1];
    /* bundletool pushes the packs to shared storage as whoever adb is; under root they get root's owner and label, and
       Play Core's FakeAssetPackService is then denied reading them (SELinux), so they are handed to the app */
    const lt = `/data/media/0/Android/data/${this.bundle}/files/local_testing`;
    this.adb("shell", `chown -R ${this.uid}:ext_data_rw ${lt} && chcon -R u:object_r:media_rw_data_file:s0 ${lt}`);
    /* files/ exists after the first launch */
    this.launch();
    await sleep(8000);
    this.terminate();
    this.pushOnce(join(MODELS, EMBED_MODEL), "embed.gguf");
    this.pushOnce(join(RAW, FIXTURE), FIXTURE);
    this.pushOnce(join(RAW, PHOTO), PHOTO);
    this.adb("shell", "cmd", "uimode", "night", "yes");
    /* No Metro any more: the whole Android run is in real airplane mode, and the status bar shows it. */
    this.adb("shell", "cmd", "connectivity", "airplane-mode", "enable");
    this.statusBar();
  }
  /* The real status bar, not SystemUI demo mode: on Android 13 demo mode cannot draw the airplane glyph, the real bar does.
     Battery full and unplugged through the emulator console, the clock set to 09:41 before every shot. */
  statusBar() {
    for (const a of [["power", "ac", "off"], ["power", "status", "not-charging"], ["power", "capacity", "100"]]) this.adb("emu", ...a);
    this.adb("shell", "date 100709412026.00");
  }
  /* root writes land with root's owner and label; the app must own them to read, consume and delete them */
  push(local, rel) {
    const dest = `${this.docDir}/${rel}`;
    const dir = dest.slice(0, dest.lastIndexOf("/"));
    sh("adb", ["-s", this.serial, "push", local, "/data/local/tmp/ss-push"]);
    this.adb("shell", `mkdir -p ${dir} && mv /data/local/tmp/ss-push ${dest} && chown -R ${this.uid}:${this.uid} ${this.docDir} && chmod 600 ${dest} && restorecon -R ${this.docDir}`);
  }
  pushOnce(src, rel) {
    const size = statSync(src).size;
    if (this.adb("shell", `stat -c %s ${this.docDir}/${rel} 2>/dev/null`).trim() === String(size)) return;
    log(`push ${rel} (${(size / 1e6).toFixed(0)} MB)`);
    this.push(src, rel);
  }
  pull(rel) {
    const r = shOk("adb", ["-s", this.serial, "exec-out", "cat", `${this.docDir}/${rel}`]);
    return r.status === 0 && r.stdout && !r.stdout.includes("No such file") ? r.stdout : null;
  }
  remove(rel) {
    this.adb("shell", `rm -rf ${this.docDir}/${rel}`);
  }
  writeText(rel, text) {
    const tmp = join(TMP, `w-${Date.now()}.txt`);
    mkdirSync(TMP, { recursive: true });
    writeFileSync(tmp, text);
    this.push(tmp, rel);
    rmSync(tmp, { force: true });
  }
  reset(locale, lock = false) {
    this.terminate();
    /* a force-stop during a model load leaves the vault's "loading" mark, which the app reads as a crash and quarantines the model;
       here every stop is ours, so both marks are cleared */
    const v = `${this.docDir}/models/vault.json`;
    /* rewritten in place (cat >), so the file keeps the app's owner and SELinux categories */
    this.adb("shell", `[ -f ${v} ] && sed 's/"loading":true/"loading":false/g; s/"quarantined":true/"quarantined":false/g' ${v} > /data/local/tmp/ss-vault && cat /data/local/tmp/ss-vault > ${v}; rm -f /data/local/tmp/ss-vault`);
    for (const p of ["SQLite", "documents", "documents.json", "dev-run.json", "dev-prompt.txt", "qa", "prefs.bak.json"]) this.remove(p);
    this.writeText("prefs.json", JSON.stringify(prefsFor(locale, lock)));
  }
  launch(url = "inborn://") {
    this.adb("shell", "am", "start", "-W", "-a", "android.intent.action.VIEW", "-d", url, this.bundle);
  }
  terminate() {
    this.adb("shell", "am", "force-stop", this.bundle);
  }
  async shot(file) {
    this.statusBar();
    await sleep(1200);
    writeFileSync(file, execFileSync("adb", ["-s", this.serial, "exec-out", "screencap", "-p"], { maxBuffer: 64 << 20 }));
  }
  async waitUi(re, ms) {
    const t0 = now();
    while (now() - t0 < ms) {
      this.adb("shell", "uiautomator", "dump", "/sdcard/ss-ui.xml");
      if (re.test(this.adb("shell", "cat", "/sdcard/ss-ui.xml"))) return true;
      await sleep(2000);
    }
    return false;
  }
  /* autoFocus inside a modal raises no keyboard on Android; a real tap on the field does */
  async tapEditText() {
    this.adb("shell", "uiautomator", "dump", "/sdcard/ss-ui.xml");
    const b = /class="android\.widget\.EditText"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/.exec(this.adb("shell", "cat", "/sdcard/ss-ui.xml"));
    if (b) this.adb("shell", "input", "tap", String((+b[1] + +b[3]) >> 1), String((+b[2] + +b[4]) >> 1));
    await sleep(1500);
  }
  /* Proof screen: the store build (no INTERNET permission, no bridge) after a clean uninstall, so the kernel counter starts at zero */
  async proofSetup() {
    if (!existsSync(PROOF_APK)) throw new Error(`missing ${PROOF_APK} (design/store/build.mjs --proof)`);
    this.terminate();
    this.bundle = STORE_BUNDLE;
    this.adb("uninstall", STORE_BUNDLE);
    sh("adb", ["-s", this.serial, "install", PROOF_APK]);
    this.uid = /userId=(\d+)/.exec(this.adb("shell", "dumpsys", "package", STORE_BUNDLE))?.[1];
    this.launch();
    await sleep(6000);
    this.terminate();
  }
  async proof(locale, file) {
    this.reset(locale);
    this.adb("shell", "settings", "put", "system", "font_scale", PROOF_SCALE);
    try {
      this.launch("inborn://proof");
      /* a cold start of the store build right after install takes a while; the counter line ("0 B") marks the screen as drawn */
      await this.waitUi(/ 0 B/, 60_000);
      await sleep(1500);
      await this.shot(file);
      this.terminate();
    } finally {
      this.adb("shell", "settings", "put", "system", "font_scale", "1.0");
    }
  }
  async teardown() {
    this.terminate();
    this.adb("shell", "settings", "put", "global", "auto_time", "1");
    this.adb("shell", "cmd", "connectivity", "airplane-mode", "disable");
    if (this.bootedHere) {
      this.adb("emu", "kill");
      const t0 = now();
      while (now() - t0 < 30_000 && this.emuPid && shOk("ps", ["-p", String(this.emuPid)]).status === 0) await sleep(1000);
    }
  }
}

/* ---------- iOS simulator (iPhone + iPad share the code; only the device differs) ---------- */
class Sim {
  constructor(kind) {
    this.name = kind;
    this.kind = kind;
    this.udid = null;
    this.bootedHere = false;
    this.bundle = QA_BUNDLE;
  }
  async setup() {
    const devices = Object.values(JSON.parse(sh("xcrun", ["simctl", "list", "devices", "-j"])).devices).flat();
    let dev = devices.find((d) => d.name === SIMS[this.kind] && d.isAvailable);
    if (!dev) {
      const [type, runtime] = SIM_TYPES[this.kind];
      dev = { udid: sh("xcrun", ["simctl", "create", SIMS[this.kind], type, runtime]).trim(), state: "Shutdown" };
      log(`created ${SIMS[this.kind]} ${dev.udid}`);
    }
    this.udid = dev.udid;
    if (dev.state !== "Booted") {
      shOk("xcrun", ["simctl", "boot", this.udid]);
      this.bootedHere = true;
    }
    sh("xcrun", ["simctl", "bootstatus", this.udid, "-b"]);
    log(`${this.kind}: ${this.udid}`);
    if (!flag("no-install")) {
      if (!existsSync(IOS_APP)) throw new Error(`missing ${IOS_APP} (design/store/build.mjs --ios)`);
      log("installing app");
      sh("xcrun", ["simctl", "install", this.udid, IOS_APP]);
    }
    mkdirSync(join(this.container(), "Documents/models"), { recursive: true });
    /* Instant ships inside the iOS app. Fast and the document index are put where an HTTPS download leaves them; the vault
       finds them at boot, checks their SHA-256 against the catalog and adopts them as installed. */
    for (const f of CHAT_MODEL_FILES) this.copyOnce(join(MODELS, f), `Documents/models/${f}`);
    this.copyOnce(join(MODELS, EMBED_MODEL), `Documents/models/${EMBED_MODEL}`);
    for (const v of VISION_MODELS) if (existsSync(join(MODELS, v))) this.copyOnce(join(MODELS, v), `Documents/models/${v}`);
    rmSync(join(this.container(), "Documents/embed.gguf"), { force: true });
    this.copyOnce(join(RAW, FIXTURE), `Documents/${FIXTURE}`);
    this.copyOnce(join(RAW, PHOTO), `Documents/${PHOTO}`);
    sh("xcrun", ["simctl", "ui", this.udid, "appearance", "dark"]);
    /* no Face ID enrolled, so the lock screen opens on its passcode keypad: the store panel shows a code being asked for */
    shOk("xcrun", ["simctl", "spawn", this.udid, "notifyutil", "-s", "com.apple.BiometricKit.enrollmentChanged", "0"]);
    shOk("xcrun", ["simctl", "spawn", this.udid, "notifyutil", "-p", "com.apple.BiometricKit.enrollmentChanged"]);
    this.statusBar();
  }
  /* The simulator has no airplane glyph: cellular is hidden and Wi-Fi shows as not connected. Re-applied before every
     shot because a relaunch can drop the override. */
  statusBar() {
    sh("xcrun", ["simctl", "status_bar", this.udid, "override", "--time", "9:41", "--batteryState", "discharging", "--batteryLevel", "100", "--dataNetwork", "hide", "--wifiMode", "failed", "--wifiBars", "0", "--cellularMode", "notSupported", "--operatorName", ""]);
  }
  textSize(size) {
    sh("xcrun", ["simctl", "ui", this.udid, "content_size", size]);
  }
  container() {
    /* the data-container UUID changes whenever the app is reinstalled, so resolve it fresh, never cache */
    return sh("xcrun", ["simctl", "get_app_container", this.udid, this.bundle, "data"]).trim();
  }
  copyOnce(src, rel) {
    const dest = join(this.container(), rel);
    if (existsSync(dest) && statSync(dest).size === statSync(src).size) return;
    log(`copy ${rel}`);
    sh("cp", [src, dest]);
  }
  push(local, rel) {
    const dest = join(this.container(), "Documents", rel);
    mkdirSync(dirname(dest), { recursive: true });
    sh("cp", [local, dest]);
  }
  pull(rel) {
    const p = join(this.container(), "Documents", rel);
    try {
      return existsSync(p) ? readFileSync(p, "utf8") : null;
    } catch {
      return null;
    }
  }
  remove(rel) {
    rmSync(join(this.container(), "Documents", rel), { recursive: true, force: true });
  }
  reset(locale, lock = false) {
    this.terminate();
    const vault = join(this.container(), "Documents/models/vault.json");
    if (existsSync(vault)) writeFileSync(vault, readFileSync(vault, "utf8").replace(/"loading":true/g, '"loading":false').replace(/"quarantined":true/g, '"quarantined":false'));
    for (const p of ["SQLite", "documents", "documents.json", "dev-run.json", "dev-prompt.txt", "qa", "prefs.bak.json"]) this.remove(p);
    writeFileSync(join(this.container(), "Documents/prefs.json"), JSON.stringify(prefsFor(locale, lock)));
  }
  launch() {
    sh("xcrun", ["simctl", "launch", "--terminate-running-process", this.udid, this.bundle]);
  }
  terminate() {
    shOk("xcrun", ["simctl", "terminate", this.udid, this.bundle]);
  }
  async shot(file) {
    this.statusBar();
    await sleep(2500);
    sh("xcrun", ["simctl", "io", this.udid, "screenshot", file]);
  }
  async teardown() {
    this.terminate();
    shOk("xcrun", ["simctl", "status_bar", this.udid, "clear"]);
    if (this.bootedHere && !flag("keep-booted")) shOk("xcrun", ["simctl", "shutdown", this.udid]);
  }
}

/* ---------- the drive: six screens per locale, every one through the bridge ---------- */

/* An answer is finished when Stop is gone and the message actions are mounted. Send stays disabled until the model is
   loaded, so a second press follows; it fails harmlessly once the first one went through (the composer is empty). */
const ask = (text, timeoutMs = 300_000) => [
  { op: "waitFor", testID: "composer-input", timeoutMs: 120_000 },
  { op: "sleep", ms: 6000 },
  { op: "type", testID: "composer-input", text },
  { op: "sleep", ms: 1500 },
  /* Sharp can take most of a minute to load on the emulator; presses after the one that went through fail harmlessly */
  ...[5000, 10_000, 20_000, 30_000].flatMap((ms) => [{ op: "send" }, { op: "sleep", ms }]),
  { op: "send" },
  /* on the emulator the first token can take a minute; an answer already finished makes this wait fail harmlessly */
  { op: "waitFor", testID: "stop", timeoutMs: 120_000 },
  { op: "waitFor", testID: "stop", gone: true, timeoutMs },
  { op: "waitFor", testID: "message-actions", timeoutMs: 30_000 },
  { op: "sleep", ms: 1500 },
];
/* The first-run "it can be wrong" notice and the model advice card are dismissed the way a user would, once. */
const dismissNotice = [{ op: "press", testID: "notice-dismiss" }, { op: "sleep", ms: 600 }, { op: "press", testID: "model-advice-not-now" }, { op: "sleep", ms: 600 }];
const visit = (url, shot, ms = 3000) => [{ op: "deeplink", url }, { op: "sleep", ms }, { op: "screenshot", name: shot }];

/* The model each locale is shown with: the one the vault recommends for chat in that language on a phone of this class.
   Fast is "Basic" in German, Japanese and Korean (the chat then says so on screen), so those three run on Sharp (Pro). */
const MODEL_FOR = { en: "fast", ja: "sharp", de: "sharp", fr: "fast", es: "fast", "pt-BR": "fast", ko: "sharp", "zh-Hant": "fast" };
const CHAT_MODELS = ["fast", "sharp"];

/* Once per install: Fast, Sharp and the document index installed through the vault (Android: Play packs, local testing;
   iOS: the files the setup copied are adopted at boot), so every locale only has to pick one. */
async function installModels(dev) {
  dev.reset("en");
  await launchAndWait(dev);
  const dir = join(TMP, `prepare-${dev.name}`);
  mkdirSync(dir, { recursive: true });
  log(`${dev.name}: installing Fast, Sharp and the document index`);
  const r = await bridge(
    dev,
    "install",
    [
      { op: "setTier", tier: "pro" },
      { op: "deeplink", url: "inborn://vault" },
      { op: "sleep", ms: 4000 },
      /* Install opens the confirmation sheet (size + where it comes from); Download starts it */
      ...["embed-e5", ...CHAT_MODELS].flatMap((id) => [{ op: "press", testID: `install-${id}` }, { op: "sleep", ms: 1500 }, { op: "press", testID: "confirm-download" }, { op: "sleep", ms: 2500 }]),
      /* delivering and verifying both show Cancel */
      ...["embed-e5", ...CHAT_MODELS].map((id) => ({ op: "waitFor", testID: `cancel-${id}`, gone: true, timeoutMs: 900_000 })),
      { op: "sleep", ms: 2000 },
      ...["embed-e5", ...CHAT_MODELS].map((id) => ({ op: "value", testID: `model-status-${id}` })),
    ],
    dir,
    3_000_000,
  );
  for (const st of r.steps.filter((x) => x.op === "value")) log(`${dev.name}: ${st.detail}`);
}

/* Free tier unless the locale's model is Pro; the paywall is always captured from a free launch of its own. */
const pick = (model) => [
  ...(model === "fast" ? [] : [{ op: "setTier", tier: "pro" }]),
  { op: "deeplink", url: "inborn://vault" },
  { op: "sleep", ms: 3000 },
  { op: "press", testID: `use-${model}` },
  /* a switch has to release the old weights first; a message sent meanwhile fails with "model not loaded" */
  { op: "sleep", ms: model === "fast" ? 20_000 : 60_000 },
];

async function captureLocale(dev, locale, dir, screens) {
  const want = (s) => screens.includes(s);
  const copy = COPY[locale];
  const model = MODEL_FOR[locale];
  if (want("paywall")) {
    dev.reset(locale);
    await launchAndWait(dev);
    log(`${dev.name}/${locale}: paywall`);
    await bridge(dev, "paywall", [{ op: "waitFor", testID: "composer-input", timeoutMs: 60_000 }, ...visit("inborn://paywall", "paywall", 4000)], dir);
  }
  const main = [...pick(model)];
  /* The chat comes before any other picture: on Android each picture sets the clock back to 09:41, and an answer
     started after that jump stalls. "Use" goes back to the chat, so the vault is opened again for its picture. */
  if (want("chat")) main.push({ op: "deeplink", url: "inborn://" }, ...(copy.warmup ? ask(copy.warmup) : []), ...ask(copy.prompt), ...dismissNotice, { op: "devPrompt", lines: ["/scroll"] }, { op: "sleep", ms: 2500 }, { op: "screenshot", name: "chat" });
  if (want("vault")) main.push(...visit("inborn://vault", "vault"));
  if (want("proof") && dev.name !== "android" && !PROOF_TEXT) main.push(...visit("inborn://proof", "proof"));
  if (main.length > pick(model).length) {
    dev.reset(locale);
    await launchAndWait(dev);
    log(`${dev.name}/${locale}: ${model} · vault/chat/proof pass`);
    await bridge(dev, "main", main, dir);
  }
  /* the meter card is the message, so the Proof screen can be captured at a larger Dynamic Type size of its own */
  if (want("proof") && dev.name !== "android" && PROOF_TEXT) {
    dev.reset(locale);
    dev.textSize(PROOF_TEXT);
    try {
      await launchAndWait(dev);
      log(`${dev.name}/${locale}: proof at ${PROOF_TEXT}`);
      await bridge(dev, "proof", [{ op: "waitFor", testID: "composer-input", timeoutMs: 60_000 }, ...visit("inborn://proof", "proof", 4000)], dir);
    } finally {
      dev.textSize("large");
    }
  }
  if (want("documents")) {
    dev.reset(locale);
    await launchAndWait(dev);
    log(`${dev.name}/${locale}: documents pass`);
    await bridge(
      dev,
      "documents",
      [
        ...pick(copy.docsModel ?? model),
        { op: "deeplink", url: "inborn://" },
        { op: "waitFor", testID: "composer-input", timeoutMs: 120_000 },
        ...dismissNotice,
        { op: "devPrompt", lines: [`attach: ${FIXTURE}`] },
        { op: "waitFor", testID: "attached-docs", timeoutMs: 120_000 },
        /* answers only from the file: the DOCS ONLY tag beside the chip; a line of its own, once the file is in */
        { op: "sleep", ms: 2000 },
        { op: "devPrompt", lines: ["strict: on"] },
        { op: "sleep", ms: 4000 },
        /* Sharp reads the retrieved pages first; on the emulator's CPU that alone takes minutes */
        ...(copy.summary ? ask(copy.summary, 1_200_000) : []),
        ...(copy.prequestion ? ask(copy.prequestion, 1_200_000) : []),
        ...ask(copy.question, 1_200_000),
        ...dismissNotice,
        { op: "sleep", ms: 1000 },
        { op: "screenshot", name: "documents" },
      ],
      dir,
      1_800_000,
    );
  }
  if (want("photo")) {
    dev.reset(locale);
    await launchAndWait(dev);
    log(`${dev.name}/${locale}: photo pass`);
    await bridge(
      dev,
      "photo",
      [
        ...pick(dev.name === "android" ? "fast" : model),
        { op: "deeplink", url: "inborn://" },
        { op: "waitFor", testID: "composer-input", timeoutMs: 120_000 },
        ...dismissNotice,
        /* a text turn above the photo, so the conversation fills the screen; the Play panel shows the photo turn alone */
        ...(copy.photoPre && dev.name !== "android" ? ask(copy.photoPre) : []),
        { op: "devPrompt", lines: [`image: ${PHOTO}`] },
        { op: "waitFor", testID: "pending-images", timeoutMs: 30_000 },
        /* the projector loads beside the model on the first photo */
        ...(dev.name === "android"
          ? [
              ...ask(copy.photo).slice(0, 4),
              { op: "send" },
              { op: "sleep", ms: 5000 },
              /* Fast's photo pack is an on-demand Play pack; the photo goes out by itself once it lands */
              { op: "press", testID: "vision-hold-download" },
              { op: "waitFor", testID: "vision-hold", gone: true, timeoutMs: 1_200_000 },
              { op: "waitFor", testID: "stop", timeoutMs: 600_000 },
              { op: "waitFor", testID: "stop", gone: true, timeoutMs: 1_800_000 },
              { op: "sleep", ms: 1500 },
            ]
          : ask(copy.photo, 1_200_000)),
        /* a follow-up on the same photo, so the conversation fills the screen */
        ...(copy.photoFollow ? ask(copy.photoFollow, 600_000) : []),
        ...dismissNotice,
        /* the model advice card can come back once the answer is in */
        { op: "sleep", ms: 1500 },
        { op: "press", testID: "model-advice-not-now" },
        { op: "sleep", ms: 1000 },
        { op: "screenshot", name: "photo" },
      ],
      dir,
      3_600_000,
    );
  }
  if (want("lock")) {
    /* the passcode lives in the Keychain / Keystore, so it is set once per install; the lock screen needs a relaunch */
    if (!dev.passcodeDone) {
      dev.reset(locale);
      await launchAndWait(dev);
      const r = await bridge(
        dev,
        "passcode",
        [
          { op: "deeplink", url: "inborn://settings" },
          { op: "sleep", ms: 2500 },
          { op: "scrollTo", testID: "row-lock" },
          { op: "press", testID: "row-lock" },
          { op: "waitFor", testID: "passcode-input", timeoutMs: 10_000 },
          { op: "type", testID: "passcode-input", text: PASSCODE },
          { op: "press", testID: "passcode-submit" },
          { op: "sleep", ms: 1200 },
          { op: "type", testID: "passcode-input", text: PASSCODE },
          { op: "press", testID: "passcode-submit" },
          { op: "sleep", ms: 1500 },
          { op: "screenshot", name: "passcode-set" },
        ],
        dir,
      );
      /* a passcode kept in the Keychain from an earlier run makes the sheet never open, which is fine */
      dev.passcodeDone = r.ok || r.steps.some((s) => s.op === "press" && s.ok && /row-lock/.test(s.detail ?? ""));
      rmSync(join(dir, "passcode-set.png"), { force: true });
    }
    dev.reset(locale, true);
    dev.launch();
    await sleep(9000);
    if (dev.waitUi) await dev.waitUi(/EditText/, 90_000);
    /* the passcode sheet slides up on its own; four typed digits show the code being entered */
    await sleep(3000);
    if (dev.tapEditText) await dev.tapEditText();
    await bridge(dev, "lock", [{ op: "type", testID: "passcode-input", text: "2580" }, { op: "sleep", ms: 1500 }, { op: "screenshot", name: "lock" }], dir, 90_000);
    if (!existsSync(join(dir, "lock.png"))) await dev.shot(join(dir, "lock.png"));
    dev.terminate();
  }
  for (const s of screens) if (!(dev.name === "android" && s === "proof") && !existsSync(join(dir, `${s}.png`))) throw new Error(`${dev.name}/${locale}: no ${s}.png`);
}

async function main() {
  mkdirSync(RAW, { recursive: true });
  await ensureFixture();
  ensurePhoto();
  for (const m of [...CHAT_MODEL_FILES, EMBED_MODEL]) if (!existsSync(join(MODELS, m))) throw new Error(`missing ${join(MODELS, m)} (set INBORN_MODELS_DIR)`);
  const devices = [];
  if (PLATFORMS.includes("android")) {
    if (!flag("no-install") && !existsSync(QA_AAB)) throw new Error(`missing ${QA_AAB} (node design/store/build.mjs --android)`);
    if (!flag("no-install") && !existsSync(BUNDLETOOL)) throw new Error(`missing ${BUNDLETOOL} (set BUNDLETOOL to bundletool-all.jar)`);
    devices.push(new Android());
  }
  for (const k of ["ios", "ipad"]) if (PLATFORMS.includes(k)) devices.push(new Sim(k));
  const failures = [];
  /* one device at a time: the simulators and the emulator never run side by side */
  for (const dev of devices) {
    try {
      await dev.setup();
      await installModels(dev);
      for (const locale of LOCALES) {
        const dir = join(RAW, dev.name, locale);
        mkdirSync(dir, { recursive: true });
        try {
          await captureLocale(dev, locale, dir, ONLY);
        } catch (e) {
          failures.push(`${dev.name}/${locale}: ${e.message}`);
          log("FAIL", e.message);
        }
      }
      if (dev.name === "android" && ONLY.includes("proof")) {
        log("android: proof screens from the store build");
        await dev.proofSetup();
        for (const locale of LOCALES) {
          try {
            await dev.proof(locale, join(RAW, "android", locale, "proof.png"));
          } catch (e) {
            failures.push(`android/${locale}/proof: ${e.message}`);
            log("FAIL", e.message);
          }
        }
      }
    } catch (e) {
      failures.push(`${dev.name}: ${e.message}`);
      log("FAIL", e.message);
    } finally {
      await dev.teardown();
    }
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
