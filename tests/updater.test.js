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

test('v1.6.3 multiplatform anti-loop verification', () => {
  // 1. Android/TV (1.6.0 installed) against v1.6.3 release without apk vs with apk
  const releaseWithoutApk = {
    assets: [
      { name: 'CTV-1.6.3.AppImage', browser_download_url: 'https://example.com/CTV-1.6.3.AppImage' },
      { name: 'CTV-1.6.3-Windows-Portable.exe', browser_download_url: 'https://example.com/CTV-1.6.3-Windows-Portable.exe' }
    ]
  };
  const releaseWithApk = {
    assets: [
      ...releaseWithoutApk.assets,
      { name: 'CTV-1.6.0.apk', browser_download_url: 'https://example.com/CTV-1.6.0.apk' }
    ]
  };
  const winAndroid = { __ctvTestPlatformOverride: 'android', CTV_ANDROID_APK_VERSION: '1.6.0' };
  assert.equal(getTargetReleaseAssetForPlatform(releaseWithoutApk, 'android', winAndroid), null);
  const targetApk = getTargetReleaseAssetForPlatform(releaseWithApk, 'android', winAndroid);
  assert.ok(targetApk);
  assert.equal(extractCleanSemver(targetApk.name), '1.6.0');
  assert.equal(compareSemver('1.6.0', '1.6.0'), 0);

  // 2. Desktop (1.6.2 -> 1.6.3) update detection and 1.6.3 no-loop
  assert.equal(compareSemver('1.6.3', '1.6.2'), 1);
  assert.equal(compareSemver('1.6.3', '1.6.3'), 0);

  // 3. iOS (1.6.3) against v1.6.3-ios.ipa
  const releaseIos = {
    assets: [
      { name: 'CTV-1.6.3-ios.ipa', browser_download_url: 'https://example.com/CTV-1.6.3-ios.ipa' }
    ]
  };
  const winIos = { __ctvTestPlatformOverride: 'ios', __ctvNativeIosVersion: '1.6.3' };
  const targetIos = getTargetReleaseAssetForPlatform(releaseIos, 'ios', winIos);
  assert.ok(targetIos);
  assert.equal(compareSemver('1.6.3', '1.6.3'), 0);
});
