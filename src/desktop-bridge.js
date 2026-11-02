/**
 * Desktop & iOS Bridge + HTML5/HLS Player Polyfill for CTV
 * Preserves native window.AndroidBridge on Android/Smart TV while providing
 * compatibility and storage persistence on Desktop (Linux/Windows) and iOS.
 */
(function () {
  window.CTV_APP_VERSION = '1.5.0';

  // If running inside the native Android/Smart TV APK where MainActivity already injected AndroidBridge, keep it intact
  if (window.AndroidBridge && typeof window.AndroidBridge.playChannelFull === 'function') {
    return;
  }

  const FAVS_KEY = 'pj2_favs_slugs';
  const WATCHED_KEY = 'pj2_vistos';

  function getFavSet() {
    try {
      return new Set(JSON.parse(localStorage.getItem(FAVS_KEY) || '[]'));
    } catch {
      return new Set();
    }
  }

  function getWatchedSet() {
    try {
      return new Set(JSON.parse(localStorage.getItem(WATCHED_KEY) || '[]'));
    } catch {
      return new Set();
    }
  }

  function watchedId(slug, t, e) {
    return `${slug || ''}:${t || 0}:${e || 0}`;
  }

  window.AndroidBridge = {
    getAppVersionCode: function () {
      // Matches current server versionCode (5) so API requests send app_version=5
      return 5;
    },
    getAppVersionName: function () {
      return '1.5.0';
    },
    canRequestInstalls: function () {
      return false;
    },
    getFavorites: function () {
      try {
        return localStorage.getItem(FAVS_KEY) || '[]';
      } catch {
        return '[]';
      }
    },
    setFavorite: function (slug, isFav) {
      try {
        const favs = getFavSet();
        if (isFav) {
          favs.add(slug);
        } else {
          favs.delete(slug);
        }
        localStorage.setItem(FAVS_KEY, JSON.stringify([...favs]));
      } catch {}
    },
    isWatched: function (slug, t, e) {
      return getWatchedSet().has(watchedId(slug, t, e));
    },
    setWatched: function (slug, t, e, watched) {
      try {
        const set = getWatchedSet();
        const id = watchedId(slug, t, e);
        if (watched) {
          set.add(id);
        } else {
          set.delete(id);
        }
        localStorage.setItem(WATCHED_KEY, JSON.stringify([...set]));
      } catch {}
    }
  };
})();
