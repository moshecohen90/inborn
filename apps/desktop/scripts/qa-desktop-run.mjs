#!/usr/bin/env node
/**
 * The desktop proof, unattended: launch the built app, walk onboarding, send one prompt on the Rust
 * engine, photograph the window, quit. No mouse, no keystrokes, no dialog — everything goes through the
 * `--features qa` control socket (`qa-drive.mjs`), and the capture only ever sees our own window
 * (`screencapture -l` on macOS, PrintWindow on Windows).
 *
 *   node qa-desktop-run.mjs --out docs/qa/desktop-run-2026-09-22 [--app <Inborn.app | inborn-desktop.exe>] [--prompt "…"] [--reset] [--quit]
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { windowStateFile } from './qa-platform.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const drive = join(here, 'qa-drive.mjs');
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};
const outDir = resolve(arg('out', join(here, '..', '..', '..', 'docs', 'qa', 'desktop-run')));
const prompt = arg('prompt', 'What is the capital of France? Answer in one sentence.');

const run = (...args) => execFileSync(process.execPath, [drive, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();
const evalJs = (js, timeout = 20000) => JSON.parse(run('eval', js, '--timeout', String(timeout)));
const waitJs = (js, timeout = 60000) => JSON.parse(run('wait', js, '--timeout', String(timeout)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The router keeps the screens behind the current one mounted, so a test id can exist several times over;
// getClientRects() is empty for the hidden ones, and the last visible match is the one on top.
const TOPMOST = `const all = [...document.querySelectorAll(SEL)].filter((e) => e.getClientRects().length > 0);
const el = all[all.length - 1];`;
// React Native Web's Pressable listens on pointer events, so a bare .click() is not a press.
const PRESS = `${TOPMOST}
if (!el) return null;
const opts = { bubbles: true, cancelable: true, pointerId: 1, isPrimary: true, button: 0 };
el.dispatchEvent(new PointerEvent('pointerdown', opts));
el.dispatchEvent(new PointerEvent('pointerup', opts));
el.dispatchEvent(new MouseEvent('click', opts));
return true;`;

const sel = (testId) => JSON.stringify(`[data-testid="${testId}"]`);
const js = (testId, body) => `const SEL = ${sel(testId)};\n${TOPMOST}\n${body}`;
const present = (testId) => evalJs(js(testId, 'return !!el;'));
const text = (testId) => evalJs(js(testId, 'return el && el.innerText.trim();'));
const press = (testId) => evalJs(`const SEL = ${sel(testId)};${PRESS}`);
// Onboarding enables some of its buttons only after the screen has finished revealing itself.
const pressable = (testId) => evalJs(js(testId, 'return !!el && el.getAttribute("aria-disabled") !== "true";'));
const waitFor = (testId, timeout = 60000) => waitJs(js(testId, 'return !!el;'), timeout);

let shotIndex = 0;
const shot = (name) => run('shot', join(outDir, `${String(++shotIndex).padStart(2, '0')}-${name}.png`));

async function main() {
  mkdirSync(outDir, { recursive: true });
  const result = { startedAt: new Date().toISOString(), prompt, steps: [] };
  const step = (name, value) => { result.steps.push({ name, value }); console.log(`· ${name}: ${JSON.stringify(value)}`); };

  if (process.argv.includes('--reset')) {
    // tauri-plugin-window-state would otherwise restore whatever size the last run left, and the proof is
    // about the window tauri.conf.json configures.
    rmSync(windowStateFile(process.platform, process.env, homedir()), { force: true });
  }
  step('launch', JSON.parse(run('start', ...(arg('app') ? ['--app', arg('app')] : []))));
  step('place', JSON.parse(run('place', '--width', arg('width', '1120'), '--height', arg('height', '720'))));
  waitJs('return document.readyState === "complete" && !!document.querySelector("div");', 60000);
  if (process.argv.includes('--reset')) {
    // Start at S01 every time: the shell keeps "onboarded" in the webview's localStorage, not in the vault.
    evalJs('localStorage.clear(); setTimeout(() => location.reload(), 50); return true;');
    await sleep(2500);
    waitJs('return document.readyState === "complete" && !!document.querySelector("div");', 60000);
    step('reset', 'localStorage cleared, page reloaded');
  }
  step('title', evalJs('return document.title;'));
  step('body-text-length', evalJs('return document.body.innerText.length;'));
  shot('launch');

  // Onboarding: press whichever of the known steps is on screen until the composer is, so a run that
  // resumes half-way through a previous one still finishes.
  const ONBOARDING = ['onboarding-continue', 'start-chatting', 'airplane-skip', 'sealed-start', 'lock-start'];
  let lastScreen = evalJs('return document.body.innerText.slice(0, 120);');
  const onboardingUntil = Date.now() + 180000;
  while (Date.now() < onboardingUntil && !present('composer-input')) {
    const next = ONBOARDING.find((id) => pressable(id));
    if (!next) { await sleep(1500); continue; }
    const screen = evalJs('return document.body.innerText.slice(0, 120);');
    step(`onboarding:${next}`, screen);
    // The launch shot already is the first onboarding screen.
    if (screen !== lastScreen || shotIndex > 1) shot(`onboarding-${next}`);
    lastScreen = screen;
    press(next);
    await sleep(1200);
  }

  waitFor('composer-input', 180000);
  step('layout', evalJs('return { width: window.innerWidth, height: window.innerHeight, sidebar: !!document.querySelector(\'[data-testid="wide-sidebar"]\') };'));
  step('model-chip', text('model-chip'));
  shot('chat-empty');

  evalJs(`
const SEL = ${sel('composer-input')};
${TOPMOST}
const input = el;
const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value').set;
setter.call(input, ${JSON.stringify(prompt)});
input.dispatchEvent(new Event('input', { bubbles: true }));
return input.value;`);
  press('send');
  step('sent', prompt);

  waitJs(js('assistant-text', 'return el && el.innerText.trim().length > 10 ? el.innerText.trim() : false;'), 300000);
  await sleep(2500);
  const answer = evalJs(js('assistant-text', 'return el && el.innerText.trim();'));
  step('answer', answer);
  if (present('ledger-toggle')) {
    press('ledger-toggle');
    await sleep(700);
    step('ledger', { tokPerSec: text('ledger-tokPerSec'), ttft: text('ledger-ttft'), tokens: text('ledger-tokens') });
  }
  shot('answer');

  result.finishedAt = new Date().toISOString();
  writeFileSync(join(outDir, 'run.json'), `${JSON.stringify(result, null, 2)}\n`);
  console.log(`\nwrote ${join(outDir, 'run.json')}`);
  if (process.argv.includes('--quit')) run('stop');
}

main().catch((e) => { console.error(String(e.stack || e)); process.exit(1); });
