#!/usr/bin/env node
// Drives the desktop app for QA with no mouse, no keystrokes and no focus stealing.
//
// It talks to the `--features qa` control socket (src-tauri/src/qa.rs): one JSON line out, one back.
// `start` launches the built app with the QA secret file so the keychain is never asked for an item a
// previous build's code identity created — that ask is the macOS password dialog.
//
//   node qa-drive.mjs start [--app <Inborn.app>] [--log <file>]
//   node qa-drive.mjs eval  'return document.title'
//   node qa-drive.mjs wait  'return !!document.querySelector("textarea")' [--timeout 30000]
//   node qa-drive.mjs place [--width 1120] [--height 720]
//   node qa-drive.mjs shot  <out.png>
//   node qa-drive.mjs window
//   node qa-drive.mjs stop
import { spawn, execFileSync } from 'node:child_process';
import { connect } from 'node:net';
import { mkdirSync, existsSync, openSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const runDir = process.env.INBORN_QA_DIR || join(tmpdir(), 'inborn-qa');
const socketPath = join(runDir, 'control.sock');
const keyFile = join(runDir, 'secrets.json');
const defaultApp = join(here, '..', 'src-tauri', 'target', 'release', 'bundle', 'macos', 'Inborn.app');

const argv = process.argv.slice(2);
const command = argv[0];
const positional = argv.slice(1).filter((a) => !a.startsWith('--'));
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
};

function send(request, { timeout = 30000 } = {}) {
  return new Promise((resolve, reject) => {
    const socket = connect(socketPath);
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
function windows(owner = 'Inborn') {
  const out = execFileSync('swift', [join(here, 'qa-windows.swift'), owner], { encoding: 'utf8' });
  return out.trim().split('\n').filter(Boolean).map((line) => {
    const [id, name, width, height] = line.split('\t');
    return { id: Number(id), name, width: Number(width), height: Number(height) };
  });
}

async function start() {
  const app = flag('app', defaultApp);
  const binary = join(app, 'Contents', 'MacOS', 'inborn-desktop');
  if (!existsSync(binary)) throw new Error(`no app at ${binary}`);
  mkdirSync(runDir, { recursive: true });
  rmSync(socketPath, { force: true });
  const log = flag('log', join(runDir, 'app.log'));
  // The log goes straight to a descriptor: a piped stdio would keep this launcher alive after unref().
  const logFd = openSync(log, 'a');
  const child = spawn(binary, [], {
    // The app sets NSApplicationActivationPolicyAccessory when INBORN_QA_SOCKET is set, so launching it
    // here never pulls focus away from whatever the Mac is doing.
    env: { ...process.env, INBORN_QA_SOCKET: socketPath, INBORN_QA_KEY_FILE: keyFile },
    stdio: ['ignore', logFd, logFd],
    detached: true,
  });
  child.unref();
  const info = await waitForSocket(60000);
  console.log(JSON.stringify({ ...info, launcherPid: child.pid, socket: socketPath, keyFile, log }));
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
    case 'window': return console.log(JSON.stringify(windows(flag('owner', 'Inborn'))));
    case 'place': {
      const request = { op: 'window' };
      for (const key of ['width', 'height', 'x', 'y']) if (flag(key) !== undefined) request[key] = Number(flag(key));
      return console.log(JSON.stringify(await send(request)));
    }
    case 'shot': {
      mkdirSync(dirname(positional[0]), { recursive: true });
      // The id is re-read on every attempt: a window mid-transition refuses to be imaged, and a webview
      // that has just been replaced has a new one.
      let last = null;
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const target = windows('Inborn').filter((w) => w.width > 300 && w.height > 300)[0];
        if (target) {
          try {
            // -l <window id>: only our own window is ever captured, never the screen.
            execFileSync('screencapture', ['-x', '-o', '-l', String(target.id), positional[0]], { stdio: 'pipe' });
            return console.log(JSON.stringify({ file: positional[0], window: target, attempt }));
          } catch (e) { last = e; }
        }
        await sleep(700);
      }
      throw new Error(`no image of the Inborn window after 6 attempts${last ? `: ${last.message}` : ''}`);
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
