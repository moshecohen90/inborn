#!/usr/bin/env node
// Drives the iPhone through the in-app QA bridge: no XCUITest runner, no "Enable UI Automation" passcode sheet
// (F185), nothing that needs Moshe standing next to the phone.
//
//   node scripts/ios-qa.mjs <script.json> --out docs/qa/ios-qa-bridge [--device <udid>] [--launch] [--run <id>] [--simulator]
//
// It pushes the script into the app's own Documents container (`devicectl device copy to`, no prompt), launches or
// leaves the app running, polls `Documents/qa/out/<run>/progress.json`, takes each `screenshot` step's picture with
// pymobiledevice3 and acknowledges it, then pulls `result.json`. Exit code 1 if any step failed.
import { execFileSync, execFile } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { tmpdir } from 'node:os';

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
};
const has = (name) => argv.includes(`--${name}`);

const scriptPath = argv.find((a) => !a.startsWith('--') && a.endsWith('.json'));
if (!scriptPath) {
  console.error('usage: ios-qa.mjs <script.json> --out <dir> [--device <udid>] [--launch]');
  process.exit(2);
}
// The repo is public: the phone's UDID is never a default in a tracked file (F238).
const device = flag('device', process.env.INBORN_IOS_DEVICE);
if (!device) {
  console.error('no device: pass --device <udid> or set INBORN_IOS_DEVICE');
  process.exit(2);
}
const bundle = flag('bundle', 'com.inbornapp.mobile');
const outDir = flag('out', join(process.cwd(), 'qa-out'));
const runId = flag('run', `${basename(scriptPath, '.json')}-${Date.now().toString(36)}`);
const overall = Number(flag('timeout', 900000));
const pmd = flag('pymobiledevice3', process.env.PYMOBILEDEVICE3 || `${process.env.HOME}/.local/bin/pymobiledevice3`);
const staging = join(tmpdir(), `ios-qa-${runId}`);

