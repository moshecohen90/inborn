// Everything the QA driver does differently per OS, as pure functions so the Windows branches run in tests on a Mac.
import { createHash } from 'node:crypto';
import path from 'node:path';

export const IDENTIFIER = 'com.inbornapp.desktop';
const BINARY = 'inborn-desktop';

const pathFor = (platform) => (platform === 'win32' ? path.win32 : path.posix);

/**
 * The control channel for a run directory. Unix: a socket file (bound only under ~100 bytes, so a long run dir falls
 * back to /tmp). Windows has no unix sockets in the app, so a loopback port derived from the run dir, which keeps two
 * run dirs from colliding without either side having to pick and report a port.
 */
export function qaEndpoint(runDir, platform = process.platform) {
  const hash = createHash('sha1').update(runDir).digest('hex');
  if (platform === 'win32') {
    const port = 40000 + (parseInt(hash.slice(0, 8), 16) % 20000);
    return { env: `tcp:127.0.0.1:${port}`, connect: { host: '127.0.0.1', port }, file: null };
  }
  const inRunDir = path.posix.join(runDir, 'control.sock');
  const socket = Buffer.byteLength(inRunDir) < 100 ? inRunDir : path.posix.join('/tmp', `inborn-qa-${hash.slice(0, 8)}.sock`);
  return { env: socket, connect: { path: socket }, file: socket };
}

/** The built app a run launches when `--app` is not given: the .app bundle on macOS, the bare release binary elsewhere. */
export function defaultApp(srcTauri, platform = process.platform) {
  const p = pathFor(platform);
  if (platform === 'darwin') return p.join(srcTauri, 'target', 'release', 'bundle', 'macos', 'Inborn.app');
  return p.join(srcTauri, 'target', 'release', platform === 'win32' ? `${BINARY}.exe` : BINARY);
}

/** `--app` may name a macOS bundle; anything else is already the executable. */
export function appBinary(app, platform = process.platform) {
  const p = pathFor(platform);
  return platform === 'darwin' && app.endsWith('.app') ? p.join(app, 'Contents', 'MacOS', BINARY) : app;
}

/** Tauri's app_data_dir (the model vault) or app_config_dir (tauri-plugin-window-state); one folder except on Linux. */
export function appDir(kind, platform = process.platform, env = process.env, home = '') {
  const p = pathFor(platform);
  if (platform === 'darwin') return p.join(home, 'Library', 'Application Support', IDENTIFIER);
  if (platform === 'win32') return p.join(env.APPDATA ?? p.join(home, 'AppData', 'Roaming'), IDENTIFIER);
  if (kind === 'config') return p.join(env.XDG_CONFIG_HOME ?? p.join(home, '.config'), IDENTIFIER);
  return p.join(env.XDG_DATA_HOME ?? p.join(home, '.local', 'share'), IDENTIFIER);
}

export const windowStateFile = (platform, env, home) => pathFor(platform).join(appDir('config', platform, env, home), '.window-state.json');
export const vaultDir = (platform, env, home) => pathFor(platform).join(appDir('data', platform, env, home), 'models');
