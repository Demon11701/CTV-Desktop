/**
 * Desktop Bridge & HTML5/HLS Player Polyfill for CTV Desktop (Electron)
 * Replaces Android-specific ExoPlayer / APK updater calls with local storage
 * and HTML5 <video> (HLS.js / Shaka Player) + <iframe> playback fallbacks.
 */
(function () {
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

  // Provide AndroidBridge compatibility object without overriding web HTML5/HLS.js player fallbacks
  window.AndroidBridge = {
    getAppVersionCode: function () {
      // Return a high version code so the Android APK self-updater modal does not trigger on Desktop
      return 999999;
    },
    getAppVersionName: function () {
      return '1.5 Desktop';
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
