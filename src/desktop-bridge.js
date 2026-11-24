/**
 * Desktop & iOS Bridge + Fullscreen/Storage Helpers for CTV
 * Preserves native window.AndroidBridge on Android/Smart TV while providing
 * compatibility, atomic disk persistence, and IPC-safe fullscreen helpers on Desktop & iOS.
 */
(function () {
  if (window.__ctvDesktopBridgeInit) return;
  window.__ctvDesktopBridgeInit = true;
  window.CTV_APP_VERSION =
    (window.DesktopBridge && typeof window.DesktopBridge.appVersion === 'string' && window.DesktopBridge.appVersion) ||
    '1.6.2';

  window.__ctvIsFullscreen = false;
  document.addEventListener('fullscreenchange', function () {
    window.__ctvIsFullscreen = Boolean(document.fullscreenElement || document.webkitFullscreenElement);
  });
  if (window.DesktopBridge && typeof window.DesktopBridge.isFullscreen === 'function') {
    window.DesktopBridge.isFullscreen().then(function (isFs) {
      if (isFs) window.__ctvIsFullscreen = true;
    }).catch(function () {});
  }

  // Helper unificado de pantalla completa (usa IPC validado en Electron y Fullscreen API en Web/Mobile)
  window.ctvToggleFullscreen = function () {
    try {
      if (window.DesktopBridge && typeof window.DesktopBridge.toggleFullscreen === 'function') {
        return window.DesktopBridge.toggleFullscreen()
          .then(function (isFs) {
            window.__ctvIsFullscreen = Boolean(isFs);
            return window.__ctvIsFullscreen;
          })
          .catch(function () { return false; });
      }
      var doc = document;
      var fsEl = doc.fullscreenElement || doc.webkitFullscreenElement;
      if (fsEl) {
        if (doc.exitFullscreen) return doc.exitFullscreen().then(function () { window.__ctvIsFullscreen = false; return false; }).catch(function () { return false; });
        if (doc.webkitExitFullscreen) { doc.webkitExitFullscreen(); window.__ctvIsFullscreen = false; return Promise.resolve(false); }
      } else {
        var target = doc.getElementById('player-modal');
        var el = target && !target.classList.contains('hidden') ? target : doc.documentElement;
        if (el && el.requestFullscreen) return el.requestFullscreen().then(function () { window.__ctvIsFullscreen = true; return true; }).catch(function () { return false; });
        if (el && el.webkitRequestFullscreen) { el.webkitRequestFullscreen(); window.__ctvIsFullscreen = true; return Promise.resolve(true); }
      }
    } catch (e) {}
    return Promise.resolve(false);
  };

  window.ctvExitFullscreen = function () {
    try {
      window.__ctvIsFullscreen = false;
      var doc = document;
      var fsEl = doc.fullscreenElement || doc.webkitFullscreenElement;
      var domExit = null;
      if (fsEl) {
        if (doc.exitFullscreen) domExit = doc.exitFullscreen().catch(function () { return false; });
        else if (doc.webkitExitFullscreen) domExit = Promise.resolve(doc.webkitExitFullscreen());
      }
      if (window.DesktopBridge && typeof window.DesktopBridge.setFullscreen === 'function') {
        return window.DesktopBridge.setFullscreen(false).catch(function () { return false; });
      }
      if (domExit) return domExit;
    } catch (e) {}
    return Promise.resolve(false);
  };

  var FAV_MOVIES_KEY = 'pj2_favs_movies';
  var FAV_SERIES_KEY = 'pj2_favs_series';
  var FAVS_KEY = 'pj2_favs_slugs';
  var WATCHED_KEY = 'pj2_vistos';
  var PREFS_KEY = 'ctv_user_prefs_v1';
  var WATCH_PROGRESS_KEY = 'ctv_watch_progress_v1';
  var DISMISSED_UPD_KEY = 'ctv_dismissed_update_v1';
  var STATE_TS_KEY = 'ctv_state_updated_at';
  window.__ctvSupportsWatchProgressState = true;

  var isNativeAndroid = Boolean(window.AndroidBridge && typeof window.AndroidBridge.playChannelFull === 'function');
  var isCapNative = Boolean(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform()) || isNativeAndroid;
  var isDesktopRuntime = !isCapNative && (location.hostname === '127.0.0.1' || Boolean(window.DesktopBridge) || /Electron/i.test(navigator.userAgent || ''));

  function safeReadJson(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return fallback;
      var parsed = JSON.parse(raw);
      return parsed != null ? parsed : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function pruneWatchProgressLru(mapObj) {
    if (!mapObj || typeof mapObj !== 'object' || Array.isArray(mapObj)) return {};
    var entries = [];
    Object.keys(mapObj).forEach(function (rawKey) {
      var key = typeof rawKey === 'string' ? rawKey.trim() : '';
      if (!key || key.length > 180 || key === '__proto__' || key === 'constructor' || key === 'prototype') return;
      var val = mapObj[rawKey];
      if (!val || typeof val !== 'object' || Array.isArray(val)) return;
      if (typeof val.t !== 'number' || !isFinite(val.t) || val.t < 5) return;
      if (typeof val.d !== 'number' || !isFinite(val.d) || val.d <= 0) return;
      if (typeof val.updatedAt !== 'number' || !isFinite(val.updatedAt) || val.updatedAt <= 0) return;
      entries.push([
        key,
        {
          t: val.t,
          d: val.d,
          title: typeof val.title === 'string' ? val.title.slice(0, 160) : '',
          poster: typeof val.poster === 'string' ? val.poster.slice(0, 320) : '',
          type: val.type === 'serie' ? 'serie' : 'movie',
          slug: typeof val.slug === 'string' ? val.slug.slice(0, 140) : '',
          ep: typeof val.ep === 'string' ? val.ep.slice(0, 24) : '',
          updatedAt: val.updatedAt
        }
      ]);
    });
    entries.sort(function (a, b) { return b[1].updatedAt - a[1].updatedAt; });
    var out = {};
    for (var i = 0; i < entries.length && i < 60; i++) {
      out[entries[i][0]] = entries[i][1];
    }
    return out;
  }

  function mergeBySlug(localArr, diskArr) {
    var map = new Map();
    (Array.isArray(diskArr) ? diskArr : []).forEach(function (it) {
      if (it && typeof it === 'object' && it.slug) map.set(String(it.slug), it);
    });
    (Array.isArray(localArr) ? localArr : []).forEach(function (it) {
      if (it && typeof it === 'object' && it.slug) map.set(String(it.slug), Object.assign({}, map.get(String(it.slug)) || {}, it));
    });
    return Array.from(map.values());
  }

  function mergeStringLists(localArr, diskArr) {
    var set = new Set();
    (Array.isArray(diskArr) ? diskArr : []).forEach(function (s) { if (s) set.add(String(s)); });
    (Array.isArray(localArr) ? localArr : []).forEach(function (s) { if (s) set.add(String(s)); });
    return Array.from(set);
  }

  function collectLocalStateSnapshot(patch) {
    patch = patch || {};
    return {
      favMovies: Array.isArray(patch.favMovies) ? patch.favMovies : safeReadJson(FAV_MOVIES_KEY, []),
      favSeries: Array.isArray(patch.favSeries) ? patch.favSeries : safeReadJson(FAV_SERIES_KEY, []),
      favTvSlugs: Array.isArray(patch.favTvSlugs) ? patch.favTvSlugs : safeReadJson(FAVS_KEY, []),
      watched: Array.isArray(patch.watched) ? patch.watched : safeReadJson(WATCHED_KEY, []),
      userPrefs: patch.userPrefs && typeof patch.userPrefs === 'object' ? patch.userPrefs : safeReadJson(PREFS_KEY, {}),
      watchProgress: pruneWatchProgressLru(
        (patch && patch.watchProgress && typeof patch.watchProgress === 'object')
          ? patch.watchProgress
          : safeReadJson(WATCH_PROGRESS_KEY, {})
      ),
      dismissedUpdateTag:
        typeof patch.dismissedUpdateTag === 'string'
          ? patch.dismissedUpdateTag
          : (localStorage.getItem(DISMISSED_UPD_KEY) || '')
    };
  }

  function applyDiskStateToLocalStorage(diskState, forceReplace) {
    if (!diskState || typeof diskState !== 'object') return false;
    var diskTs = Number(diskState.updatedAt) || 0;
    if (!diskTs && !forceReplace) return false;
    var localTs = Number(localStorage.getItem(STATE_TS_KEY) || '0') || 0;
    var replaceLists = Boolean(forceReplace || (localTs > 0 && diskTs >= localTs));
    var changed = false;
    try {
      var curMovies = safeReadJson(FAV_MOVIES_KEY, []);
      var nextMovies = replaceLists ? (Array.isArray(diskState.favMovies) ? diskState.favMovies : curMovies) : mergeBySlug(curMovies, diskState.favMovies);
      if (JSON.stringify(nextMovies) !== JSON.stringify(curMovies)) {
        localStorage.setItem(FAV_MOVIES_KEY, JSON.stringify(nextMovies));
        changed = true;
      }

      var curSeries = safeReadJson(FAV_SERIES_KEY, []);
      var nextSeries = replaceLists ? (Array.isArray(diskState.favSeries) ? diskState.favSeries : curSeries) : mergeBySlug(curSeries, diskState.favSeries);
      if (JSON.stringify(nextSeries) !== JSON.stringify(curSeries)) {
        localStorage.setItem(FAV_SERIES_KEY, JSON.stringify(nextSeries));
        changed = true;
      }

      var curTv = safeReadJson(FAVS_KEY, []);
      var nextTv = replaceLists ? (Array.isArray(diskState.favTvSlugs) ? diskState.favTvSlugs : curTv) : mergeStringLists(curTv, diskState.favTvSlugs);
      if (JSON.stringify(nextTv) !== JSON.stringify(curTv)) {
        localStorage.setItem(FAVS_KEY, JSON.stringify(nextTv));
        changed = true;
      }

      var curWatched = safeReadJson(WATCHED_KEY, []);
      var nextWatched = replaceLists ? (Array.isArray(diskState.watched) ? diskState.watched : curWatched) : mergeStringLists(curWatched, diskState.watched);
      if (JSON.stringify(nextWatched) !== JSON.stringify(curWatched)) {
        localStorage.setItem(WATCHED_KEY, JSON.stringify(nextWatched));
        changed = true;
      }

      if (diskState.userPrefs && typeof diskState.userPrefs === 'object' && Object.keys(diskState.userPrefs).length > 0) {
        var curPrefs = safeReadJson(PREFS_KEY, {});
        var nextPrefs = replaceLists ? Object.assign({}, curPrefs, diskState.userPrefs) : Object.assign({}, diskState.userPrefs, curPrefs);
        localStorage.setItem(PREFS_KEY, JSON.stringify(nextPrefs));
      }

      if (diskState.watchProgress && typeof diskState.watchProgress === 'object' && !Array.isArray(diskState.watchProgress)) {
        var curProg = safeReadJson(WATCH_PROGRESS_KEY, {});
        var nextProg;
        if (replaceLists) {
          nextProg = pruneWatchProgressLru(diskState.watchProgress);
        } else {
          var mergedProg = {};
          var cleanDisk = pruneWatchProgressLru(diskState.watchProgress);
          var cleanCur = pruneWatchProgressLru(curProg);
          Object.keys(cleanDisk).forEach(function (k) {
            mergedProg[k] = cleanDisk[k];
          });
          Object.keys(cleanCur).forEach(function (k) {
            if (!mergedProg[k] || (cleanCur[k].updatedAt || 0) >= (mergedProg[k].updatedAt || 0)) {
              mergedProg[k] = cleanCur[k];
            }
          });
          nextProg = pruneWatchProgressLru(mergedProg);
        }
        if (JSON.stringify(nextProg) !== JSON.stringify(curProg)) {
          localStorage.setItem(WATCH_PROGRESS_KEY, JSON.stringify(nextProg));
          changed = true;
        }
      }

      if (diskState.dismissedUpdateTag) {
        localStorage.setItem(DISMISSED_UPD_KEY, String(diskState.dismissedUpdateTag));
      }
      if (diskTs > 0) {
        localStorage.setItem(STATE_TS_KEY, String(Math.max(diskTs, localTs)));
      }
    } catch (e) {}
    return changed;
  }

  window.ctvPersistDesktopState = function (patch, useBeacon) {
    if (!isDesktopRuntime) return Promise.resolve(null);
    try {
      var nowTs = Date.now();
      try { localStorage.setItem(STATE_TS_KEY, String(nowTs)); } catch (e) {}
      var snapshot = collectLocalStateSnapshot(patch);
      if (useBeacon && typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function' && location.hostname === '127.0.0.1') {
        try {
          navigator.sendBeacon('/__ctv_state', JSON.stringify(snapshot));
        } catch (e) {}
      }
      if (window.DesktopBridge && typeof window.DesktopBridge.savePersistentState === 'function') {
        return window.DesktopBridge.savePersistentState(snapshot).catch(function () { return null; });
      }
      if (location.hostname === '127.0.0.1' && typeof fetch === 'function') {
        var fFn = window.__ctvTrueNativeFetch || window.fetch.bind(window);
        return fFn('/__ctv_state', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-CTV-Local': '1' },
          body: JSON.stringify(snapshot),
          keepalive: true
        }).then(function (r) { return r.json(); }).catch(function () { return null; });
      }
    } catch (e) {}
    return Promise.resolve(null);
  };

  window.ctvHydratePersistentState = function (forceSyncXhr) {
    if (!isDesktopRuntime) return Promise.resolve(false);
    // 1. Hidratación síncrona temprana exclusivamente en Desktop loopback (127.0.0.1), nunca en Android/iOS Capacitor
    if (location.hostname === '127.0.0.1' && typeof XMLHttpRequest === 'function' && (!window.__ctvSyncHydrated || forceSyncXhr)) {
      window.__ctvSyncHydrated = true;
      try {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', '/__ctv_state', false);
        try { xhr.setRequestHeader('X-CTV-Local', '1'); } catch (e0) {}
        xhr.send(null);
        if (xhr.status === 200 && xhr.responseText) {
          var j = JSON.parse(xhr.responseText);
          if (j && j.state) {
            applyDiskStateToLocalStorage(j.state, false);
          }
        }
      } catch (e) {}
    }
    // 2. Respaldo asíncrono vía IPC contextBridge y sincronización de unión a disco
    if (window.DesktopBridge && typeof window.DesktopBridge.loadPersistentState === 'function') {
      return window.DesktopBridge.loadPersistentState()
        .then(function (diskState) {
          var didChange = applyDiskStateToLocalStorage(diskState, false);
          window.ctvPersistDesktopState();
          if (didChange) {
            if (typeof window.ctvInvalidateFavCache === 'function') window.ctvInvalidateFavCache();
            if (typeof window.ctvInvalidateWatchProgressCache === 'function') window.ctvInvalidateWatchProgressCache();
            if (typeof window.ctvUpdateFavButtonsUI === 'function') window.ctvUpdateFavButtonsUI();
          }
          return didChange;
        })
        .catch(function () { return false; });
    }
    return Promise.resolve(false);
  };

  if (isDesktopRuntime) {
    window.ctvHydratePersistentState();
    window.addEventListener('pagehide', function () {
      window.ctvPersistDesktopState(null, true);
    });
    window.addEventListener('beforeunload', function () {
      window.ctvPersistDesktopState(null, true);
    });
  }

  // Preservar AndroidBridge nativo en Android / Android TV cuando MainActivity ya lo inyectó
  if (isNativeAndroid) {
    return;
  }

  function getFavSet() {
    try {
      var parsed = JSON.parse(localStorage.getItem(FAVS_KEY) || '[]');
      return new Set(Array.isArray(parsed) ? parsed : []);
    } catch (e) {
      return new Set();
    }
  }

  function getWatchedSet() {
    try {
      var parsed = JSON.parse(localStorage.getItem(WATCHED_KEY) || '[]');
      return new Set(Array.isArray(parsed) ? parsed : []);
    } catch (e) {
      return new Set();
    }
  }

  function watchedId(slug, t, e) {
    return String(slug || '') + ':' + String(t || 0) + ':' + String(e || 0);
  }

  window.AndroidBridge = {
    getAppVersionCode: function () {
      // Doble cinturón en Desktop: entero alto seguro (9999) compatible con la API de catálogo para que OK() jamás dispare un falso modal
      return 9999;
    },
    getAppVersionName: function () {
      return window.CTV_APP_VERSION;
    },
    canRequestInstalls: function () {
      return false;
    },
    getFavorites: function () {
      try {
        return localStorage.getItem(FAVS_KEY) || '[]';
      } catch (e) {
        return '[]';
      }
    },
    setFavorite: function (slug, isFav) {
      if (!slug) return;
      try {
        var favs = getFavSet();
        if (isFav) favs.add(slug);
        else favs.delete(slug);
        var arr = Array.from(favs);
        localStorage.setItem(FAVS_KEY, JSON.stringify(arr));
        window.ctvPersistDesktopState({ favTvSlugs: arr });
      } catch (e) {}
    },
    isWatched: function (slug, t, e) {
      return getWatchedSet().has(watchedId(slug, t, e));
    },
    setWatched: function (slug, t, e, watched) {
      try {
        var set = getWatchedSet();
        var id = watchedId(slug, t, e);
        if (watched) set.add(id);
        else set.delete(id);
        var arr = Array.from(set);
        localStorage.setItem(WATCHED_KEY, JSON.stringify(arr));
        window.ctvPersistDesktopState({ watched: arr });
      } catch (e) {}
    }
  };
})();
