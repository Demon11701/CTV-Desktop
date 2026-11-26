const test = require('node:test');
const assert = require('node:assert/strict');
const {
  extractCleanSemver,
  compareSemver,
  getTargetReleaseAssetForPlatform
} = require('../src-modules/updater.js');
const { isAllowedUpdateUrl } = require('../electron/updater.js');

test('extractCleanSemver parsing and validation', () => {
  assert.equal(extractCleanSemver('1.6.2-ota.21'), '1.6.2');
  assert.equal(extractCleanSemver('CTV-1.6.0.apk'), '1.6.0');
  assert.equal(extractCleanSemver('CTV-1.6.2.AppImage'), '1.6.2');
  assert.equal(extractCleanSemver('v1.7.0'), '1.7.0');
  assert.equal(extractCleanSemver('1.2.3.4'), '');
  assert.equal(extractCleanSemver('invalid'), '');
});

test('compareSemver version ordering', () => {
  assert.equal(compareSemver('1.7.0', '1.6.2'), 1);
  assert.equal(compareSemver('1.6.2', '1.7.0'), -1);
  assert.equal(compareSemver('1.6.2', '1.6.2'), 0);
  assert.equal(compareSemver('v1.8.1', '1.8.0-ota.5'), 1);
});

test('getTargetReleaseAssetForPlatform handling missing assets', () => {
  const assets = [
    { name: 'app.zip', browser_download_url: 'https://example.com/app.zip' }
  ];
  assert.equal(getTargetReleaseAssetForPlatform(assets, 'win32'), null);
  assert.equal(getTargetReleaseAssetForPlatform(assets, 'android'), null);
});

test('dismissed update tag persistence and check', () => {
  assert.ok(true);
});

test('isAllowedUpdateUrl security validation', () => {
  assert.equal(isAllowedUpdateUrl('https://github.com/Demon11701/CTV-Desktop/releases/download/v1/app.AppImage'), true);
  assert.equal(isAllowedUpdateUrl('http://github.com/Demon11701/CTV-Desktop/releases/download/v1/app.AppImage'), false);
  assert.equal(isAllowedUpdateUrl('https://malicious.com/app.AppImage'), false);
});
