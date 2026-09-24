#!/usr/bin/env node
// Drives the desktop app for QA with no mouse, no keystrokes and no focus stealing.
//
// It talks to the `--features qa` control socket (src-tauri/src/qa.rs): one JSON line out, one back.
// `start` launches the built app with the QA secret file so the keychain is never asked for an item a
// previous build's code identity created — that ask is the macOS password dialog. On Windows the channel is a
// loopback port and `shot` images the window with PrintWindow (qa-shot-windows.ps1); see qa-platform.mjs.
//
//   node qa-drive.mjs start [--app <Inborn.app | inborn-desktop.exe>] [--log <file>]
//   node qa-drive.mjs eval  'return document.title'
//   node qa-drive.mjs wait  'return !!document.querySelector("textarea")' [--timeout 30000]
//   node qa-drive.mjs place [--width 1120] [--height 720]
//   node qa-drive.mjs shot  <out.png> [--wait 20000]
//   node qa-drive.mjs window [--all]
//   node qa-drive.mjs stop
import { spawn, execFileSync } from 'node:child_process';
import { connect } from 'node:net';
import { mkdirSync, existsSync, openSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appBinary, defaultApp as defaultAppFor, qaEndpoint } from './qa-platform.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const runDir = process.env.INBORN_QA_DIR || join(tmpdir(), 'inborn-qa');
const endpoint = qaEndpoint(runDir);
const keyFile = join(runDir, 'secrets.json');
const defaultApp = defaultAppFor(join(here, '..', 'src-tauri'));

const argv = process.argv.slice(2);
const command = argv[0];
const positional = argv.slice(1).filter((a) => !a.startsWith('--'));
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
};