mkdirSync(outDir, { recursive: true });
mkdirSync(staging, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (m) => console.log(`${new Date().toTimeString().slice(0, 8)} ${m}`);

function devicectl(args, { quiet = true } = {}) {
  return execFileSync('xcrun', ['devicectl', ...args], { encoding: 'utf8', stdio: quiet ? ['ignore', 'pipe', 'pipe'] : 'inherit' });
}

function simctl(args, { quiet = true } = {}) {
  return execFileSync('xcrun', ['simctl', ...args], { encoding: 'utf8', stdio: quiet ? ['ignore', 'pipe', 'pipe'] : 'inherit' });
}

// A simulator has no devicectl: its container is a directory on this Mac, so the same four moves are file copies
// (F323, the iPad pass). Everything above and below this block is identical for a phone and a simulator.
const simulator = has('simulator');
const simData = () => simctl(['get_app_container', device, bundle, 'data']).trim();

const transport = simulator
  ? {
      push(local, remote) {
        const dest = join(simData(), remote);
        mkdirSync(join(dest, '..'), { recursive: true });
        execFileSync('cp', [local, dest]);
      },
      pull(remote, local) {
        const src = join(simData(), remote);
        if (!existsSync(src)) return null;
        execFileSync('cp', [src, local]);
        return existsSync(local) ? readFileSync(local, 'utf8') : null;
      },
      launch() {
        simctl(['launch', '--terminate-running-process', device, bundle]);
        return null;
      },
      shoot: (png) => simctl(['io', device, 'screenshot', png]),
    }
  : {
      push: (local, remote) =>
        devicectl(['device', 'copy', 'to', '--device', device, '--domain-type', 'appDataContainer', '--domain-identifier', bundle, '--source', local, '--destination', remote]),
      pull(remote, local) {
        try {
          devicectl(['device', 'copy', 'from', '--device', device, '--domain-type', 'appDataContainer', '--domain-identifier', bundle, '--source', remote, '--destination', local]);
          return existsSync(local) ? readFileSync(local, 'utf8') : null;
        } catch {
          return null;
        }
      },
      // The app is launched detached and left running: killing the launcher would take the app with it, and the
      // bridge only polls while the process lives.
      launch() {
        const child = execFile('xcrun', ['devicectl', 'device', 'process', 'launch', '--device', device, '--terminate-existing', '--console', bundle], () => undefined);
        child.unref?.();
        return child;
      },
      shoot: (png) => execFileSync(pmd, ['developer', 'dvt', 'screenshot', '--userspace', png], { stdio: ['ignore', 'pipe', 'pipe'] }),
    };

const push = (local, remote) => transport.push(local, remote);

function pull(remote, local) {
  try {
    return transport.pull(remote, local);
  } catch {
    return null;
  }
}

const launch = () => transport.launch();

function screenshot(name) {
  const png = join(outDir, `${name}.png`);
  transport.shoot(png);
  try {
    execFileSync('sips', ['-Z', '500', png, '--out', join(outDir, `sm-${name}.png`)], { stdio: 'ignore' });
  } catch {
    /* sips is a convenience, not the evidence */
  }
  return png;
}

/** Acknowledges the report, then watches `Documents/qa/boot.json` disappear — the bridge's proof it swept. */
async function sweep() {
  const ok = join(staging, 'result.ok');
  writeFileSync(ok, runId);
  push(ok, `Documents/qa/ack/${runId}/result.ok`);
  const probe = join(staging, 'boot-probe.json');
  for (let i = 0; i < 30; i++) {
    await sleep(1000);
    rmSync(probe, { force: true });
    if (pull('Documents/qa/boot.json', probe) === null) return true;
  }
  return false;
}

async function main() {
  const raw = JSON.parse(readFileSync(scriptPath, 'utf8'));
  const steps = Array.isArray(raw) ? raw : raw.steps;
  const payload = join(staging, `${runId}.json`);
  writeFileSync(payload, JSON.stringify({ runId, steps }));

  let launched = false;
  if (has('launch')) {
    log(`launching ${bundle}`);
    launch();
    launched = true;
    await sleep(Number(flag('boot', 14000)));
  }

  log(`pushing ${steps.length} steps as ${runId}`);
  try {
    push(payload, `Documents/qa/in/${runId}.json`);
  } catch {
    // A container that has never run the bridge has no Documents/qa/in yet; one launch creates it.
    log('inbox missing — launching once to create it');
    if (!launched) launch();
    await sleep(Number(flag('boot', 14000)));
    push(payload, `Documents/qa/in/${runId}.json`);
  }

  const until = Date.now() + overall;
  const took = new Set();
  let done = null;
  const progressFile = join(staging, 'progress.json');
  while (Date.now() < until && !done) {
    rmSync(progressFile, { force: true });
    const text = pull(`Documents/qa/out/${runId}/progress.json`, progressFile);
    if (text) {
      let p = null;
      try {
        p = JSON.parse(text);
      } catch {
        /* half-written file; the next poll reads it whole */
      }
      if (p?.awaiting && !took.has(p.awaiting)) {
        const name = p.awaiting;
        log(`shot ${name}`);
        screenshot(name);
        const ok = join(staging, `${name}.ok`);
        writeFileSync(ok, name);
        push(ok, `Documents/qa/ack/${runId}/${name}.ok`);
        took.add(name);
      }
      if (p?.state === 'done' || p?.state === 'crashed') done = p;
    }
    if (!done) await sleep(1200);
  }

  const resultLocal = join(outDir, `result-${runId}.json`);
  const result = pull(`Documents/qa/out/${runId}/result.json`, resultLocal);
  if (!result) {
    log(`NO RESULT after ${Math.round((Date.now() - (until - overall)) / 1000)} s; last progress: ${JSON.stringify(done)}`);
    process.exit(1);
  }
  const parsed = JSON.parse(result);
  for (const s of parsed.steps) log(`${s.ok ? 'ok  ' : 'FAIL'} ${String(s.i).padStart(3)} ${s.op.padEnd(10)} ${(s.detail ?? '').slice(0, 110)}`);
  log(`${parsed.passed} passed, ${parsed.failed} failed, ${took.size} screenshots → ${outDir}`);
  // A `cleanup` step cannot take the report with it, because the report is written after the last step. The bridge
  // waits for this acknowledgement and only then drops `Documents/qa/`; the poll below is what proves it did.
  if (steps.some((s) => s.op === 'cleanup')) log(`swept: ${(await sweep()) ? 'Documents/qa is gone' : 'STILL ON THE DEVICE'}`);
  for (const e of parsed.errors) log(`  ! ${e.slice(0, 200)}`);
  process.exit(parsed.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
