const test = require('node:test');
const assert = require('node:assert/strict');
const cp = require('node:child_process');

test('sync-web-ota verification script check', () => {
  try {
    cp.execSync('node scripts/sync-web-ota.js --check', { stdio: 'pipe' });
    assert.ok(true);
  } catch (err) {
    assert.fail('sync-web-ota --check failed: ' + err.message);
  }
});