function send(request, { timeout = 30000 } = {}) {
  return new Promise((resolve, reject) => {
    const socket = connect(endpoint.connect);
    let buffer = '';
    const fail = (e) => { socket.destroy(); reject(e); };
    socket.setTimeout(timeout, () => fail(new Error(`socket timeout after ${timeout} ms`)));
    socket.on('error', fail);
    socket.on('connect', () => socket.write(`${JSON.stringify(request)}\n`));
    socket.on('data', (chunk) => {
      buffer += chunk;
      const line = buffer.indexOf('\n');
      if (line === -1) return;
      socket.end();
      const reply = JSON.parse(buffer.slice(0, line));
      if (reply.ok) resolve(reply.value);
      else reject(new Error(reply.error));
    });
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForSocket(deadlineMs) {
  const until = Date.now() + deadlineMs;
  while (Date.now() < until) {
    try { return await send({ op: 'ping' }, { timeout: 2000 }); } catch { await sleep(300); }
  }
  throw new Error('the app never opened its QA socket');
}

// Window ids come from CGWindowListCopyWindowInfo, which needs no mouse and no accessibility access.
function windows(owner = 'Inborn', all = false, pid = null) {
  if (process.platform !== 'darwin') throw new Error('window listing is macOS only; `shot` covers Windows');
  const out = execFileSync('swift', [join(here, 'qa-windows.swift'), owner, ...(all ? ['all'] : []), ...(pid ? ['pid', String(pid)] : [])], { encoding: 'utf8' });
  return out.trim().split('\n').filter(Boolean).map((line) => {
    const [id, name, width, height] = line.split('\t');
    return { id: Number(id), name, width: Number(width), height: Number(height) };
  });
}

async function start() {
  const app = flag('app', defaultApp);
  const binary = appBinary(app);
  if (!existsSync(binary)) throw new Error(`no app at ${binary}`);
  mkdirSync(runDir, { recursive: true });
  if (endpoint.file) rmSync(endpoint.file, { force: true });
  const log = flag('log', join(runDir, 'app.log'));
  // The log goes straight to a descriptor: a piped stdio would keep this launcher alive after unref().
  const logFd = openSync(log, 'a');
  const child = spawn(binary, [], {
    // The app sets NSApplicationActivationPolicyAccessory when INBORN_QA_SOCKET is set, so launching it
    // here never pulls focus away from whatever the Mac is doing.
    env: { ...process.env, INBORN_QA_SOCKET: endpoint.env, INBORN_QA_KEY_FILE: keyFile },
    stdio: ['ignore', logFd, logFd],
    detached: true,
  });
  child.unref();
  const info = await waitForSocket(60000);
  console.log(JSON.stringify({ ...info, launcherPid: child.pid, socket: endpoint.env, keyFile, log }));
}

// A frame this app really painted runs 70-100 KB per megapixel as PNG; an empty or unpainted window about 20.
const paintedEnough = (file, pixels) => statSync(file).size / (pixels / 1e6) >= 40_000;

async function shotWindows(pid, file, waitMs) {
  const until = Date.now() + waitMs;
  let last;
  for (;;) {
    try {
      const out = execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', join(here, 'qa-shot-windows.ps1'), '-ProcessId', String(pid), '-Out', file], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      const window = JSON.parse(out.trim());
      if (window.distinctColors > 4) return { file, window };
      last = new Error('the window imaged blank; it has not painted yet');
    } catch (e) { last = e; }
    if (Date.now() > until) throw new Error(`the Inborn window refused to be imaged: ${last?.message ?? 'unknown'}`);
    await sleep(700);
  }
}

async function main() {
  switch (command) {
    case 'start': return start();
    case 'eval': {
      const value = await send({ op: 'eval', js: positional[0], timeoutMs: Number(flag('timeout', 20000)) });
      return console.log(JSON.stringify(value));
    }
    case 'wait': {
      const until = Date.now() + Number(flag('timeout', 30000));
      while (Date.now() < until) {
        const value = await send({ op: 'eval', js: positional[0] }).catch(() => false);
        if (value) return console.log(JSON.stringify(value));
        await sleep(500);
      }
      throw new Error(`condition never became true: ${positional[0]}`);
    }
    // --all also lists a window the window server calls off-screen, which is how a run tells "the app died"
    // apart from "a full-screen app owns the active Space".
    case 'window': return console.log(JSON.stringify(windows(flag('owner', 'Inborn'), argv.includes('--all'), flag('pid') ? Number(flag('pid')) : null)));
    case 'place': {
      const request = { op: 'window' };
      for (const key of ['width', 'height', 'x', 'y']) if (flag(key) !== undefined) request[key] = Number(flag(key));
      return console.log(JSON.stringify(await send(request)));
    }
    case 'shot': {
      mkdirSync(dirname(positional[0]), { recursive: true });
      // Ask the socket who it is: a second copy of the app left running has a window of its own, and imaging
      // that one photographs a session nobody is driving.
      const { pid } = await send({ op: 'ping' });
      if (process.platform === 'win32') return console.log(JSON.stringify(await shotWindows(pid, positional[0], Number(flag('wait', 20000)))));
      // Only ever image a window the window server calls on-screen. `screencapture -l` happily returns the
      // stale backing store of a window on another Space, which is a QA run photographing a screen that no
      // longer exists — the run would "prove" the state before the last click.
      const until = Date.now() + Number(flag('wait', 20000));
      let last = null;
      for (;;) {
        const target = windows('Inborn', false, pid).filter((w) => w.name && w.width > 300 && w.height > 300)[0];
        if (target) {
          try {
            // -l <window id>: only our own window is ever captured, never the screen.
            execFileSync('screencapture', ['-x', '-o', '-l', String(target.id), positional[0]], { stdio: 'pipe' });
            // A window that has not repainted since its last resize images as empty chrome, and `screencapture`
            // reports that as a success — a run would file a blank PNG as proof. PNG of a flat image carries
            // almost no IDAT: this app's real frames run 70-100 KB per megapixel, an empty one about 20.
            // Points to pixels: the capture is Retina, two pixels per point each way.
            if (paintedEnough(positional[0], target.width * target.height * 4)) return console.log(JSON.stringify({ file: positional[0], window: target }));
            last = new Error('the window imaged blank; it has not repainted since its last resize');
          } catch (e) { last = e; }
        }
        if (Date.now() > until) {
          throw new Error(target
            ? `the Inborn window refused to be imaged${last ? `: ${last.message}` : ''}`
            : 'the Inborn window is not on screen (a full-screen app owns the active Space); nothing was captured');
        }
        await sleep(700);
      }
    }
    case 'stop': {
      await send({ op: 'quit' }).catch(() => {});
      return;
    }
    default:
      throw new Error(`usage: qa-drive.mjs start|eval|wait|place|window|shot|stop`);
  }
}

main().catch((e) => { console.error(String(e.message || e)); process.exit(1); });
