/**
 * CTV Multiplatform Authoritative GitHub Release Updater (Single Source of Truth)
 */
(function () {
  var GITHUB_LATEST_URL = 'https://api.github.com/repos/Demon11701/CTV-Desktop/releases/latest';
  var ALTSTORE_REPO_URL = 'https://raw.githubusercontent.com/Demon11701/CTV-Desktop/main/altstore-repo.json';
  var GH_CACHE_KEY = 'ctv_gh_release_cache_v2';
  var DISMISSED_TAG_KEY = 'ctv_dismissed_update_v1';
  var GH_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
  var ANDROID_BASE_FLOOR_VER = '1.6.0';

  function extractCleanSemver(raw) {
    if (!raw || typeof raw !== 'string') return '';
    var cleaned = raw.trim().replace(/-ota\.\d+/gi, '');
    var m = cleaned.match(/(?:^|[^0-9.])(\d+)\.(\d+)(?:\.(\d+))?(?!\d|\.\d)/);
    if (!m) return '';
    return String(parseInt(m[1], 10) || 0) + '.' + String(parseInt(m[2], 10) || 0) + '.' + String(parseInt(m[3] || '0', 10) || 0);
  }

  function parseSemver(v) {
    var clean = extractCleanSemver(String(v || ''));
    if (!clean) return [0, 0, 0];
    var parts = clean.split('.').map(function (n) { return parseInt(n, 10) || 0; });
    while (parts.length < 3) parts.push(0);
    return parts;
  }

  function compareSemver(remoteVer, localVer) {
    var r = parseSemver(remoteVer);
    var l = parseSemver(localVer);
    for (var i = 0; i < 3; i++) {
      if (r[i] > l[i]) return 1;
      if (r[i] < l[i]) return -1;
    }
    return 0;
  }

  function isNewerVersion(remoteVer, localVer) {
    return compareSemver(remoteVer, localVer) > 0;
  }

  function detectPlatform(winRef, navRef) {
    var win = winRef || (typeof window !== 'undefined' ? window : {});
    var nav = navRef || (typeof navigator !== 'undefined' ? navigator : {});
    if (win.__ctvTestPlatformOverride) return String(win.__ctvTestPlatformOverride);
    if (win.DesktopBridge && win.DesktopBridge.isDesktop) {
      if (win.DesktopBridge.platform === 'win32') return 'windows';
      if (win.DesktopBridge.platform === 'linux') return 'linux';
    }
    var ua = nav.userAgent || '';
    var navPlat = nav.platform || '';
    var maxTouch = typeof nav.maxTouchPoints === 'number' ? nav.maxTouchPoints : 0;
    var capPlatform = '';
    try {
      if (win.Capacitor && typeof win.Capacitor.getPlatform === 'function') {
        capPlatform = String(win.Capacitor.getPlatform() || '').toLowerCase();
      }
    } catch (e) {}

    if (capPlatform === 'ios' || /iPhone|iPad|iPod/i.test(ua) || (navPlat === 'MacIntel' && maxTouch > 1)) {
      return 'ios';
    }
    var hasNativeAndroidBridge = Boolean(
      win.AndroidBridge &&
      (typeof win.AndroidBridge.playChannelFull === 'function' ||
       typeof win.AndroidBridge.downloadAndInstallApk === 'function')
    );
    if (capPlatform === 'android' || hasNativeAndroidBridge || /Android/i.test(ua)) {
      return 'android';
    }
    if (/Windows/i.test(ua) || /Win32|Win64/i.test(navPlat)) {
      return 'windows';
    }
    return 'linux';
  }

  function getInstalledBinaryVersion(platform, winRef, navRef) {
    var win = winRef || (typeof window !== 'undefined' ? window : {});
    var plat = platform || detectPlatform(win, navRef);
    if (plat === 'windows' || plat === 'linux') {
      if (win.DesktopBridge && typeof win.DesktopBridge.appVersion === 'string') {
        var dbVer = win.DesktopBridge.appVersion.trim();
        var elVer = String(win.DesktopBridge.electronVersion || '').trim();
        var cleanDbVer = extractCleanSemver(dbVer);
        if (cleanDbVer && dbVer !== elVer) return cleanDbVer;
      }
      var deskFallback = extractCleanSemver(win.__ctvRuntimeAppVersion || win.CTV_APP_VERSION || '');
      return deskFallback || '1.6.2';
    }
    if (plat === 'android') {
      var explicitApkVer = extractCleanSemver(win.CTV_ANDROID_APK_VERSION || '');
      if (explicitApkVer && compareSemver(explicitApkVer, ANDROID_BASE_FLOOR_VER) >= 0) {
        return explicitApkVer;
      }
      if (win.AndroidBridge && typeof win.AndroidBridge.getAppVersionName === 'function') {
        try {
          var rawBridgeVer = String(win.AndroidBridge.getAppVersionName() || '').trim();
          var cleanBridgeVer = extractCleanSemver(rawBridgeVer);
          if (cleanBridgeVer && compareSemver(cleanBridgeVer, ANDROID_BASE_FLOOR_VER) >= 0) {
            return cleanBridgeVer;
          }
        } catch (e) {}
      }
      var bundleAndroidVer = extractCleanSemver(win.CTV_APP_VERSION || '');
      if (bundleAndroidVer && compareSemver(bundleAndroidVer, ANDROID_BASE_FLOOR_VER) >= 0) {
        return bundleAndroidVer;
      }
      return ANDROID_BASE_FLOOR_VER;
    }
    if (plat === 'ios') {
      var nativeIos = extractCleanSemver(win.__ctvNativeIosVersion || '');
      if (nativeIos) return nativeIos;
      var bundleIos = extractCleanSemver(win.CTV_APP_VERSION || '');
      return bundleIos || '1.6.0';
    }
    return extractCleanSemver(win.CTV_APP_VERSION || '') || '1.6.2';
  }

  function getTargetReleaseAssetForPlatform(release, platform, winRef, navRef) {
    if (!release || !Array.isArray(release.assets) || !release.assets.length) return null;
    var plat = platform || detectPlatform(winRef, navRef);
    var extRe = null;
    if (plat === 'android') extRe = /\.apk(\?|$)/i;
    else if (plat === 'ios') extRe = /\.ipa(\?|$)/i;
    else if (plat === 'windows') extRe = /\.exe(\?|$)/i;
    else extRe = /\.appimage(\?|$)/i;

    for (var i = 0; i < release.assets.length; i++) {
      var a = release.assets[i];
      if (!a) continue;
      var aName = String(a.name || '').trim();
      var aUrl = String(a.browser_download_url || a.url || '').trim();
      var urlFile = aUrl ? (aUrl.split('?')[0].split('/').pop() || '') : '';
      if (!aUrl) continue;
      if (!extRe.test(aName) && !extRe.test(urlFile)) continue;

      var assetVer = extractCleanSemver(aName) || extractCleanSemver(urlFile);
      if (!assetVer) {
        assetVer = extractCleanSemver(String(release.tag_name || release.name || ''));
      }
      if (!assetVer) return null;
      return {
        name: aName || urlFile,
        url: aUrl,
        version: assetVer
      };
    }
    return null;
  }

  function resolveEffectiveReleaseVersion(release, platform, winRef, navRef) {
    var target = getTargetReleaseAssetForPlatform(release, platform, winRef, navRef);
    return target ? target.version : '';
  }

  function ctvFetchWithTimeout(url, opts, timeoutMs, winRef) {
    var win = winRef || (typeof window !== 'undefined' ? window : {});
    var ms = timeoutMs || 5000;
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, ms) : null;
    var fetchOpts = Object.assign({}, opts || {});
    if (ctrl) fetchOpts.signal = ctrl.signal;
    var fn = win.__ctvTrueNativeFetch || (typeof win.fetch === 'function' ? win.fetch.bind(win) : fetch);
    return fn(url, fetchOpts).finally(function () {
      if (timer) clearTimeout(timer);
    });
  }

  function persistDismissedUpdateTag(tag, assetVersion, storageRef, sessStorageRef, winRef) {
    var win = winRef || (typeof window !== 'undefined' ? window : {});
    var stor = storageRef || (win && win.localStorage ? win.localStorage : null);
    var sess = sessStorageRef || (win && win.sessionStorage ? win.sessionStorage : null);
    var rawTag = String(tag || '').trim();
    var cleanVer = extractCleanSemver(assetVersion || rawTag);
    var persistVal = cleanVer || rawTag;
    if (!persistVal) return;
    if (sess) {
      try {
        if (rawTag) sess.setItem('ctv_gh_update_postponed_' + rawTag, '1');
        if (cleanVer) sess.setItem('ctv_gh_update_postponed_' + cleanVer, '1');
      } catch (e) {}
    }
    if (stor) {
      try { stor.setItem(DISMISSED_TAG_KEY, persistVal); } catch (e) {}
    }
    if (typeof win.ctvPersistDesktopState === 'function') {
      win.ctvPersistDesktopState({ dismissedUpdateTag: persistVal });
    }
  }

  function isUpdateTagDismissed(tag, assetVersion, storageRef, sessStorageRef, winRef) {
    var win = winRef || (typeof window !== 'undefined' ? window : null);
    var stor = storageRef || (win && win.localStorage ? win.localStorage : null);
    var sess = sessStorageRef || (win && win.sessionStorage ? win.sessionStorage : null);
    var rawTag = String(tag || '').trim();
    var cleanTarget = extractCleanSemver(assetVersion || rawTag);
    try {
      if (sess) {
        if (rawTag && sess.getItem('ctv_gh_update_postponed_' + rawTag)) return true;
        if (cleanTarget && sess.getItem('ctv_gh_update_postponed_' + cleanTarget)) return true;
      }
      var saved = stor ? String(stor.getItem(DISMISSED_TAG_KEY) || '').trim() : '';
      if (!saved) return false;
      if (rawTag && saved === rawTag) return true;
      if (cleanTarget && saved === cleanTarget) return true;
      var cleanSaved = extractCleanSemver(saved);
      if (cleanTarget && cleanSaved && compareSemver(cleanTarget, cleanSaved) <= 0) return true;
    } catch (e) {}
    return false;
  }

  function clearUpdatePoll(winRef) {
    var win = winRef || (typeof window !== 'undefined' ? window : {});
    if (win.__ctvUpdatePollTimer) {
      clearInterval(win.__ctvUpdatePollTimer);
      win.__ctvUpdatePollTimer = null;
    }
  }

  function removeUpdateBanner(docRef) {
    var doc = docRef || (typeof document !== 'undefined' ? document : null);
    if (!doc) return;
    try {
      var banners = doc.querySelectorAll('#ctv-update-banner');
      for (var i = 0; i < banners.length; i++) {
        if (banners[i] && banners[i].parentNode) banners[i].parentNode.removeChild(banners[i]);
      }
    } catch (e) {}
  }

  function restoreDpadFocusAfterUpdateModalSuppress(modalEl, docRef) {
    var doc = docRef || (typeof document !== 'undefined' ? document : null);
    if (!doc) return;
    try {
      var active = doc.activeElement;
      var trappedInModal = Boolean(active && modalEl && modalEl.contains(active));
      if (!trappedInModal && active && active !== doc.body && active !== doc.documentElement) {
        return;
      }
      if (trappedInModal && typeof active.blur === 'function') {
        try { active.blur(); } catch (e) {}
      }
      var target =
        doc.querySelector('#content .ctv-hero-btn') ||
        doc.querySelector('#content .card.focusable') ||
        doc.querySelector('#content .card') ||
        doc.querySelector('#content .agenda-card') ||
        doc.querySelector('.menu-item.active') ||
        doc.querySelector('.menu-item');
      if (target && typeof target.focus === 'function') {
        try { target.focus({ preventScroll: true }); } catch (e) { try { target.focus(); } catch (x) {} }
      }
    } catch (e) {}
  }

  function ctvSuppressStaleUpdateUI(forceSuppress, winRef, docRef) {
    var win = winRef || (typeof window !== 'undefined' ? window : {});
    var doc = docRef || (typeof document !== 'undefined' ? document : null);
    if (win.__ctvAuthoritativeUpdateActive && !forceSuppress) return;
    try {
      clearUpdatePoll(win);
      removeUpdateBanner(doc);
      if (!doc) return;
      var bell = doc.getElementById('update-bell');
      if (bell) {
        bell.classList.add('hidden');
        bell.onclick = null;
      }
      var modal = doc.getElementById('update-modal');
      if (modal && !modal.classList.contains('hidden')) {
        modal.classList.add('hidden');
        restoreDpadFocusAfterUpdateModalSuppress(modal, doc);
      }
    } catch (e) {}
  }

  function initUpdater(opts) {
    opts = opts || {};
    var isOta = Boolean(opts.isOta);
    var win = opts.win || (typeof window !== 'undefined' ? window : {});
    var doc = opts.doc || (typeof document !== 'undefined' ? document : null);
    var nav = opts.nav || (typeof navigator !== 'undefined' ? navigator : {});
    var stor = opts.localStorage || (win && win.localStorage ? win.localStorage : null);
    var sess = opts.sessionStorage || (win && win.sessionStorage ? win.sessionStorage : null);
    var latestReleaseData = null;

    if (stor) {
      try { stor.removeItem('ctv_gh_release_cache_v1'); } catch (e) {}
    }

    function iconHtml(name, size) {
      return typeof win.ctvIcon === 'function' ? win.ctvIcon(name, size) : '';
    }

    function cancelStaleUpdateSweeps() {
      if (Array.isArray(win.__ctvSuppressSweepTimers)) {
        win.__ctvSuppressSweepTimers.forEach(function (tid) {
          try { clearTimeout(tid); } catch (e) {}
        });
      }
      win.__ctvSuppressSweepTimers = [];
    }

    function scheduleStaleUpdateSweeps() {
      win.__ctvAuthoritativeUpdateActive = false;
      cancelStaleUpdateSweeps();
      ctvSuppressStaleUpdateUI(true, win, doc);
      if (opts.skipAutoCheck) return;
      var delays = [400, 1800, 3500];
      for (var i = 0; i < delays.length; i++) {
        (function (ms) {
          var tid = setTimeout(function () {
            if (!win.__ctvAuthoritativeUpdateActive) {
              ctvSuppressStaleUpdateUI(true, win, doc);
            }
          }, ms);
          win.__ctvSuppressSweepTimers.push(tid);
        })(delays[i]);
      }
    }

    function installUnauthorizedUpdateModalGuard() {
      var ObserverCtor = win.MutationObserver || (typeof MutationObserver === 'function' ? MutationObserver : null);
      if (!doc || typeof ObserverCtor !== 'function') return;
      try {
        if (win.__ctvUpdateModalGuardObserver) {
          if (!isOta) return;
          try { win.__ctvUpdateModalGuardObserver.disconnect(); } catch (e) {}
        }
        var obs = new ObserverCtor(function () {
          if (win.__ctvAuthoritativeUpdateActive) return;
          var modal = doc.getElementById('update-modal');
          var bell = doc.getElementById('update-bell');
          var modalVisible = Boolean(modal && !modal.classList.contains('hidden'));
          var bellVisible = Boolean(bell && !bell.classList.contains('hidden'));
          if (modalVisible || bellVisible) {
            ctvSuppressStaleUpdateUI(true, win, doc);
          }
        });
        var mEl = doc.getElementById('update-modal');
        var bEl = doc.getElementById('update-bell');
        if (mEl) obs.observe(mEl, { attributes: true, attributeFilter: ['class'] });
        if (bEl) obs.observe(bEl, { attributes: true, attributeFilter: ['class'] });
        win.__ctvUpdateModalGuardObserver = obs;
      } catch (e) {}
    }

    function resolveInstalledBinaryVersionAsync(platform) {
      var plat = platform || detectPlatform(win, nav);
      if ((plat === 'windows' || plat === 'linux') && win.DesktopBridge && typeof win.DesktopBridge.getRuntimeInfo === 'function') {
        return new Promise(function (resolve) {
          var settled = false;
          var t = setTimeout(function () {
            if (!settled) { settled = true; resolve(getInstalledBinaryVersion(plat, win, nav)); }
          }, 900);
          Promise.resolve(win.DesktopBridge.getRuntimeInfo())
            .then(function (info) {
              if (settled) return;
              settled = true;
              clearTimeout(t);
              if (info && typeof info.appVersion === 'string') {
                var elV = String(info.electronVersion || win.DesktopBridge.electronVersion || '').trim();
                var cleanV = extractCleanSemver(info.appVersion);
                if (cleanV && info.appVersion.trim() !== elV) {
                  win.__ctvRuntimeAppVersion = cleanV;
                  resolve(cleanV);
                  return;
                }
              }
              resolve(getInstalledBinaryVersion(plat, win, nav));
            })
            .catch(function () {
              if (!settled) { settled = true; clearTimeout(t); resolve(getInstalledBinaryVersion(plat, win, nav)); }
            });
        });
      }
      if (plat === 'ios' && win.Capacitor && win.Capacitor.Plugins && win.Capacitor.Plugins.App && typeof win.Capacitor.Plugins.App.getInfo === 'function') {
        return new Promise(function (resolve) {
          var settled = false;
          var t = setTimeout(function () {
            if (!settled) { settled = true; resolve(getInstalledBinaryVersion('ios', win, nav)); }
          }, 1000);
          Promise.resolve(win.Capacitor.Plugins.App.getInfo())
            .then(function (info) {
              if (settled) return;
              settled = true;
              clearTimeout(t);
              var cleanIos = info && typeof info.version === 'string' ? extractCleanSemver(info.version) : '';
              if (cleanIos) {
                win.__ctvNativeIosVersion = cleanIos;
                resolve(cleanIos);
                return;
              }
              resolve(getInstalledBinaryVersion('ios', win, nav));
            })
            .catch(function () {
              if (!settled) { settled = true; clearTimeout(t); resolve(getInstalledBinaryVersion('ios', win, nav)); }
            });
        });
      }
      return Promise.resolve(getInstalledBinaryVersion(plat, win, nav));
    }

    function showGitHubUpdateModal(release, targetAssetOverride) {
      removeUpdateBanner(doc);
      if (!doc) return;
      var modal = doc.getElementById('update-modal');
      if (!modal || !release) return;

      var platform = detectPlatform(win, nav);
      var targetAsset = targetAssetOverride || getTargetReleaseAssetForPlatform(release, platform, win, nav);
      if (!targetAsset) {
        ctvSuppressStaleUpdateUI(true, win, doc);
        return;
      }

      cancelStaleUpdateSweeps();
      win.__ctvAuthoritativeUpdateActive = true;

      var displayVer = 'v' + targetAsset.version;
      var rawTag = String(release.tag_name || release.name || displayVer);

      var titleEl = doc.getElementById('update-version-title');
      var changelogEl = doc.getElementById('update-changelog');
      var progressWrap = doc.getElementById('update-progress-container');
      var progressBar = doc.getElementById('update-progress-bar');
      var progressPct = doc.getElementById('update-progress-percent');
      var progressLbl = doc.getElementById('update-progress-label');
      var btnInstall = doc.getElementById('btn-update-install');
      var btnLater = doc.getElementById('btn-update-later');

      if (titleEl) titleEl.textContent = 'CTV ' + displayVer;
      if (changelogEl) {
        changelogEl.textContent =
          release.body ||
          (platform === 'ios'
            ? 'Nueva versión disponible. Actualiza directamente desde SideStore sin usar PC.'
            : 'Hay una nueva versión disponible en GitHub.');
      }
      if (progressWrap) progressWrap.classList.add('hidden');
      if (progressBar) progressBar.style.width = '0%';
      if (progressPct) progressPct.textContent = '0%';

      if (btnInstall) {
        btnInstall.disabled = false;
        if (platform === 'ios') {
          btnInstall.innerHTML = iconHtml('bell', 16) + '<span>Actualizar en SideStore</span>';
        } else if (platform === 'android') {
          btnInstall.innerHTML = iconHtml('bell', 16) + '<span>Actualizar APK (' + displayVer + ')</span>';
        } else if (platform === 'windows') {
          btnInstall.innerHTML = iconHtml('bell', 16) + '<span>Actualizar .EXE (' + displayVer + ')</span>';
        } else {
          btnInstall.innerHTML = iconHtml('bell', 16) + '<span>Actualizar .AppImage (' + displayVer + ')</span>';
        }

        function triggerDesktopAutoReplace(dlUrl) {
          if (!dlUrl) return;
          var hasProxy = typeof win.ctvIsDesktopProxyAvailable === 'function' && win.ctvIsDesktopProxyAvailable();
          if (!hasProxy) {
            if (typeof win.open === 'function') win.open(dlUrl, '_blank');
            return;
          }
          clearUpdatePoll(win);
          if (progressWrap) progressWrap.classList.remove('hidden');
          if (progressLbl) progressLbl.textContent = 'Descargando e instalando automáticamente…';
          btnInstall.disabled = true;

          var startPromise = (win.DesktopBridge && typeof win.DesktopBridge.startSelfUpdate === 'function')
            ? win.DesktopBridge.startSelfUpdate(dlUrl)
            : ctvFetchWithTimeout('/__ctv_self_update?url=' + encodeURIComponent(dlUrl), {}, 6000, win).then(function (r) { return r.json(); });

          var getStatus = function () {
            if (win.DesktopBridge && typeof win.DesktopBridge.getSelfUpdateStatus === 'function') {
              return win.DesktopBridge.getSelfUpdateStatus();
            }
            return ctvFetchWithTimeout('/__ctv_self_update_status', {}, 4000, win).then(function (r) { return r.json(); });
          };

          startPromise
            .then(function (res) {
              if (res && res.ok === false) throw new Error(res.error || 'update-rejected');
              win.__ctvUpdatePollTimer = setInterval(function () {
                getStatus()
                  .then(function (st) {
                    if (!st) return;
                    var pct = st.percent || 0;
                    if (progressBar) progressBar.style.width = pct + '%';
                    if (progressPct) progressPct.textContent = pct + '%';
                    if (st.state === 'downloading') {
                      if (progressLbl) progressLbl.textContent = 'Descargando actualización… ' + pct + '%';
                    } else if (st.state === 'restarting') {
                      clearUpdatePoll(win);
                      if (progressLbl) progressLbl.textContent = '¡Actualización lista! Reiniciando CTV…';
                    } else if (st.state === 'error') {
                      clearUpdatePoll(win);
                      btnInstall.disabled = false;
                      if (progressLbl) progressLbl.textContent = 'Abriendo descarga directa…';
                      if (typeof win.open === 'function') win.open(dlUrl, '_blank');
                    }
                  })
                  .catch(function () {});
              }, 450);
            })
            .catch(function () {
              clearUpdatePoll(win);
              btnInstall.disabled = false;
              if (typeof win.open === 'function') win.open(dlUrl, '_blank');
            });
        }

        btnInstall.onclick = function () {
          if (platform === 'ios') {
            win.location.href = 'sidestore://source?url=' + encodeURIComponent(ALTSTORE_REPO_URL);
            setTimeout(function () {
              win.location.href = 'sidestore://';
            }, 600);
            return;
          }
          if (platform === 'android') {
            var apkUrl = targetAsset.url;
            var bridge = win.AndroidBridge;
            if (bridge && typeof bridge.canRequestInstalls === 'function' && !bridge.canRequestInstalls()) {
              if (progressWrap) progressWrap.classList.remove('hidden');
              if (progressLbl) progressLbl.textContent = 'Habilita "Instalar apps desconocidas" y vuelve a Actualizar.';
              if (typeof bridge.openInstallSettings === 'function') bridge.openInstallSettings();
              return;
            }
            if (apkUrl && bridge && typeof bridge.downloadAndInstallApk === 'function') {
              if (progressWrap) progressWrap.classList.remove('hidden');
              btnInstall.disabled = true;
              bridge.downloadAndInstallApk(apkUrl);
              return;
            }
            if (apkUrl && typeof win.open === 'function') win.open(apkUrl, '_blank');
            return;
          }
          triggerDesktopAutoReplace(targetAsset.url);
        };
      }

      if (btnLater) {
        btnLater.style.display = '';
        btnLater.onclick = function () {
          clearUpdatePoll(win);
          persistDismissedUpdateTag(rawTag, targetAsset.version, stor, sess, win);
          scheduleStaleUpdateSweeps();
        };
      }

      modal.classList.remove('hidden');
      if (btnInstall && btnInstall.focus) btnInstall.focus();
    }

    function showNonIntrusiveUpdateBanner(release, targetAsset) {
      if (!release || !targetAsset || !doc || !doc.body) return;
      var rawTag = String(release.tag_name || release.name || ('v' + targetAsset.version));
      var displayVer = 'v' + targetAsset.version;
      if (isUpdateTagDismissed(rawTag, targetAsset.version, stor, sess)) {
        scheduleStaleUpdateSweeps();
        return;
      }
      removeUpdateBanner(doc);
      var banner = doc.createElement('div');
      banner.id = 'ctv-update-banner';
      banner.innerHTML =
        iconHtml('bell', 16) +
        '<span class="ctv-ub-txt" style="font-weight:600;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"></span>' +
        '<button type="button" id="ctv-ub-open" class="btn ctv-btn-primary focusable" tabindex="0" style="padding:5px 12px;font-weight:600;font-size:.82rem">Actualizar</button>' +
        '<button type="button" id="ctv-ub-close" class="btn focusable" tabindex="0" aria-label="Cerrar aviso" style="padding:6px 8px">' + iconHtml('close', 15) + '</button>';
      var ubTxt = banner.querySelector('.ctv-ub-txt');
      if (ubTxt) ubTxt.textContent = 'Actualización CTV ' + displayVer + ' disponible';
      doc.body.appendChild(banner);
      var openBtn = banner.querySelector('#ctv-ub-open');
      var closeBtn = banner.querySelector('#ctv-ub-close');
      if (openBtn) openBtn.onclick = function () { showGitHubUpdateModal(release, targetAsset); };
      if (closeBtn) {
        closeBtn.onclick = function () {
          persistDismissedUpdateTag(rawTag, targetAsset.version, stor, sess, win);
          scheduleStaleUpdateSweeps();
        };
      }
    }

    function applyReleaseResult(release, forceModal) {
      var platform = detectPlatform(win, nav);
      if (!release || (!release.tag_name && !release.name)) {
        scheduleStaleUpdateSweeps();
        return Promise.resolve({ updateAvailable: false, platform: platform, reason: 'invalid-release' });
      }
      var targetAsset = getTargetReleaseAssetForPlatform(release, platform, win, nav);
      if (!targetAsset) {
        scheduleStaleUpdateSweeps();
        return Promise.resolve({ updateAvailable: false, platform: platform, reason: 'missing-platform-asset' });
      }
      return resolveInstalledBinaryVersionAsync(platform).then(function (localVer) {
        if (!forceModal && compareSemver(targetAsset.version, localVer) <= 0) {
          scheduleStaleUpdateSweeps();
          return {
            updateAvailable: false,
            platform: platform,
            installedVersion: localVer,
            remoteVersion: targetAsset.version,
            reason: 'up-to-date'
          };
        }
        var rawTag = String(release.tag_name || release.name || ('v' + targetAsset.version));
        if (!forceModal && isUpdateTagDismissed(rawTag, targetAsset.version, stor, sess)) {
          scheduleStaleUpdateSweeps();
          return {
            updateAvailable: false,
            platform: platform,
            installedVersion: localVer,
            remoteVersion: targetAsset.version,
            dismissed: true,
            reason: 'dismissed'
          };
        }

        cancelStaleUpdateSweeps();
        win.__ctvAuthoritativeUpdateActive = true;
        latestReleaseData = release;

        var bell = doc ? doc.getElementById('update-bell') : null;
        if (bell) {
          bell.classList.remove('hidden');
          bell.onclick = function (e) {
            e.preventDefault();
            e.stopPropagation();
            showGitHubUpdateModal(latestReleaseData, targetAsset);
          };
        }
        if (forceModal) {
          showGitHubUpdateModal(release, targetAsset);
        } else {
          showNonIntrusiveUpdateBanner(release, targetAsset);
        }
        return {
          updateAvailable: true,
          platform: platform,
          installedVersion: localVer,
          remoteVersion: targetAsset.version
        };
      });
    }

    function checkGitHubRelease(forceModal) {
      win.__ctvOtaAutoCheckDone = true;
      if (!forceModal && stor) {
        try {
          var rawCache = stor.getItem(GH_CACHE_KEY);
          if (rawCache) {
            var parsed = JSON.parse(rawCache);
            if (parsed && parsed.ts && (Date.now() - parsed.ts) < GH_CACHE_TTL_MS && parsed.data) {
              return applyReleaseResult(parsed.data, false);
            }
          }
        } catch (e) {}
      }

      if (nav && nav.onLine === false) {
        return Promise.resolve({ updateAvailable: false, reason: 'offline' });
      }

      return ctvFetchWithTimeout(GITHUB_LATEST_URL, {
        headers: { Accept: 'application/vnd.github+json' },
        cache: 'no-store'
      }, 5000, win)
        .then(function (r) {
          return r && r.ok ? r.json() : null;
        })
        .then(function (release) {
          if (!release || (!release.tag_name && !release.name)) {
            scheduleStaleUpdateSweeps();
            return { updateAvailable: false, reason: 'empty-response' };
          }
          if (stor) {
            try {
              stor.setItem(GH_CACHE_KEY, JSON.stringify({ ts: Date.now(), data: release }));
            } catch (e) {}
          }
          return applyReleaseResult(release, forceModal);
        })
        .catch(function () {
          return { updateAvailable: false, reason: 'network-error' };
        });
    }

    win.ctvCompareSemver = compareSemver;
    win.ctvDetectRuntimePlatform = function () { return detectPlatform(win, nav); };
    win.ctvGetInstalledBinaryVersion = function (p) { return getInstalledBinaryVersion(p, win, nav); };
    win.ctvGetAuthoritativeAppVersion = win.ctvGetInstalledBinaryVersion;
    win.ctvGetTargetReleaseAssetForPlatform = function (r, p) { return getTargetReleaseAssetForPlatform(r, p, win, nav); };
    win.ctvResolveEffectiveReleaseVersion = function (r, p) { return resolveEffectiveReleaseVersion(r, p, win, nav); };
    win.ctvFetchWithTimeout = function (u, o, m) { return ctvFetchWithTimeout(u, o, m, win); };
    win.ctvSuppressStaleUpdateUI = function (f) { return ctvSuppressStaleUpdateUI(f, win, doc); };

    if (!win.__ctvAuthoritativeUpdateActive) {
      ctvSuppressStaleUpdateUI(true, win, doc);
    }
    installUnauthorizedUpdateModalGuard();

    if (isOta) {
      win.__ctvOtaUpdaterOwned = true;
      win.checkCTVGitHubUpdate = checkGitHubRelease;
      if (!opts.skipAutoCheck && !win.__ctvOtaStartupReleaseTimer) {
        win.__ctvOtaStartupReleaseTimer = setTimeout(function () {
          win.__ctvOtaStartupReleaseTimer = null;
          if (!win.__ctvOtaAutoCheckDone && typeof win.checkCTVGitHubUpdate === 'function') {
            win.checkCTVGitHubUpdate(false);
          }
        }, 3600);
      }
    } else {
      if (!win.__ctvOtaUpdaterOwned) {
        win.checkCTVGitHubUpdate = checkGitHubRelease;
      }
      if (!opts.skipAutoCheck) {
        var scheduleReleaseCheck = function () {
          setTimeout(function () {
            if (win.__ctvOtaAutoCheckDone) return;
            if (typeof win.checkCTVGitHubUpdate === 'function') {
              win.checkCTVGitHubUpdate(false);
            }
          }, 4200);
        };
        if (typeof win.requestIdleCallback === 'function') {
          win.requestIdleCallback(scheduleReleaseCheck, { timeout: 5000 });
        } else {
          scheduleReleaseCheck();
        }
      }
    }

    return {
      detectPlatform: function () { return detectPlatform(win, nav); },
      getInstalledBinaryVersion: function (p) { return getInstalledBinaryVersion(p, win, nav); },
      resolveInstalledBinaryVersionAsync: resolveInstalledBinaryVersionAsync,
      getTargetReleaseAssetForPlatform: function (r, p) { return getTargetReleaseAssetForPlatform(r, p, win, nav); },
      showGitHubUpdateModal: showGitHubUpdateModal,
      applyReleaseResult: applyReleaseResult,
      checkGitHubRelease: checkGitHubRelease
    };
  }

  /* @ctv-browser-boot-start */
  if (typeof exports === 'undefined' && typeof window !== 'undefined') {
    window.__ctvInitUpdater = initUpdater;
  }
  /* @ctv-browser-boot-end */

  /* @ctv-node-exports-start */
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      GITHUB_LATEST_URL: GITHUB_LATEST_URL,
      ALTSTORE_REPO_URL: ALTSTORE_REPO_URL,
      GH_CACHE_KEY: GH_CACHE_KEY,
      DISMISSED_TAG_KEY: DISMISSED_TAG_KEY,
      GH_CACHE_TTL_MS: GH_CACHE_TTL_MS,
      ANDROID_BASE_FLOOR_VER: ANDROID_BASE_FLOOR_VER,
      extractCleanSemver: extractCleanSemver,
      parseSemver: parseSemver,
      compareSemver: compareSemver,
      isNewerVersion: isNewerVersion,
      detectPlatform: detectPlatform,
      getInstalledBinaryVersion: getInstalledBinaryVersion,
      getTargetReleaseAssetForPlatform: getTargetReleaseAssetForPlatform,
      resolveEffectiveReleaseVersion: resolveEffectiveReleaseVersion,
      ctvFetchWithTimeout: ctvFetchWithTimeout,
      persistDismissedUpdateTag: persistDismissedUpdateTag,
      isUpdateTagDismissed: isUpdateTagDismissed,
      ctvSuppressStaleUpdateUI: ctvSuppressStaleUpdateUI,
      initUpdater: initUpdater
    };
  }
  /* @ctv-node-exports-end */
})();
