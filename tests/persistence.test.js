const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const {
  writePersistentStateAtomic,
  readPersistentState,
  mergeServerScoresByUpdatedAt,
  isLoopbackAddress,
  MAX_STATE_BODY_BYTES
} = require('../electron/persistence.js');

test('atomic write and read persistent state', (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctv-test-'));
  t.after(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  const stateFile = path.join(tmpDir, 'state.json');
  const now = Date.now();
  const testData = { userPrefs: { theme: 'dark' }, serverScores: { 'host.com': { score: 10, ok: 5, fail: 0, avgMs: 200, updatedAt: now } } };

  writePersistentStateAtomic(testData, { stateFilePath: stateFile });
  const readBack = readPersistentState({ stateFilePath: stateFile });
  assert.equal(readBack.userPrefs.theme, 'dark');
  assert.equal(readBack.serverScores['host.com'].ok, 5);
});

test('mergeServerScoresByUpdatedAt merges correctly', () => {
  const existing = { 'a.com': { updatedAt: 100, ok: 5 } };
  const incoming = { 'a.com': { updatedAt: 200, ok: 10 }, 'b.com': { updatedAt: 150, ok: 8 } };
  const merged = mergeServerScoresByUpdatedAt(existing, incoming);
  assert.equal(merged['a.com'].ok, 10);
  assert.equal(merged['b.com'].ok, 8);
});

test('isLoopbackAddress validation', () => {
  assert.equal(isLoopbackAddress('127.0.0.1'), true);
  assert.equal(isLoopbackAddress('::1'), true);
  assert.equal(isLoopbackAddress('::ffff:127.0.0.1'), true);
  assert.equal(isLoopbackAddress('192.168.1.20'), false);
  assert.equal(isLoopbackAddress('8.8.8.8'), false);
});

test('MAX_STATE_BODY_BYTES constant is 256 * 1024', () => {
  assert.equal(MAX_STATE_BODY_BYTES, 256 * 1024);
});
