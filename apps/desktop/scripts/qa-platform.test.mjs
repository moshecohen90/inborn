import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appBinary, defaultApp, qaEndpoint, vaultDir, windowStateFile } from './qa-platform.mjs';

test('Windows gets a stable loopback port per run dir, never a socket file', () => {
  const a = qaEndpoint('C:\\Users\\runner\\qa', 'win32');
  assert.match(a.env, /^tcp:127\.0\.0\.1:\d+$/);
  assert.deepEqual(a.connect, { host: '127.0.0.1', port: Number(a.env.split(':').pop()) });
  assert.ok(a.connect.port >= 40000 && a.connect.port < 60000);
  assert.equal(a.file, null);
  assert.deepEqual(qaEndpoint('C:\\Users\\runner\\qa', 'win32'), a);
  assert.notEqual(qaEndpoint('C:\\Users\\runner\\qa2', 'win32').connect.port, a.connect.port);
});

test('unix keeps the socket in the run dir unless the path is too long to bind', () => {
  assert.deepEqual(qaEndpoint('/tmp/q', 'darwin'), { env: '/tmp/q/control.sock', connect: { path: '/tmp/q/control.sock' }, file: '/tmp/q/control.sock' });
  const long = qaEndpoint(`/private/tmp/${'x'.repeat(120)}`, 'darwin');
  assert.match(long.env, /^\/tmp\/inborn-qa-[0-9a-f]{8}\.sock$/);
  assert.equal(long.file, long.env);
});

test('the app to launch: .app bundle on macOS, the .exe on Windows', () => {
  assert.equal(defaultApp('/r/src-tauri', 'darwin'), '/r/src-tauri/target/release/bundle/macos/Inborn.app');
  assert.equal(appBinary('/r/Inborn.app', 'darwin'), '/r/Inborn.app/Contents/MacOS/inborn-desktop');
  assert.equal(defaultApp('D:\\a\\src-tauri', 'win32'), 'D:\\a\\src-tauri\\target\\release\\inborn-desktop.exe');
  assert.equal(appBinary('D:\\t\\release\\inborn-desktop.exe', 'win32'), 'D:\\t\\release\\inborn-desktop.exe');
});

test('window state and the model vault follow Tauri app dirs per OS', () => {
  const env = { APPDATA: 'C:\\Users\\runner\\AppData\\Roaming' };
  assert.equal(windowStateFile('win32', env, 'C:\\Users\\runner'), 'C:\\Users\\runner\\AppData\\Roaming\\com.inbornapp.desktop\\.window-state.json');
  assert.equal(vaultDir('win32', env, 'C:\\Users\\runner'), 'C:\\Users\\runner\\AppData\\Roaming\\com.inbornapp.desktop\\models');
  assert.equal(windowStateFile('darwin', {}, '/Users/m'), '/Users/m/Library/Application Support/com.inbornapp.desktop/.window-state.json');
  assert.equal(windowStateFile('linux', {}, '/home/m'), '/home/m/.config/com.inbornapp.desktop/.window-state.json');
  assert.equal(vaultDir('linux', {}, '/home/m'), '/home/m/.local/share/com.inbornapp.desktop/models');
});
