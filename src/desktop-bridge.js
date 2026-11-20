/**
 * Desktop & iOS Bridge + Fullscreen/Storage Helpers for CTV
 * Preserves native window.AndroidBridge on Android/Smart TV while providing
 * compatibility, storage persistence, and IPC-safe fullscreen helpers on Desktop & iOS.
 */
(function () {
  if (window.__ctvDesktopBridgeInit) return;
  window.__ctvDesktopBridgeInit = true;
  window.CTV_APP_VERSION = '1.6.0';

  window.__ctvIsFullscreen = false;
  document.addEventListener('fullscreenchange', function () {
    window.__ctvIsFullscreen = Boolean(document.fullscreenElement || document.webkitFullscreenElement);
  });

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
      if (window.DesktopBridge && typeof window.DesktopBridge.setFullscreen === 'function') {
        return window.DesktopBridge.setFullscreen(false).catch(function () { return false; });
      }
      var doc = document;
      var fsEl = doc.fullscreenElement || doc.webkitFullscreenElement;
      if (fsEl) {
        if (doc.exitFullscreen) return doc.exitFullscreen().catch(function () {});
        if (doc.webkitExitFullscreen) return Promise.resolve(doc.webkitExitFullscreen());
      }
    } catch (e) {}
    return Promise.resolve(false);
  };

  // Preservar AndroidBridge nativo en Android / Android TV cuando MainActivity ya lo inyectó
  if (window.AndroidBridge && typeof window.AndroidBridge.playChannelFull === 'function') {
    return;
  }

  var FAVS_KEY = 'pj2_favs_slugs';
  var WATCHED_KEY = 'pj2_vistos';

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
      // Matches current server versionCode (5) so API requests send app_version=5
      return 5;
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
        localStorage.setItem(FAVS_KEY, JSON.stringify(Array.from(favs)));
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
        localStorage.setItem(WATCHED_KEY, JSON.stringify(Array.from(set)));
      } catch (e) {}
    }
  };
})();
