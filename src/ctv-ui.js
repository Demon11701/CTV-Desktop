/* CTV UI v1.6.1:
 * 1. Barra superior unificada y portada (hero) estilo Apple TV.
 * 2. Navegación con control remoto / teclado para menú horizontal.
 * 3. Sección dedicada de Anime (Series Anime, Películas Anime y Doramas Coreanos).
 * 4. Enriquecedor de servidores (espejos CDN directos para SERIESPLAYER + servidores multi-embed para Coreanas y Anime).
 * 5. Extractor directo de streams (.m3u8/.mp4 + subtítulos .vtt) sin anuncios y escudo anti-popups multiplataforma (.exe, .AppImage, .ipa, .apk).
 * 6. Comprobador multiplataforma de actualizaciones desde GitHub Releases.
 */
(function () {
  try {
    var sb = document.getElementById('sidebar');
    var se = document.querySelector('.search');
    var bell = document.getElementById('update-bell');
    if (sb && se) {
      sb.appendChild(se);
      if (bell) sb.appendChild(bell);
      document.body.classList.add('ctv-moved');
    }
  } catch (e) {}

  // Helper seguro para ocultar y remover el splash Zero-Blank-Screen cuando la app está lista
  function ctvDismissSplash() {
    try {
      var sp = document.getElementById('ctv-splash');
      if (!sp || sp.__ctvDismissed) return;
      sp.__ctvDismissed = true;
      (window.requestAnimationFrame || setTimeout)(function () {
        sp.classList.add('ctv-splash-hide');
        setTimeout(function () {
          try { if (sp && sp.parentNode) sp.remove(); } catch (e) {}
          try {
            var bs = document.getElementById('ctv-boot-style');
            if (bs && bs.parentNode) bs.remove();
          } catch (e) {}
        }, 320);
      });
    } catch (e) {}
  }
  window.ctvDismissSplash = ctvDismissSplash;
  setTimeout(ctvDismissSplash, 1600);

  // Estilos base GPU-composited para loaders, avisos no intrusivos y prefers-reduced-motion
  try {
    if (!document.getElementById('ctv-ui-perf-style')) {
      var perfStyle = document.createElement('style');
      perfStyle.id = 'ctv-ui-perf-style';
      perfStyle.textContent = [
        '#player-video,#player-frame{object-fit:contain!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}',
        '#ctv-player-loader{position:absolute;inset:0;z-index:14;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:rgba(5,6,10,.88);color:#fff;pointer-events:none;transition:opacity .2s ease;will-change:opacity}',
        '#ctv-player-loader .ctv-spin{width:42px;height:42px;border-radius:50%;border:3px solid rgba(255,255,255,.15);border-top-color:#b04cf2;animation:ctvSpin .8s linear infinite;will-change:transform}',
        '@keyframes ctvSpin{to{transform:rotate(360deg)}}',
        '#ctv-update-banner{position:fixed;right:max(16px,env(safe-area-inset-right,0px));bottom:max(20px,calc(env(safe-area-inset-bottom,0px) + 16px));z-index:100020;display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:14px;background:rgba(20,21,32,.96);border:1px solid rgba(176,76,242,.55);box-shadow:0 12px 34px rgba(0,0,0,.78);color:#fff;font-size:.88rem;max-width:min(420px,calc(100vw - 28px));transition:transform .22s ease,opacity .22s ease;will-change:transform,opacity}',
        '.card,.pill,.btn,.agenda-card,.episode-btn{transition:transform .16s ease,opacity .16s ease}',
        '@media (max-width:860px){#ctv-update-banner{bottom:calc(78px + env(safe-area-inset-bottom,0px));left:14px;right:14px;max-width:none}}',
        '@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important;scroll-behavior:auto!important}}'
      ].join('\n');
      document.head.appendChild(perfStyle);
    }
  } catch (e) {}

  // Escudo anti-caídas y bypass seguro de límite diario (100 vistas) de PelisJuanita (sin romper CORS en WebViews)
  try {
    function ctvIsDesktopProxyAvailable() {
      var isNativeAndroid = Boolean(window.AndroidBridge && typeof window.AndroidBridge.playChannelFull === 'function');
      var isCapNative = Boolean(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform()) || isNativeAndroid;
      if (isCapNative) return false;
      return location.hostname === '127.0.0.1' || Boolean(window.DesktopBridge) || /Electron/i.test(navigator.userAgent || '');
    }
    window.ctvIsDesktopProxyAvailable = ctvIsDesktopProxyAvailable;

    function ctvGetRandomIp() {
      var b1 = Math.floor(Math.random() * 40) + 180;
      var b2 = Math.floor(Math.random() * 200) + 20;
      var b3 = Math.floor(Math.random() * 240) + 10;
      var b4 = Math.floor(Math.random() * 240) + 10;
      return b1 + '.' + b2 + '.' + b3 + '.' + b4;
    }

    // 1. Restaurar XMLHttpRequest nativo en Android/iOS (CapacitorHttp reescribe las URLs de XHR a
    // https://localhost/_capacitor_http_interceptor_?u=..., lo que rompe la resolución de rutas relativas
    // de segmentos .m3u8/.ts en hls.js y provoca pantalla negra al reproducir videos en <video id="player-video">)
    try {
      if (typeof window.CapacitorWebXMLHttpRequest === 'function') {
        window.XMLHttpRequest = window.CapacitorWebXMLHttpRequest;
      }
    } catch (e) {}

    // 2. Obtener fetch compatible con CORS en todas las plataformas
    if (!window.__ctvTrueNativeFetch) {
      if (typeof window.CapacitorWebFetch === 'function' && window.Capacitor && typeof window.Capacitor.getServerUrl === 'function') {
        var capSrv = window.Capacitor.getServerUrl();
        var rawWebFetch = window.CapacitorWebFetch.bind(window);
        window.__ctvTrueNativeFetch = function (resource, init) {
          var u = typeof resource === 'string' ? resource : (resource && resource.url) || '';
          var m = (init && init.method) ? String(init.method).toUpperCase() : 'GET';
          if (u.indexOf('http') === 0 && u.indexOf(capSrv) !== 0 && m === 'GET') {
            return rawWebFetch(capSrv + '/_capacitor_http_interceptor_?u=' + encodeURIComponent(u), init);
          }
          return rawWebFetch(resource, init);
        };
      } else {
        window.__ctvTrueNativeFetch = window.fetch.bind(window);
      }
    }
    var _nativeFetch = window.__ctvTrueNativeFetch;
    window.__ctvCatalog = window.__ctvCatalog || {};
    window.__ctvDetailCache = window.__ctvDetailCache || {};
    window.__ctvCurrentItem = window.__ctvCurrentItem || null;

    function ctvNormText(str) {
      return String(str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    }

    function ctvNormPosterUrl(p) {
      if (!p) return '';
      var s = String(p).trim();
      if (!s) return '';
      if (s.indexOf('http://') === 0 || s.indexOf('https://') === 0) return s;
      return 'https://image.tmdb.org/t/p/w500' + (s.charAt(0) === '/' ? s : '/' + s);
    }

    function ctvShowToast(msg) {
      try {
        if (window.__ctvToastHideTimer) { clearTimeout(window.__ctvToastHideTimer); window.__ctvToastHideTimer = null; }
        if (window.__ctvToastRmTimer) { clearTimeout(window.__ctvToastRmTimer); window.__ctvToastRmTimer = null; }
        var t = document.getElementById('ctv-fav-toast');
        if (!t) {
          t = document.createElement('div');
          t.id = 'ctv-fav-toast';
          t.style.cssText = 'position:fixed;left:50%;bottom:max(88px,calc(env(safe-area-inset-bottom,0px) + 74px));transform:translate3d(-50%,0,0);background:rgba(18,19,28,.96);color:#fff;border:1px solid rgba(176,76,242,.55);box-shadow:0 10px 30px rgba(0,0,0,.75);padding:10px 20px;border-radius:999px;font-weight:700;font-size:.9rem;z-index:100025;pointer-events:none;white-space:nowrap;max-width:calc(100vw - 28px);overflow:hidden;text-overflow:ellipsis;transition:opacity .22s ease,transform .22s ease;will-change:opacity,transform';
          document.body.appendChild(t);
        }
        t.textContent = msg;
        t.style.opacity = '1';
        window.__ctvToastHideTimer = setTimeout(function () {
          if (t && t.parentNode) {
            t.style.opacity = '0';
            window.__ctvToastRmTimer = setTimeout(function () { if (t && t.parentNode) t.remove(); }, 240);
          }
        }, 2200);
      } catch (e) {}
    }
    window.ctvShowToast = ctvShowToast;

    // Persistencia local ligera de preferencias del usuario (servidor preferido / idioma / calidad / modo de imagen / subtítulos)
    var CTV_PREFS_KEY = 'ctv_user_prefs_v1';
    function ctvGetUserPrefs() {
      try {
        var raw = JSON.parse(localStorage.getItem(CTV_PREFS_KEY) || '{}');
        var rawMode = typeof raw.imageMode === 'string' ? raw.imageMode : 'original';
        if (rawMode !== 'original' && rawMode !== 'sharp' && rawMode !== 'cinema') rawMode = 'original';
        return {
          preferredServer: typeof raw.preferredServer === 'string' ? raw.preferredServer : '',
          preferredLang: typeof raw.preferredLang === 'string' ? raw.preferredLang : 'LATINO',
          preferredQuality: typeof raw.preferredQuality === 'string' ? raw.preferredQuality : 'auto',
          imageMode: rawMode,
          subtitlesEnabled: raw.subtitlesEnabled !== false
        };
      } catch (e) {
        return { preferredServer: '', preferredLang: 'LATINO', preferredQuality: 'auto', imageMode: 'original', subtitlesEnabled: true };
      }
    }
    function ctvSaveUserPrefs(patch) {
      try {
        var next = Object.assign(ctvGetUserPrefs(), patch || {});
        localStorage.setItem(CTV_PREFS_KEY, JSON.stringify(next));
        if (typeof window.ctvPersistDesktopState === 'function') {
          window.ctvPersistDesktopState({ userPrefs: next });
        }
        return next;
      } catch (e) {
        return null;
      }
    }
    window.ctvGetUserPrefs = ctvGetUserPrefs;
    window.ctvSaveUserPrefs = ctvSaveUserPrefs;

    // Caché en memoria de sets de favoritos para evitar JSON.parse repetitivo en scroll/DOM updates
    var _favSetsCache = null;
    function ctvInvalidateFavCache() { _favSetsCache = null; }
    window.ctvInvalidateFavCache = ctvInvalidateFavCache;
    function ctvGetFavSets() {
      if (_favSetsCache) return _favSetsCache;
      _favSetsCache = {
        movies: new Set(ctvReadFavList('pj2_favs_movies').map(function (x) { return x && x.slug; }).filter(Boolean)),
        series: new Set(ctvReadFavList('pj2_favs_series').map(function (x) { return x && x.slug; }).filter(Boolean)),
        tv: new Set(ctvReadFavList('pj2_favs_slugs'))
      };
      return _favSetsCache;
    }

    function ctvReadFavList(storageKey) {
      try {
        var raw = JSON.parse(localStorage.getItem(storageKey) || '[]');
        return Array.isArray(raw) ? raw : [];
      } catch (e) {
        return [];
      }
    }

    function ctvIsItemFavorite(item) {
      if (!item || !item.slug) return false;
      var kind = String(item.kind || item.tipo || 'movie').toLowerCase();
      var sets = ctvGetFavSets();
      if (kind === 'tv' || kind === 'live') return sets.tv.has(item.slug);
      if (kind === 'serie' || kind === 'series') return sets.series.has(item.slug);
      return sets.movies.has(item.slug);
    }
    window.ctvIsItemFavorite = ctvIsItemFavorite;

    function ctvUpdateFavButtonsUI() {
      try {
        var cur = window.__ctvCurrentItem;
        var isFav = cur ? ctvIsItemFavorite(cur) : false;
        var pFav = document.getElementById('player-fav');
        if (pFav) {
          var pText = isFav ? '★' : '☆';
          if (pFav.textContent !== pText) pFav.textContent = pText;
          var pColor = isFav ? 'rgb(255, 215, 0)' : '';
          if (isFav && pFav.style.color !== '#ffd700' && pFav.style.color !== pColor) pFav.style.color = '#ffd700';
          else if (!isFav && pFav.style.color) pFav.style.color = '';
          if (pFav.classList.contains('is-fav') !== isFav) pFav.classList.toggle('is-fav', isFav);
        }
        var dFav = document.getElementById('detail-fav');
        if (dFav && cur && cur.kind !== 'tv') {
          var dText = isFav ? '★ Favorito' : '☆ Favorito';
          if (dFav.textContent !== dText) dFav.textContent = dText;
          if (dFav.classList.contains('is-fav') !== isFav) dFav.classList.toggle('is-fav', isFav);
        }
        var sets = ctvGetFavSets();
        document.querySelectorAll('.card[data-slug], .card.movie').forEach(function (card) {
          var slug = card.getAttribute('data-slug') || (card.__ctvItem && card.__ctvItem.slug) || '';
          if (!slug) return;
          var wrap = card.querySelector('.card-wrap');
          if (!wrap) return;
          var starred = sets.movies.has(slug) || sets.series.has(slug) || sets.tv.has(slug);
          var starEl = wrap.querySelector('.fav-star');
          if (starred && !starEl) {
            wrap.insertAdjacentHTML('afterbegin', '<span class="fav-star">★</span>');
          } else if (!starred && starEl) {
            starEl.remove();
          }
        });
      } catch (e) {}
    }
    window.ctvUpdateFavButtonsUI = ctvUpdateFavButtonsUI;

    function ctvResolveActiveItemFromDom() {
      if (window.__ctvCurrentItem && window.__ctvCurrentItem.slug) return window.__ctvCurrentItem;
      try {
        var st = window.history && window.history.state;
        var slug = (st && st.slug) || '';
        var isSerie = (st && st.view === 'serie-detail') || Boolean(document.getElementById('serie-seasons'));
        var titleEl = document.querySelector('#detail-body .detail-title') || document.getElementById('detail-toptitle');
        var posterEl = document.querySelector('#detail-body .detail-poster');
        var catEntry = (slug && window.__ctvCatalog && window.__ctvCatalog[slug]) || {};
        if (slug || titleEl) {
          var resolvedSlug = slug || catEntry.slug || ('ctv-custom-' + ctvNormText(titleEl ? titleEl.textContent : 'item').replace(/[^a-z0-9]+/g, '-'));
          window.__ctvCurrentItem = {
            kind: isSerie ? 'serie' : 'movie',
            slug: resolvedSlug,
            title: (titleEl && titleEl.textContent.trim()) || catEntry.titulo || catEntry.nombre || catEntry.title || 'Título',
            poster: (posterEl && posterEl.getAttribute('src')) || ctvNormPosterUrl(catEntry.img_frente || catEntry.imagen || catEntry.poster || ''),
            year: String(catEntry.año || catEntry.anio || catEntry.fecha_estreno || catEntry.year || '').slice(0, 4),
            rating: String(catEntry.votos || catEntry.rating || ''),
            genre: catEntry.genero || catEntry.genre || '',
            esAdult: String(catEntry.es_adulto || '') === '1'
          };
          return window.__ctvCurrentItem;
        }
      } catch (e) {}
      return null;
    }

    function ctvToggleFavoriteItem(item) {
      var target = item || ctvResolveActiveItemFromDom();
      if (!target || !target.slug) return false;
      var kind = String(target.kind || target.tipo || 'movie').toLowerCase();
      var added = false;

      if (kind === 'tv' || kind === 'live') {
        var tvList = ctvReadFavList('pj2_favs_slugs');
        var idx = tvList.indexOf(target.slug);
        if (idx >= 0) {
          tvList.splice(idx, 1);
          added = false;
        } else {
          tvList.push(target.slug);
          added = true;
        }
        try { localStorage.setItem('pj2_favs_slugs', JSON.stringify(tvList)); } catch (e) {}
        try {
          if (window.AndroidBridge && typeof window.AndroidBridge.setFavorite === 'function') {
            window.AndroidBridge.setFavorite(target.slug, added);
          }
        } catch (e) {}
      } else if (kind === 'serie' || kind === 'series') {
        var sList = ctvReadFavList('pj2_favs_series');
        var existsS = sList.some(function (x) { return x && x.slug === target.slug; });
        if (existsS) {
          sList = sList.filter(function (x) { return x && x.slug !== target.slug; });
          added = false;
        } else {
          var catS = (window.__ctvCatalog && window.__ctvCatalog[target.slug]) || {};
          sList.push({
            slug: target.slug,
            title: target.title || target.nombre || target.titulo || catS.nombre || catS.titulo || 'Serie',
            poster: ctvNormPosterUrl(target.poster || target.img_frente || target.imagen || catS.img_frente || catS.imagen || catS.poster || ''),
            year: String(target.year || target.año || target.anio || catS.año || catS.anio || '').slice(0, 4),
            rating: String(target.rating || target.votos || catS.votos || ''),
            tipo: 'serie'
          });
          added = true;
        }
        try { localStorage.setItem('pj2_favs_series', JSON.stringify(sList)); } catch (e) {}
      } else {
        var mList = ctvReadFavList('pj2_favs_movies');
        var existsM = mList.some(function (x) { return x && x.slug === target.slug; });
        if (existsM) {
          mList = mList.filter(function (x) { return x && x.slug !== target.slug; });
          added = false;
        } else {
          var catM = (window.__ctvCatalog && window.__ctvCatalog[target.slug]) || {};
          mList.push({
            slug: target.slug,
            title: target.title || target.titulo || target.nombre || catM.titulo || catM.nombre || 'Película',
            poster: ctvNormPosterUrl(target.poster || target.img_frente || target.imagen || catM.img_frente || catM.imagen || catM.poster || ''),
            year: String(target.year || target.año || target.anio || catM.año || catM.anio || '').slice(0, 4),
            rating: String(target.rating || target.votos || catM.votos || ''),
            tipo: 'pelicula',
            genre: target.genre || target.genero || catM.genero || '',
            esAdult: Boolean(target.esAdult || String(target.es_adulto || catM.es_adulto || '') === '1')
          });
          added = true;
        }
        try { localStorage.setItem('pj2_favs_movies', JSON.stringify(mList)); } catch (e) {}
      }

      ctvInvalidateFavCache();
      if (typeof window.ctvPersistDesktopState === 'function') {
        window.ctvPersistDesktopState();
      }
      ctvUpdateFavButtonsUI();
      ctvShowToast(added ? '★ Guardado en Favoritos' : '☆ Eliminado de Favoritos');

      var activeMenu = document.querySelector('.menu-item.active');
      var detailModal = document.getElementById('detail-modal');
      var playerModal = document.getElementById('player-modal');
      if (
        activeMenu &&
        activeMenu.getAttribute('data-section') === 'favorites' &&
        (!detailModal || detailModal.classList.contains('hidden')) &&
        (!playerModal || playerModal.classList.contains('hidden'))
      ) {
        activeMenu.click();
      }
      return added;
    }
    window.ctvToggleFavoriteItem = ctvToggleFavoriteItem;

    function pruneObjectCache(obj, maxEntries) {
      if (!obj) return;
      var keys = Object.keys(obj);
      if (keys.length <= maxEntries) return;
      var toDelete = keys.length - Math.floor(maxEntries * 0.8);
      for (var i = 0; i < toDelete; i++) delete obj[keys[i]];
    }

    function saveCatalogItem(it) {
      if (!it || !it.slug) return;
      var prev = window.__ctvCatalog[it.slug] || {};
      var merged = Object.assign({}, prev, it);
      if (!merged.TMDbId && merged.id && String(merged.id).length >= 3) {
        merged.TMDbId = merged.id;
      }
      window.__ctvCatalog[it.slug] = merged;
      pruneObjectCache(window.__ctvCatalog, 600);
    }

    function saveDetailCache(key, val) {
      if (!key || !val) return;
      window.__ctvDetailCache[key] = val;
      pruneObjectCache(window.__ctvDetailCache, 80);
    }

    function ctvSha256Hex(str) {
      var ascii = unescape(encodeURIComponent(String(str || '')));
      var rightRotate = function (value, amount) {
        return (value >>> amount) | (value << (32 - amount));
      };
      var maxWord = Math.pow(2, 32);
      var i, j;
      var result = '';
      var words = [];
      var asciiBitLength = ascii.length * 8;
      var hash = [
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
        0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
      ];
      var k = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
        0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
      ];
      ascii += '\x80';
      while (ascii.length % 64 - 56) ascii += '\x00';
      for (i = 0; i < ascii.length; i++) {
        j = ascii.charCodeAt(i);
        words[i >> 2] |= j << ((3 - i) % 4) * 8;
      }
      words[words.length] = ((asciiBitLength / maxWord) | 0);
      words[words.length] = (asciiBitLength | 0);
      for (j = 0; j < words.length;) {
        var w = words.slice(j, j += 16);
        var oldHash = hash.slice(0);
        for (i = 0; i < 64; i++) {
          var w15 = w[i - 15], w2 = w[i - 2];
          var a = hash[0], e = hash[4];
          var temp1 = hash[7]
            + (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25))
            + ((e & hash[5]) ^ ((~e) & hash[6]))
            + k[i]
            + (w[i] = (i < 16) ? w[i] : (
              w[i - 16]
              + (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3))
              + w[i - 7]
              + (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))
            ) | 0);
          var temp2 = (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22))
            + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
          hash = [(temp1 + temp2) | 0].concat(hash);
          hash[4] = (hash[4] + temp1) | 0;
          hash.length = 8;
        }
        for (i = 0; i < 8; i++) {
          hash[i] = (hash[i] + oldHash[i]) | 0;
        }
      }
      for (i = 0; i < 8; i++) {
        for (j = 3; j + 1; j--) {
          var b = (hash[i] >> (j * 8)) & 255;
          result += ((b < 16) ? 0 : '') + b.toString(16);
        }
      }
      return result;
    }

    var PJ_CERT_SHA256 = '9381e4d77c1d42a3d02472331249bed8e76a8df6af7082214ea8fcfc30aa653d';
    var PJ_PACKAGE_NAME = 'com.pelisjuanita.app';
    window.__ctvPjSec = window.__ctvPjSec || {
      rule: 'r1',
      seed: 'pj_sec_seed_2026_init',
      fetchedAt: 0
    };

    function ctvBuildPjToken(extra, customSeed, customRule) {
      var h = extra != null ? String(extra) : '';
      var sec = window.__ctvPjSec || { rule: 'r1', seed: 'pj_sec_seed_2026_init' };
      var seed = customSeed != null ? String(customSeed) : String(sec.seed || 'pj_sec_seed_2026_init');
      var rule = (customRule && String(customRule).length > 0) ? String(customRule) : String(sec.rule || 'r1');
      var minute = Math.floor(Date.now() / 1000 / 60);
      var raw = '';
      if (rule === 'r2') {
        raw = seed + ':' + minute + ':' + PJ_CERT_SHA256 + ':' + h + ':' + PJ_PACKAGE_NAME;
      } else if (rule === 'r3') {
        raw = PJ_PACKAGE_NAME + ':' + h + ':' + minute + ':' + seed + ':' + PJ_CERT_SHA256;
      } else if (rule === 'r4') {
        raw = PJ_CERT_SHA256 + '#' + seed + '#' + h + '#' + minute;
      } else {
        raw = PJ_CERT_SHA256 + ':' + PJ_PACKAGE_NAME + ':' + h + ':' + seed + ':' + minute;
      }
      return ctvSha256Hex(raw) + '.' + minute;
    }
    window.ctvBuildPjToken = ctvBuildPjToken;
    try {
      if (window.AndroidBridge && typeof window.AndroidBridge.getSecurityToken !== 'function') {
        window.AndroidBridge.getSecurityToken = ctvBuildPjToken;
      }
    } catch (e) {}

    function updatePjSecFromVersionJson(vJson) {
      if (vJson && typeof vJson === 'object') {
        if (vJson.sec_rule) window.__ctvPjSec.rule = String(vJson.sec_rule);
        if (vJson.sec_seed) window.__ctvPjSec.seed = String(vJson.sec_seed);
        window.__ctvPjSec.fetchedAt = Date.now();
      }
    }

    var _pjSecInFlight = null;
    function ensurePjSecConfig(forceRefresh) {
      try {
        if (!forceRefresh && window.__ctvPjSec && window.__ctvPjSec.fetchedAt) {
          return Promise.resolve(window.__ctvPjSec);
        }
        if (_pjSecInFlight) return _pjSecInFlight;
        _pjSecInFlight = (async function () {
          var vUrl = 'https://pelisjuanita.com/tv/app/version.php?app_version=7';
          try {
            var vResp = await _nativeFetch(vUrl, { cache: 'no-store' });
            if (vResp && vResp.ok) {
              var vJson = await vResp.json().catch(function () { return null; });
              updatePjSecFromVersionJson(vJson);
            } else if (typeof ctvFetchPjBypass === 'function') {
              var vByp = await ctvFetchPjBypass(vUrl);
              if (vByp) updatePjSecFromVersionJson(vByp);
            }
          } catch (e) {
            try {
              if (typeof ctvFetchPjBypass === 'function') {
                var vByp2 = await ctvFetchPjBypass(vUrl);
                if (vByp2) updatePjSecFromVersionJson(vByp2);
              }
            } catch (e2) {}
          } finally {
            _pjSecInFlight = null;
          }
          return window.__ctvPjSec;
        })();
        return _pjSecInFlight;
      } catch (e) {
        _pjSecInFlight = null;
        return Promise.resolve(window.__ctvPjSec);
      }
    }
    ensurePjSecConfig(false);

    function ctvSignPjUrl(rawUrl) {
      if (!rawUrl || typeof rawUrl !== 'string') return rawUrl;
      if (rawUrl.indexOf('pelisjuanita.com/tv/app/') < 0) return rawUrl;
      var hashIdx = rawUrl.indexOf('#');
      var base = hashIdx >= 0 ? rawUrl.slice(0, hashIdx) : rawUrl;
      var hash = hashIdx >= 0 ? rawUrl.slice(hashIdx) : '';
      var cleanUrl = base
        .replace(/([?&])pj_token=[^&]*(&)?/g, function (_m, sep, trail) {
          if (sep === '?' && trail) return '?';
          return trail ? sep : '';
        })
        .replace(/[?&]+$/, '');
      var signed = cleanUrl + (cleanUrl.indexOf('?') >= 0 ? '&' : '?') + 'pj_token=' + encodeURIComponent(ctvBuildPjToken(''));
      return signed + hash;
    }

    async function ctvFetchPjAuthed(rawUrl, init) {
      var signedUrl = ctvSignPjUrl(rawUrl);
      var resp = await _nativeFetch(signedUrl, init);
      if (resp && resp.status === 403 && rawUrl.indexOf('/app/version.php') < 0) {
        await ensurePjSecConfig(true);
        var reSignedUrl = ctvSignPjUrl(rawUrl);
        resp = await _nativeFetch(reSignedUrl, init);
      }
      return resp;
    }

    function cacheCatalogListJson(j) {
      if (!j) return;
      var items = Array.isArray(j.datos) ? j.datos : (Array.isArray(j) ? j : []);
      if (Array.isArray(j.sections)) {
        j.sections.forEach(function (sec) {
          if (Array.isArray(sec.data)) items = items.concat(sec.data);
        });
      }
      items.forEach(saveCatalogItem);
      setTimeout(ctvUpdateFavButtonsUI, 120);
    }

    async function ctvFetchPjBypass(targetUrl) {
      // 1. Desktop proxy (nunca confundir con localhost de Capacitor en Android/iOS)
      if (ctvIsDesktopProxyAvailable()) {
        for (var dAttempt = 0; dAttempt < 3; dAttempt++) {
          try {
            targetUrl = ctvSignPjUrl(targetUrl);
            var pUrl = '/__ctv_proxy?url=' + encodeURIComponent(targetUrl) + '&ref=' + encodeURIComponent('https://pelisjuanita.com/');
            var pr = await _nativeFetch(pUrl);
            if (pr.ok) {
              var pj = await pr.json();
              if (pj && pj.body) {
                var parsed = JSON.parse(pj.body);
                if (parsed && parsed.status !== 'error') return parsed;
              }
            }
          } catch (e) {}
        }
      }

      // 2. CapacitorHttp nativo (Android APK / iOS IPA — petición directa por socket sin preflight OPTIONS)
      if (window.Capacitor && typeof window.Capacitor.nativePromise === 'function') {
        for (var cAttempt = 0; cAttempt < 3; cAttempt++) {
          try {
            targetUrl = ctvSignPjUrl(targetUrl);
            var rndIp = ctvGetRandomIp();
            var capRes = await window.Capacitor.nativePromise('CapacitorHttp', 'request', {
              url: targetUrl,
              method: 'GET',
              headers: {
                'Accept': 'application/json',
                'Referer': 'https://pelisjuanita.com/',
                'X-Forwarded-For': rndIp,
                'X-Real-IP': rndIp,
                'Client-IP': rndIp
              }
            });
            if (capRes && capRes.data != null) {
              var obj = typeof capRes.data === 'string' ? JSON.parse(capRes.data) : capRes.data;
              if (obj && obj.status !== 'error') return obj;
            }
          } catch (e) {}
        }
      }

      // 3. Fetch sin cookies (credentials: 'omit' es seguro ante CORS y evita enviar PHPSESSID/user_identifier)
      try {
        targetUrl = ctvSignPjUrl(targetUrl);
        var rOmit = await _nativeFetch(targetUrl, {
          headers: { Accept: 'application/json' },
          credentials: 'omit',
          cache: 'no-store'
        });
        if (rOmit.ok) {
          var jOmit = await rOmit.json();
          if (jOmit && jOmit.status !== 'error') return jOmit;
        }
      } catch (e) {}

      return null;
    }

    function jsonResponse(obj) {
      return new Response(JSON.stringify(obj), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    function ctvSetCurrentFavContext(rawObj, fallbackSlug, kind) {
      if (!rawObj) return;
      var slug = rawObj.slug || fallbackSlug || '';
      if (!slug) return;
      rawObj.slug = slug;
      rawObj.img_frente = rawObj.img_frente || rawObj.imagen || rawObj.poster || '';
      rawObj.año = rawObj.año || rawObj.anio || rawObj.fecha_estreno || rawObj.year || '';
      if (kind === 'serie') {
        rawObj.nombre = rawObj.nombre || rawObj.titulo || rawObj.title || 'Serie';
      } else {
        rawObj.titulo = rawObj.titulo || rawObj.titulo2 || rawObj.nombre || rawObj.title || 'Película';
      }
      window.__ctvCurrentItem = {
        kind: kind === 'serie' ? 'serie' : 'movie',
        slug: slug,
        title: kind === 'serie' ? rawObj.nombre : rawObj.titulo,
        poster: ctvNormPosterUrl(rawObj.img_frente),
        year: String(rawObj.año).slice(0, 4),
        rating: String(rawObj.votos || rawObj.rating || ''),
        genre: rawObj.genero || rawObj.genre || '',
        esAdult: String(rawObj.es_adulto || '') === '1' || Boolean(rawObj.esAdult)
      };
      setTimeout(ctvUpdateFavButtonsUI, 60);
      setTimeout(ctvUpdateFavButtonsUI, 300);
    }

    if (typeof window.ctvHydratePersistentState === 'function') {
      window.ctvHydratePersistentState();
    }

    window.fetch = async function (resource, init) {
      var url = typeof resource === 'string' ? resource : (resource && resource.url) || '';
      if (url.indexOf('pelisjuanita.com') < 0) {
        return _nativeFetch.apply(this, arguments);
      }

      // 0A. Neutralizar comprobador heredado de APK (/app/version.php) para evitar falsos modales de actualización en Desktop/Mobile v1.6.0
      if (url.indexOf('/app/version.php') >= 0) {
        try {
          var vResp = await _nativeFetch.apply(this, arguments);
          if (vResp && vResp.ok) {
            var vJson = await vResp.clone().json().catch(function () { return null; });
            if (vJson && typeof vJson === 'object') {
              updatePjSecFromVersionJson(vJson);
              vJson.versionCode = 0;
              vJson.minVersionCode = 0;
              return jsonResponse(vJson);
            }
          }
        } catch (e) {}
        return jsonResponse({ status: 'ok', versionCode: 0, minVersionCode: 0 });
      }

      // 0B. Agenda Deportiva (api-agenda.php): respaldo automático si falla el fetch directo
      if (url.indexOf('api-agenda.php') >= 0) {
        try {
          var agResp = await ctvFetchPjAuthed(url, init);
          if (agResp.ok) {
            var agClone = agResp.clone();
            var agJson = await agClone.json().catch(function () { return null; });
            if (agJson && Array.isArray(agJson.data)) {
              return jsonResponse(agJson);
            }
          }
        } catch (e) {}
        var agByp = await ctvFetchPjBypass(url);
        if (agByp && Array.isArray(agByp.data)) {
          return jsonResponse(agByp);
        }
        return ctvFetchPjAuthed(url, init);
      }

      // 1. Listados de catálogo (home, movies, series, buscar): NUNCA inyectar cabeceras prohibidas por CORS
      var isCatalogList = url.indexOf('/app/movies.php') >= 0 || url.indexOf('/app/series.php') >= 0 || url.indexOf('/app/home.php') >= 0 || url.indexOf('/app/buscar.php') >= 0;
      if (isCatalogList && url.indexOf('slug=') < 0) {
        try {
          var resp = await ctvFetchPjAuthed(url, init);
          if (resp && !resp.ok) {
            var bypListHttp = await ctvFetchPjBypass(url);
            if (bypListHttp) {
              cacheCatalogListJson(bypListHttp);
              return jsonResponse(bypListHttp);
            }
          }
          var clone = resp.clone();
          clone.json().then(cacheCatalogListJson).catch(function () {});
          return resp;
        } catch (e) {
          var bypList = await ctvFetchPjBypass(url);
          if (bypList) {
            cacheCatalogListJson(bypList);
            return jsonResponse(bypList);
          }
          throw e;
        }
      }

      // 2. Detalle de película (movies.php?slug=...)
      if (url.indexOf('/app/movies.php?') >= 0 && url.indexOf('slug=') >= 0) {
        var slugMatch = url.match(/[?&]slug=([^&]+)/);
        var mSlug = slugMatch ? decodeURIComponent(slugMatch[1]) : '';

        var mCacheKey = 'm:' + mSlug;
        if (mSlug && window.__ctvDetailCache[mCacheKey]) {
          var cMov = window.__ctvDetailCache[mCacheKey].datos;
          ctvSetCurrentFavContext(cMov, mSlug, 'movie');
          return jsonResponse(window.__ctvDetailCache[mCacheKey]);
        }

        try {
          var mResp = await ctvFetchPjAuthed(url, init);
          if (mResp.status === 200) {
            var mClone = mResp.clone();
            var mJson = await mClone.json().catch(function () { return null; });
            if (mJson && mJson.status !== 'error' && mJson.datos) {
              ctvSetCurrentFavContext(mJson.datos, mSlug, 'movie');
              saveCatalogItem(mJson.datos);
              if (mSlug && mJson.datos.servidores) saveDetailCache(mCacheKey, mJson);
              return jsonResponse(mJson);
            }
          }
        } catch (e) {}

        var mByp = await ctvFetchPjBypass(url);
        if (mByp && mByp.status !== 'error' && mByp.datos) {
          ctvSetCurrentFavContext(mByp.datos, mSlug, 'movie');
          saveCatalogItem(mByp.datos);
          if (mSlug && mByp.datos.servidores) saveDetailCache(mCacheKey, mByp);
          return jsonResponse(mByp);
        }

        var cachedMovie = window.__ctvCatalog[mSlug];
        if (cachedMovie) {
          ctvSetCurrentFavContext(cachedMovie, mSlug, 'movie');
          return jsonResponse({ status: 'ok', datos: cachedMovie });
        }
      }

      // 3. Detalle de serie (series.php?slug=... sin &t=)
      if (url.indexOf('/app/series.php?') >= 0 && url.indexOf('slug=') >= 0 && url.indexOf('&t=') < 0) {
        var sSlugMatch = url.match(/[?&]slug=([^&]+)/);
        var sSlug = sSlugMatch ? decodeURIComponent(sSlugMatch[1]) : '';

        var sCacheKey = 's:' + sSlug;
        if (sSlug && window.__ctvDetailCache[sCacheKey]) {
          var cSerObj = window.__ctvDetailCache[sCacheKey].datos || window.__ctvDetailCache[sCacheKey].serie || window.__ctvDetailCache[sCacheKey].episodio;
          ctvSetCurrentFavContext(cSerObj, sSlug, 'serie');
          return jsonResponse(window.__ctvDetailCache[sCacheKey]);
        }

        try {
          var sResp = await ctvFetchPjAuthed(url, init);
          if (sResp.status === 200) {
            var sClone = sResp.clone();
            var sJson = await sClone.json().catch(function () { return null; });
            if (sJson && sJson.status !== 'error' && (sJson.datos || sJson.serie || sJson.episodio)) {
              var sObj = sJson.datos || sJson.serie || sJson.episodio;
              ctvSetCurrentFavContext(sObj, sSlug, 'serie');
              saveCatalogItem(sObj);
              if (sSlug) saveDetailCache(sCacheKey, sJson);
              return jsonResponse(sJson);
            }
          }
        } catch (e) {}

        var sByp = await ctvFetchPjBypass(url);
        if (sByp && sByp.status !== 'error' && (sByp.datos || sByp.serie || sByp.episodio)) {
          var sObj2 = sByp.datos || sByp.serie || sByp.episodio;
          ctvSetCurrentFavContext(sObj2, sSlug, 'serie');
          saveCatalogItem(sObj2);
          if (sSlug) saveDetailCache(sCacheKey, sByp);
          return jsonResponse(sByp);
        }

        var cachedSerie = window.__ctvCatalog[sSlug];
        if (cachedSerie) {
          var synthSerie = Object.assign({}, cachedSerie, {
            temporadas: cachedSerie.temporadas || cachedSerie.temp || 1,
            entransmision: cachedSerie.entransmision || 0
          });
          ctvSetCurrentFavContext(synthSerie, sSlug, 'serie');
          return jsonResponse({ status: 'ok', datos: synthSerie });
        }
      }

      // 4. Lista de episodios de temporada (series.php?slug=...&t=1 sin &e=)
      if (url.indexOf('/app/series.php?') >= 0 && url.indexOf('&t=') >= 0 && url.indexOf('&e=') < 0) {
        try {
          var tResp = await ctvFetchPjAuthed(url, init);
          if (tResp.status === 200) {
            var tClone = tResp.clone();
            var tJson = await tClone.json().catch(function () { return null; });
            if (tJson && tJson.status !== 'error') return tResp;
          }
        } catch (e) {}

        var tByp = await ctvFetchPjBypass(url);
        if (tByp && tByp.status !== 'error') {
          return jsonResponse(tByp);
        }
      }

      // 5. Servidores de episodio (series.php?slug=...&t=1&e=1)
      if (url.indexOf('/app/series.php?') >= 0 && url.indexOf('&t=') >= 0 && url.indexOf('&e=') >= 0) {
        var epCacheKey = 'ep:' + url.split('?')[1];
        if (window.__ctvDetailCache[epCacheKey]) {
          return jsonResponse(window.__ctvDetailCache[epCacheKey]);
        }

        try {
          var epResp = await ctvFetchPjAuthed(url, init);
          if (epResp.status === 200) {
            var epClone = epResp.clone();
            var epJson = await epClone.json().catch(function () { return null; });
            if (epJson && epJson.status !== 'error' && epJson.servidores) {
              saveDetailCache(epCacheKey, epJson);
              return epResp;
            }
          }
        } catch (e) {}

        var epByp = await ctvFetchPjBypass(url);
        if (epByp && epByp.status !== 'error' && epByp.servidores) {
          saveDetailCache(epCacheKey, epByp);
          return jsonResponse(epByp);
        }

        return jsonResponse({ status: 'ok', servidores: [] });
      }

      return ctvFetchPjAuthed(url, init);
    };
  } catch (e) {}

  var content = document.getElementById('content');
  if (!content) return;
  var picks = [], idx = 0, deb = null, fadeTimer = null, building = false;

  function isHome() {
    var a = document.querySelector('.menu-item.active');
    var si = document.getElementById('search-input');
    return !!a && a.getAttribute('data-section') === 'home' && (!si || !si.value.trim());
  }

  function isModalCoveringHome() {
    var pm = document.getElementById('player-modal');
    var dm = document.getElementById('detail-modal');
    return Boolean(
      (pm && !pm.classList.contains('hidden')) ||
      (dm && !dm.classList.contains('hidden'))
    );
  }

  function txt(el) { return el ? (el.textContent || '').trim() : ''; }

  function stopHeroRotation() {
    if (window.__ctvHeroInterval) {
      clearInterval(window.__ctvHeroInterval);
      window.__ctvHeroInterval = null;
    }
    if (fadeTimer) {
      clearTimeout(fadeTimer);
      fadeTimer = null;
    }
  }

  function show(hero, i) {
    if (!hero || !hero.isConnected) return;
    var c = picks[i];
    if (!c) return;
    var img = c.querySelector('.card-poster');
    var src = img ? (img.currentSrc || img.src) : '';
    var kick = c.querySelector('.badge-top') ? '\u2605 Top' : (c.querySelector('.badge-serie') ? 'Serie' : 'Estreno');
    var y = txt(c.querySelector('.movie-year')), r = txt(c.querySelector('.movie-rating'));
    var meta = [y, r].filter(Boolean).join('  \u00b7  ');
    if (fadeTimer) clearTimeout(fadeTimer);
    hero.classList.add('fade');
    fadeTimer = setTimeout(function () {
      fadeTimer = null;
      if (!hero || !hero.isConnected) return;
      var bgEl = hero.querySelector('.ctv-hero-bg');
      var poEl = hero.querySelector('.ctv-hero-poster');
      var kkEl = hero.querySelector('.ctv-hero-kicker');
      var tiEl = hero.querySelector('.ctv-hero-title');
      var meEl = hero.querySelector('.ctv-hero-meta');
      if (bgEl && bgEl.src !== src) bgEl.src = src;
      if (poEl && poEl.src !== src) poEl.src = src;
      if (kkEl) kkEl.textContent = kick;
      if (tiEl) tiEl.textContent = txt(c.querySelector('.card-title')) || 'CTV';
      if (meEl) meEl.textContent = meta;
      var dots = hero.querySelectorAll('.ctv-hero-dots i');
      for (var k = 0; k < dots.length; k++) dots[k].className = k === i ? 'on' : '';
      hero.classList.remove('fade');
    }, 220);
    idx = i;
  }

  function build() {
    if (building) return;
    building = true;
    try {
      if (content.children && content.children.length > 0 && typeof window.ctvDismissSplash === 'function') {
        window.ctvDismissSplash();
      }
      var old = content.querySelector('.ctv-hero');
      if (!isHome()) {
        stopHeroRotation();
        if (old) old.remove();
        return;
      }
      if (old) return;
      var cards = content.querySelectorAll('.fav-row .carousel .card.movie');
      picks = [];
      for (var i = 0; i < cards.length && picks.length < 6; i++) {
        var im = cards[i].querySelector('.card-poster');
        if (im && im.src) picks.push(cards[i]);
      }
      if (!picks.length) return;
      var hero = document.createElement('div');
      hero.className = 'ctv-hero';
      hero.innerHTML =
        '<img class="ctv-hero-bg" decoding="async" referrerpolicy="no-referrer" alt="">' +
        '<div class="ctv-hero-info">' +
        '<span class="ctv-hero-kicker"></span>' +
        '<div class="ctv-hero-title"></div>' +
        '<div class="ctv-hero-meta"></div>' +
        '<button class="ctv-hero-btn focusable" tabindex="0">\u25b6 Ver ahora</button>' +
        '</div>' +
        '<img class="ctv-hero-poster" decoding="async" referrerpolicy="no-referrer" alt="">' +
        '<div class="ctv-hero-dots">' + picks.map(function () { return '<i></i>'; }).join('') + '</div>';
      hero.querySelector('.ctv-hero-btn').addEventListener('click', function () {
        var c = picks[idx];
        if (c && c.isConnected) c.click();
      });
      content.insertBefore(hero, content.firstChild);
      show(hero, 0);
      stopHeroRotation();
      window.__ctvHeroInterval = setInterval(function () {
        if (document.hidden || isModalCoveringHome()) return;
        var h = content.querySelector('.ctv-hero');
        if (!h || !h.isConnected || !isHome()) { stopHeroRotation(); return; }
        show(h, (idx + 1) % picks.length);
      }, 7000);
    } catch (e) {
    } finally {
      building = false;
    }
  }

  try {
    if (window.__ctvHeroObserver) {
      try { window.__ctvHeroObserver.disconnect(); } catch (e) {}
    }
    window.__ctvHeroObserver = new MutationObserver(function () {
      clearTimeout(deb);
      deb = setTimeout(function () {
        (window.requestAnimationFrame || setTimeout)(build);
      }, 180);
    });
    window.__ctvHeroObserver.observe(content, { childList: true });
    setTimeout(build, 500);
  } catch (e) {}
})();

/* CTV: navegación con control remoto para el menú horizontal */
(function () {
  try {
    var menu = document.querySelector('.menu');
    var content = document.getElementById('content');
    var bar = document.getElementById('filter-bar');
    if (!menu || !content) return;

    function items() { return Array.prototype.slice.call(document.querySelectorAll('.menu-item')); }
    function topBar() { try { return getComputedStyle(menu).position !== 'fixed'; } catch (e) { return true; } }
    function focusEl(el) { if (el && el.focus) { el.focus({ preventScroll: true }); return true; } return false; }
    function activeItem() { return menu.querySelector('.menu-item.active') || items()[0]; }
    function toContent() {
      var t = null;
      if (bar && !bar.classList.contains('hidden')) t = bar.querySelector('.pill.active') || bar.querySelector('.pill');
      if (!t) t = content.querySelector('.ctv-hero-btn') || content.querySelector('.card, .agenda-card');
      if (t && focusEl(t)) { try { t.scrollIntoView({ block: 'nearest' }); } catch (e) {} return true; }
      return false;
    }

    menu.addEventListener('keydown', function (e) {
      var k = e.key;
      if (k !== 'ArrowLeft' && k !== 'ArrowRight' && k !== 'ArrowDown' && k !== 'ArrowUp') return;
      var list = items(), i = list.indexOf(document.activeElement);
      if (i < 0) return;
      e.stopPropagation();
      e.preventDefault();
      var top = topBar();
      if (k === 'ArrowRight') {
        if (i < list.length - 1) focusEl(list[i + 1]);
        else if (top) focusEl(document.getElementById('search-input'));
      } else if (k === 'ArrowLeft') {
        if (i > 0) focusEl(list[i - 1]);
      } else if (k === 'ArrowDown' && top) {
        toContent();
      } else if (k === 'ArrowUp' && !top) {
        toContent();
      }
    }, true);

    var sb = document.getElementById('sidebar');
    if (sb) sb.addEventListener('keydown', function (e) {
      var t = e.target;
      if (!t || !t.closest || t.closest('.menu')) return;
      if (e.key === 'ArrowDown') { if (toContent()) e.preventDefault(); }
      else if (e.key === 'ArrowLeft' && t.id === 'search-input' && t.selectionStart === 0 && t.selectionEnd === 0) {
        var l = items(); if (focusEl(activeItem() || l[l.length - 1])) e.preventDefault();
      }
    });

    document.addEventListener('keydown', function (e) {
      var t = e.target, k = e.key;
      if (!t || !t.closest) return;
      if (t.classList && t.classList.contains('ctv-hero-btn')) {
        if (k === 'ArrowDown') {
          var c = content.querySelector('.carousel .card, .grid .card');
          if (c) { e.preventDefault(); e.stopImmediatePropagation(); focusEl(c); try { c.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (x) {} }
        } else if (k === 'ArrowUp') {
          e.preventDefault(); e.stopImmediatePropagation(); focusEl(activeItem()); content.scrollTop = 0;
        }
        return;
      }
      if (k !== 'ArrowUp') return;
      var up = null;
      var card = t.closest('.carousel .card');
      if (card) {
        var car = card.closest('.carousel');
        var cars = Array.prototype.filter.call(content.querySelectorAll('.carousel'), function (c) { return c.querySelector('.card'); });
        if (cars.indexOf(car) === 0) up = content.querySelector('.ctv-hero-btn') || activeItem();
      } else if (bar && bar.classList.contains('hidden')) {
        var first = content.querySelector('.grid .card, .agenda-card');
        if (first && t.closest('.grid .card, .agenda-card') && Math.abs(t.offsetTop - first.offsetTop) < 20) up = activeItem();
      }
      if (up) { e.preventDefault(); e.stopImmediatePropagation(); focusEl(up); content.scrollTop = 0; }
    }, true);
  } catch (e) {}
})();

/* ============================================================================
 * CTV: SECCIÓN DEDICADA DE ANIME + ACCESO RÁPIDO A SERIES COREANAS (DORAMAS)
 * ============================================================================ */
(function () {
  var animeTab = 'series'; // 'series' | 'movies' | 'dorama'
  var animePage = 0;
  var animeLoading = false;
  var animeEnded = false;
  var animeItems = [];

  var ANIME_TABS = [
    { id: 'series', label: '🎌 Series Anime' },
    { id: 'movies', label: '🎬 Películas Anime' },
    { id: 'dorama', label: '🇰🇷 Series Coreanas (Doramas)' }
  ];

  function getHelpers() {
    return window.__ctvHelpers || {};
  }

  function renderAnimeFilterBar() {
    var titleEl = document.getElementById('section-title');
    var bar = document.getElementById('filter-bar');
    if (titleEl) {
      if (animeTab === 'series') titleEl.textContent = 'Anime · Series';
      else if (animeTab === 'movies') titleEl.textContent = 'Anime · Películas';
      else titleEl.textContent = 'Series Coreanas · Doramas';
    }
    if (!bar) return;
    bar.innerHTML = '';
    bar.classList.remove('hidden');

    ANIME_TABS.forEach(function (tab) {
      var btn = document.createElement('button');
      btn.className = 'pill focusable' + (animeTab === tab.id ? ' active' : '');
      btn.tabIndex = 0;
      btn.textContent = tab.label;
      btn.onclick = function () {
        if (animeTab === tab.id && animeItems.length) return;
        animeTab = tab.id;
        resetAndLoadAnime();
      };
      bar.appendChild(btn);
    });
  }

  function resetAndLoadAnime() {
    animePage = 0;
    animeLoading = false;
    animeEnded = false;
    animeItems = [];
    renderAnimeFilterBar();
    var content = document.getElementById('content');
    if (content) {
      content.innerHTML = '<div class="grid" id="movie-grid"></div>';
      content.scrollTop = 0;
    }
    loadAnimePage(false);
  }

  function appendAnimeCards(items, replaceAll) {
    var grid = document.getElementById('movie-grid');
    if (!grid) return;
    var helpers = getHelpers();
    if (replaceAll) grid.innerHTML = '';
    var emptyEl = grid.querySelector('.empty');
    if (emptyEl) emptyEl.remove();

    if (!items.length && !animeItems.length && !animeLoading) {
      grid.innerHTML =
        '<div class="empty"><div style="font-size:3rem">🎌</div><h3>Sin resultados</h3><p>Prueba con otra pestaña o búsqueda.</p></div>';
      return;
    }

    var frag = document.createDocumentFragment();
    items.forEach(function (item) {
      var card = null;
      if (item.tipo === 'serie' && typeof helpers.r_ === 'function') {
        card = helpers.r_(item);
      } else if (typeof helpers.HE === 'function') {
        card = helpers.HE(item);
      }
      if (card) frag.appendChild(card);
    });
    grid.appendChild(frag);
  }

  async function loadAnimePage(isNextPage) {
    var activeMenu = document.querySelector('.menu-item.active');
    if (!activeMenu || activeMenu.getAttribute('data-section') !== 'anime') return;
    if (animeLoading || (isNextPage && animeEnded)) return;

    var helpers = getHelpers();
    if (!helpers.Yr) return;

    animeLoading = true;
    var loadingEl = document.getElementById('loading');
    if (loadingEl) loadingEl.classList.remove('hidden');

    try {
      var nextPage = isNextPage ? animePage + 1 : 1;
      var baseUrl = '';
      if (animeTab === 'movies') {
        baseUrl = (helpers.eE || 'https://pelisjuanita.com/tv/app/movies.php') + '?genero=anime&pagina=' + nextPage;
      } else if (animeTab === 'dorama') {
        baseUrl = (helpers.Rh || 'https://pelisjuanita.com/tv/app/series.php') + '?genero=dorama&pagina=' + nextPage;
      } else {
        baseUrl = (helpers.Rh || 'https://pelisjuanita.com/tv/app/series.php') + '?genero=anime&pagina=' + nextPage;
      }

      var resp = await fetch(helpers.Yr(baseUrl), { headers: { Accept: 'application/json' } });
      var json = await resp.json();
      var rawList = Array.isArray(json.datos) ? json.datos : (Array.isArray(json) ? json : []);

      if (!rawList.length) {
        animeEnded = true;
        if (!animeItems.length) appendAnimeCards([], true);
      } else {
        animePage = nextPage;
        var mapped = rawList.map(function (row) {
          if (animeTab === 'movies') {
            return typeof helpers.eK === 'function' ? helpers.eK(row) : row;
          }
          return typeof helpers.EK === 'function' ? helpers.EK(row) : row;
        });

        var seen = new Set(animeItems.map(function (x) { return x.slug; }));
        var fresh = mapped.filter(function (x) { return !x.slug || !seen.has(x.slug); });
        animeItems = isNextPage ? animeItems.concat(fresh) : mapped;

        var totalPages = parseInt(json.total_paginas || '', 10);
        var currPage = parseInt(json.pagina_actual || nextPage, 10);
        if (!isNaN(totalPages) && !isNaN(currPage)) {
          if (currPage >= totalPages) animeEnded = true;
        } else if (rawList.length < 25) {
          animeEnded = true;
        }

        appendAnimeCards(isNextPage ? fresh : animeItems, !isNextPage);
      }
    } catch (err) {
      console.warn('Error cargando sección Anime:', err);
    } finally {
      animeLoading = false;
      if (loadingEl) loadingEl.classList.add('hidden');
    }
  }

  window.ctvOpenAnimeSection = function (preserveTab) {
    if (!preserveTab) animeTab = 'series';
    resetAndLoadAnime();
  };

  window.ctvLoadMoreAnime = function () {
    loadAnimePage(true);
  };
})();

/* ============================================================================
 * CTV: ENRIQUECEDOR UNIVERSAL DE SERVIDORES (PELÍCULAS, SERIES, DORAMAS Y ANIME)
 * Independiente de PelisJuanita: provee espejos CDN y servidores multi-idioma
 * ============================================================================ */
(function () {
  function normalizeServerName(s) {
    if (!s) return;
    var u = String(s.url || s.link || '').toLowerCase();
    var cur = String(s.server_name || s.ServerName || s['server-name'] || '').trim();
    if (u.indexOf('seriesplayer.fortamomar.workers.dev') >= 0 || u.indexOf('pelisplayer.fortamomar.workers.dev') >= 0) {
      s.server_name = 'PELISJUANITA (DIRECTO)';
      s.ServerName = 'PELISJUANITA (DIRECTO)';
      return;
    }
    if (!cur || cur.toUpperCase() === 'UNKNOWN') {
      var guessed = '';
      if (u.indexOf('vimeus') >= 0 || u.indexOf('vimeos') >= 0) guessed = 'VIMEUS';
      else if (u.indexOf('savefiles') >= 0) guessed = 'SAVEFILES';
      else if (u.indexOf('voe.sx') >= 0) guessed = 'VOE';
      else if (u.indexOf('vibuxer') >= 0 || u.indexOf('hglink') >= 0 || u.indexOf('streamwish') >= 0) guessed = 'STREAMWISH';
      else if (u.indexOf('lulustream') >= 0 || u.indexOf('lulust') >= 0 || u.indexOf('lplaygo') >= 0) guessed = 'LULUSTREAM';
      else if (u.indexOf('vidara') >= 0) guessed = 'VIDARA';
      else if (u.indexOf('mixdrop') >= 0 || u.indexOf('mxdrop') >= 0) guessed = 'MIXDROP';
      else if (u.indexOf('bysesukior') >= 0 || u.indexOf('byse') >= 0) guessed = 'BYSE';
      else if (u.indexOf('morencius') >= 0 || u.indexOf('earnvids') >= 0) guessed = 'EARNVIDS';
      else if (u.indexOf('playmogo') >= 0 || u.indexOf('dood') >= 0) guessed = 'DOOD';
      else if (u.indexOf('vsembed') >= 0 || u.indexOf('vidsrc') >= 0) guessed = 'VIDSRC';
      if (guessed) {
        s.server_name = guessed;
        s.ServerName = guessed;
      }
    }
  }

  function serverRank(s) {
    var prefs = typeof window.ctvGetUserPrefs === 'function' ? window.ctvGetUserPrefs() : { preferredServer: '' };
    var prefSrv = String(prefs.preferredServer || '').toUpperCase();
    var name = ((s && (s.server_name || s.ServerName || s['server-name'])) || '').toUpperCase();
    var qual = ((s && (s.calidad || s.quality)) || '').toUpperCase();
    var prefBoost = prefSrv && name && name === prefSrv ? 4 : 0;
    var qualBoost = 0;
    if (/CAM|HDCAM|TS|SCREENER|TELECINE/.test(qual)) qualBoost = -25;
    else if (/4K|2160|UHD/.test(qual)) qualBoost = 5;
    else if (/FHD|1080|FULL/.test(qual)) qualBoost = 4;
    else if (/HD|720/.test(qual)) qualBoost = 2;
    var bonus = prefBoost + qualBoost;

    if (s && s._isBackupExtra) return (s._extraRank || 65) + bonus;
    var lang = ((s && (s.idioma || s.audio)) || '').toUpperCase();
    var u = ((s && (s.url || s.link)) || '').toLowerCase();

    // 1. Audio Latino al frente (servidores oficiales de PelisJuanita en Latino)
    if (lang.indexOf('LATIN') >= 0) {
      if (name.indexOf('PELISJUANITA') >= 0 || name.indexOf('DIRECTO') >= 0 || name.indexOf('PELISPLAYER') >= 0 || name.indexOf('SERIESPLAYER') >= 0) return 125 + bonus;
      if (name.indexOf('VIMEUS') >= 0 || u.indexOf('vimeus') >= 0) return 122 + bonus;
      if (u.indexOf('voe.sx') >= 0) return 118 + bonus;
      if (u.indexOf('vibuxer') >= 0 || u.indexOf('hglink') >= 0 || u.indexOf('streamwish') >= 0) return 117 + bonus;
      if (u.indexOf('lulustream') >= 0 || u.indexOf('lulust') >= 0) return 116 + bonus;
      if (u.indexOf('morencius') >= 0) return 115 + bonus;
      if (u.indexOf('vidara') >= 0 || u.indexOf('mixdrop') >= 0 || u.indexOf('bysesukior') >= 0 || u.indexOf('savefiles') >= 0) return 114 + bonus;
      return 110 + bonus;
    }
    // 2. Audio Castellano / Español
    if (lang.indexOf('ESPA') >= 0 || lang.indexOf('CAST') >= 0) {
      if (name.indexOf('PELISJUANITA') >= 0 || name.indexOf('DIRECTO') >= 0 || name.indexOf('PELISPLAYER') >= 0 || name.indexOf('SERIESPLAYER') >= 0) return 99 + bonus;
      if (name.indexOf('VIMEUS') >= 0 || u.indexOf('vimeus') >= 0) return 98 + bonus;
      if (u.indexOf('voe.sx') >= 0) return 96 + bonus;
      if (u.indexOf('vibuxer') >= 0 || u.indexOf('hglink') >= 0 || u.indexOf('streamwish') >= 0) return 95 + bonus;
      if (u.indexOf('lulustream') >= 0 || u.indexOf('lulust') >= 0) return 94 + bonus;
      return 90 + bonus;
    }
    // 3. Servidores oficiales subtitulados de PelisJuanita
    if (name.indexOf('PELISJUANITA') >= 0 || name.indexOf('DIRECTO') >= 0 || name.indexOf('PELISPLAYER') >= 0 || name.indexOf('SERIESPLAYER') >= 0) return 88 + bonus;
    return 82 + bonus;
  }

  function snapshotActiveServers(list, baseTitle) {
    try {
      window.__ctvActiveServerList = (Array.isArray(list) ? list : [])
        .map(function (s, i) {
          return {
            url: String((s && (s.url || s.link)) || ''),
            name: String((s && (s.server_name || s.ServerName || s['server-name'])) || ('Servidor ' + (i + 1))),
            lang: String((s && (s.idioma || s.audio)) || ''),
            quality: String((s && (s.calidad || s.quality)) || 'HD'),
            baseTitle: String(baseTitle || '')
          };
        })
        .filter(function (x) { return Boolean(x.url); });
    } catch (e) {}
  }

  window.ctvEnrichSeriesServers = function (servers, serieInfo, slug, season, episode) {
    var list = Array.isArray(servers) ? servers.slice() : [];
    var seenUrls = new Set();
    list.forEach(function (s) {
      normalizeServerName(s);
      var u = (s && (s.url || s.link)) || '';
      if (u) seenUrls.add(u);
    });

    var info = serieInfo || (window.__ctvCatalog && window.__ctvCatalog[slug]) || {};
    var tmdbId = info.TMDbId || info.tmdb_id || info.tmdb || (info.id && String(info.id).length >= 3 ? info.id : '');
    var imdbId = info.imdb_id || info.ImdbId || info.imdb;
    var t = season || 1;
    var e = episode || 1;

    var extraCandidates = [];
    if (imdbId) {
      extraCandidates.push({
        server_name: 'VSEMBED · MULTI',
        url: 'https://vsembed.su/embed/tv?imdb=' + encodeURIComponent(imdbId) + '&season=' + t + '&episode=' + e + '&ds_lang=es',
        audio: 'SUBTITULADA',
        quality: 'HD',
        _isBackupExtra: true,
        _extraRank: 75
      });
    } else if (tmdbId) {
      extraCandidates.push({
        server_name: 'VSEMBED · MULTI',
        url: 'https://vsembed.su/embed/tv?tmdb=' + encodeURIComponent(tmdbId) + '&season=' + t + '&episode=' + e + '&ds_lang=es',
        audio: 'SUBTITULADA',
        quality: 'HD',
        _isBackupExtra: true,
        _extraRank: 75
      });
    }

    if (tmdbId) {
      extraCandidates.push(
        {
          server_name: 'VIDSRC PRO',
          url: 'https://vidsrc.sh/embed/tv?tmdb=' + encodeURIComponent(tmdbId) + '&season=' + t + '&episode=' + e + '&ds_lang=es',
          audio: 'SUBTITULADA',
          quality: 'HD',
          _isBackupExtra: true,
          _extraRank: 74
        },
        {
          server_name: 'VIDLINK HD',
          url: 'https://vidlink.pro/tv/' + encodeURIComponent(tmdbId) + '/' + t + '/' + e,
          audio: 'SUBTITULADA',
          quality: 'FHD',
          _isBackupExtra: true,
          _extraRank: 73
        },
        {
          server_name: 'MULTIEMBED',
          url: 'https://multiembed.mov/?video_id=' + encodeURIComponent(tmdbId) + '&tmdb=1&s=' + t + '&e=' + e,
          audio: 'SUBTITULADA',
          quality: 'HD',
          _isBackupExtra: true,
          _extraRank: 72
        },
        {
          server_name: '2EMBED SERVER',
          url: 'https://www.2embed.cc/embedtv/' + encodeURIComponent(tmdbId) + '&s=' + t + '&e=' + e,
          audio: 'SUBTITULADA',
          quality: 'HD',
          _isBackupExtra: true,
          _extraRank: 71
        },
        {
          server_name: 'NONTONGO HD',
          url: 'https://www.nontongo.win/embed/tv/' + encodeURIComponent(tmdbId) + '/' + t + '/' + e,
          audio: 'SUBTITULADA',
          quality: 'HD',
          _isBackupExtra: true,
          _extraRank: 70
        }
      );
    }

    extraCandidates.forEach(function (cand) {
      if (!seenUrls.has(cand.url)) {
        seenUrls.add(cand.url);
        list.push(cand);
      }
    });

    list.sort(function (a, b) {
      return serverRank(b) - serverRank(a);
    });

    var baseSerieTitle = String(info.titulo || info.nombre || info.title || slug || '') + (t && e ? (' T' + t + 'E' + e) : '');
    snapshotActiveServers(list, baseSerieTitle.trim());
    return list;
  };

  window.ctvEnrichMovieServers = function (servers, movieInfo) {
    var list = Array.isArray(servers) ? servers.slice() : [];
    var seenUrls = new Set();
    list.forEach(function (s) {
      normalizeServerName(s);
      var u = (s && (s.url || s.link)) || '';
      if (u) seenUrls.add(u);
    });

    var info = movieInfo || (movieInfo && movieInfo.slug && window.__ctvCatalog && window.__ctvCatalog[movieInfo.slug]) || {};
    var tmdbId = info.TMDbId || info.tmdb_id || info.tmdb || (info.id && String(info.id).length >= 3 ? info.id : '');
    var imdbId = info.imdb_id || info.ImdbId || info.imdb;

    var extras = [];
    if (imdbId) {
      extras.push({
        server_name: 'VSEMBED · MULTI',
        url: 'https://vsembed.su/embed/movie?imdb=' + encodeURIComponent(imdbId) + '&ds_lang=es',
        idioma: 'SUBTITULADA',
        calidad: 'HD',
        _isBackupExtra: true,
        _extraRank: 75
      });
    } else if (tmdbId) {
      extras.push({
        server_name: 'VSEMBED · MULTI',
        url: 'https://vsembed.su/embed/movie?tmdb=' + encodeURIComponent(tmdbId) + '&ds_lang=es',
        idioma: 'SUBTITULADA',
        calidad: 'HD',
        _isBackupExtra: true,
        _extraRank: 75
      });
    }

    if (tmdbId) {
      extras.push(
        {
          server_name: 'VIDSRC PRO',
          url: 'https://vidsrc.sh/embed/movie?tmdb=' + encodeURIComponent(tmdbId) + '&ds_lang=es',
          idioma: 'SUBTITULADA',
          calidad: 'HD',
          _isBackupExtra: true,
          _extraRank: 74
        },
        {
          server_name: 'VIDLINK HD',
          url: 'https://vidlink.pro/movie/' + encodeURIComponent(tmdbId),
          idioma: 'SUBTITULADA',
          calidad: 'FHD',
          _isBackupExtra: true,
          _extraRank: 73
        },
        {
          server_name: 'MULTIEMBED',
          url: 'https://multiembed.mov/?video_id=' + encodeURIComponent(tmdbId) + '&tmdb=1',
          idioma: 'SUBTITULADA',
          calidad: 'HD',
          _isBackupExtra: true,
          _extraRank: 72
        },
        {
          server_name: '2EMBED SERVER',
          url: 'https://www.2embed.cc/embed/' + encodeURIComponent(tmdbId),
          idioma: 'SUBTITULADA',
          calidad: 'HD',
          _isBackupExtra: true,
          _extraRank: 71
        },
        {
          server_name: 'NONTONGO HD',
          url: 'https://www.nontongo.win/embed/movie/' + encodeURIComponent(tmdbId),
          idioma: 'SUBTITULADA',
          calidad: 'HD',
          _isBackupExtra: true,
          _extraRank: 70
        }
      );
    }

    extras.forEach(function (ex) {
      if (!seenUrls.has(ex.url)) {
        seenUrls.add(ex.url);
        list.push(ex);
      }
    });

    list.sort(function (a, b) {
      return serverRank(b) - serverRank(a);
    });

    var baseMovieTitle = String(info.titulo || info.nombre || info.title || '');
    snapshotActiveServers(list, baseMovieTitle.trim());
    return list;
  };
})();

/* ============================================================================
 * CTV: EXTRACTOR DIRECTO DE VIDEO (.M3U8 / .MP4 + SUBTÍTULOS .VTT) SIN ANUNCIOS
 * Funciona en Windows (.exe), Linux (.AppImage), iOS (.ipa) y Android (.apk)
 * ============================================================================ */
(function () {
  var activeBlobUrls = [];
  var activeStreamBlobUrl = null;
  var currentSubTracks = [];
  var selectedSubIndex = -1;
  var activePlaybackCleanups = [];

  function registerPlaybackCleanup(fn) {
    if (typeof fn === 'function') activePlaybackCleanups.push(fn);
  }

  function cleanupActivePlayback() {
    while (activePlaybackCleanups.length) {
      var fn = activePlaybackCleanups.pop();
      try { fn(); } catch (e) {}
    }
    setActiveHls(null);
  }

  function getActiveHls() {
    try {
      if (window.__ctvActiveHlsRef && typeof window.__ctvActiveHlsRef.deref === 'function') {
        return window.__ctvActiveHlsRef.deref() || null;
      }
    } catch (e) {}
    return window.__ctvActiveHls || null;
  }

  function setActiveHls(inst) {
    if (!inst) {
      window.__ctvActiveHlsRef = null;
      window.__ctvActiveHls = null;
      return;
    }
    try {
      if (typeof WeakRef === 'function') {
        window.__ctvActiveHlsRef = new WeakRef(inst);
        window.__ctvActiveHls = null;
      } else {
        window.__ctvActiveHls = inst;
      }
    } catch (e) {
      window.__ctvActiveHls = inst;
    }
  }

  function showPlayerLoader(label) {
    try {
      var modal = document.getElementById('player-modal');
      if (!modal) return;
      var el = document.getElementById('ctv-player-loader');
      if (!el) {
        el = document.createElement('div');
        el.id = 'ctv-player-loader';
        el.innerHTML =
          '<div class="ctv-spin"></div>' +
          '<div class="ctv-loader-txt" style="font-size:.95rem;font-weight:700;color:#e5e7f5;max-width:420px;text-align:center;padding:0 16px"></div>';
        modal.appendChild(el);
      }
      var txt = el.querySelector('.ctv-loader-txt');
      if (txt) txt.textContent = label || 'Conectando con el servidor…';
      el.style.opacity = '1';
    } catch (e) {}
  }

  function removePlayerLoader() {
    try {
      var el = document.getElementById('ctv-player-loader');
      if (el && el.parentNode) el.remove();
    } catch (e) {}
  }

  function revokeStreamBlob() {
    if (activeStreamBlobUrl) {
      try { URL.revokeObjectURL(activeStreamBlobUrl); } catch (e) {}
      activeStreamBlobUrl = null;
    }
  }

  var IMAGE_MODES = ['original', 'sharp', 'cinema'];
  var IMAGE_MODE_LABELS = {
    original: '✨ Original',
    sharp: '✨ Nítido HD',
    cinema: '✨ Cine'
  };

  function ensureSvgFilters() {
    try {
      if (document.getElementById('ctv-svg-filters')) return;
      var wrap = document.createElement('div');
      wrap.id = 'ctv-svg-filters';
      wrap.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none;opacity:0';
      wrap.innerHTML =
        '<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" aria-hidden="true">' +
        '<defs>' +
        '<filter id="ctv-unsharp-hd" color-interpolation-filters="sRGB">' +
        '<feConvolveMatrix order="3" kernelMatrix="0 -0.35 0 -0.35 2.4 -0.35 0 -0.35 0" preserveAlpha="true"/>' +
        '</filter>' +
        '</defs>' +
        '</svg>';
      (document.body || document.documentElement).appendChild(wrap);
    } catch (e) {}
  }

  function ensureImageModeButton() {
    var pBar = document.getElementById('player-bar');
    if (!pBar) return null;
    ensureSvgFilters();
    var mBtn = document.getElementById('player-imgmode');
    if (!mBtn) {
      mBtn = document.createElement('button');
      mBtn.id = 'player-imgmode';
      mBtn.className = 'btn focusable hidden';
      mBtn.tabIndex = 0;
      mBtn.title = 'Modo de imagen (Original / Nítido HD / Cine)';
      mBtn.textContent = '✨ Original';
      var subBtn = document.getElementById('player-subs');
      var favBtn = document.getElementById('player-fav');
      if (subBtn && subBtn.parentNode === pBar) pBar.insertBefore(mBtn, subBtn);
      else if (favBtn && favBtn.parentNode === pBar) pBar.insertBefore(mBtn, favBtn);
      else pBar.appendChild(mBtn);
    }
    mBtn.onclick = function (e) {
      e.stopPropagation();
      cycleImageMode();
    };
    return mBtn;
  }

  function applyImageMode(mode, persist) {
    ensureSvgFilters();
    var prefs = typeof window.ctvGetUserPrefs === 'function' ? window.ctvGetUserPrefs() : { imageMode: 'original' };
    var target = typeof mode === 'string' && IMAGE_MODES.indexOf(mode) >= 0
      ? mode
      : (IMAGE_MODES.indexOf(prefs.imageMode) >= 0 ? prefs.imageMode : 'original');
    var filterCss = 'none';
    if (target === 'sharp') {
      filterCss = 'url(#ctv-unsharp-hd) contrast(1.03) saturate(1.04)';
    } else if (target === 'cinema') {
      filterCss = 'contrast(1.07) saturate(1.10) brightness(0.99)';
    }
    var pv = document.getElementById('player-video');
    var pf = document.getElementById('player-frame');
    if (pv) pv.style.filter = filterCss === 'none' ? '' : filterCss;
    if (pf) pf.style.filter = filterCss === 'none' ? '' : filterCss;
    var mBtn = ensureImageModeButton();
    if (mBtn) {
      mBtn.textContent = IMAGE_MODE_LABELS[target] || '✨ Original';
    }
    if (persist && typeof window.ctvSaveUserPrefs === 'function') {
      window.ctvSaveUserPrefs({ imageMode: target });
    }
    return target;
  }

  function cycleImageMode() {
    var prefs = typeof window.ctvGetUserPrefs === 'function' ? window.ctvGetUserPrefs() : { imageMode: 'original' };
    var cur = IMAGE_MODES.indexOf(prefs.imageMode) >= 0 ? prefs.imageMode : 'original';
    var next = IMAGE_MODES[(IMAGE_MODES.indexOf(cur) + 1) % IMAGE_MODES.length];
    applyImageMode(next, true);
    if (typeof window.ctvShowToast === 'function') {
      window.ctvShowToast('Modo de imagen: ' + (IMAGE_MODE_LABELS[next] || next));
    }
    return next;
  }
  window.ctvSetImageMode = applyImageMode;
  window.ctvCycleImageMode = cycleImageMode;

  function ensureQualityButton() {
    var pBar = document.getElementById('player-bar');
    if (!pBar) return null;
    var qBtn = document.getElementById('player-quality');
    if (!qBtn) {
      qBtn = document.createElement('button');
      qBtn.id = 'player-quality';
      qBtn.className = 'btn focusable hidden';
      qBtn.tabIndex = 0;
      qBtn.title = 'Calidad de video';
      qBtn.textContent = '🎬 HD';
      var mBtn = document.getElementById('player-imgmode');
      var subBtn = document.getElementById('player-subs');
      var favBtn = document.getElementById('player-fav');
      if (mBtn && mBtn.parentNode === pBar) pBar.insertBefore(qBtn, mBtn);
      else if (subBtn && subBtn.parentNode === pBar) pBar.insertBefore(qBtn, subBtn);
      else if (favBtn && favBtn.parentNode === pBar) pBar.insertBefore(qBtn, favBtn);
      else pBar.appendChild(qBtn);
    }
    return qBtn;
  }

  function formatHeightLabel(h) {
    var num = parseInt(h, 10) || 0;
    if (num >= 2160) return '4K UHD';
    if (num >= 1080) return '1080p FHD';
    if (num >= 720) return '720p HD';
    if (num >= 480) return '480p';
    if (num > 0) return num + 'p';
    return 'HD';
  }

  function updateQualityButtonUI() {
    var mBtn = ensureImageModeButton();
    if (mBtn) {
      applyImageMode(null, false);
      mBtn.classList.remove('hidden');
    }
    var qBtn = ensureQualityButton();
    if (!qBtn) return;
    var hls = getActiveHls();
    if (hls && Array.isArray(hls.levels) && hls.levels.length > 0) {
      var curIdx = typeof hls.currentLevel === 'number' && hls.currentLevel >= 0 ? hls.currentLevel : hls.loadLevel;
      var curLvl = hls.levels[curIdx] || hls.levels[hls.levels.length - 1];
      var h = (curLvl && curLvl.height) || 0;
      var isAuto = Boolean(hls.autoLevelEnabled || hls.currentLevel === -1 || hls.nextLevel === -1);
      qBtn.textContent = '🎬 ' + (isAuto ? ('Auto · ' + formatHeightLabel(h)) : formatHeightLabel(h));
      qBtn.classList.remove('hidden');
      qBtn.onclick = function (e) {
        e.stopPropagation();
        showQualityModal();
      };
      return;
    }
    var video = document.getElementById('player-video');
    if (video && !video.classList.contains('hidden') && video.videoHeight > 0) {
      qBtn.textContent = '🎬 ' + formatHeightLabel(video.videoHeight);
      qBtn.classList.remove('hidden');
      qBtn.onclick = function (e) {
        e.stopPropagation();
        if (typeof window.ctvShowToast === 'function') {
          window.ctvShowToast('🎬 Reproduciendo en ' + formatHeightLabel(video.videoHeight) + ' (' + video.videoWidth + '×' + video.videoHeight + ')');
        }
      };
    }
  }

  function showQualityModal() {
    var old = document.getElementById('ctv-quality-modal');
    if (old) { old.remove(); return; }
    var hls = getActiveHls();
    if (!hls || !Array.isArray(hls.levels) || !hls.levels.length) return;

    var modal = document.createElement('div');
    modal.id = 'ctv-quality-modal';
    modal.className = 'modal';
    modal.style.zIndex = '99999';
    modal.innerHTML =
      '<div class="dialog" style="max-width:420px">' +
      '<div class="dialog-head"><h3>🎬 Calidad de video</h3><button class="btn focusable" id="ctv-quality-close" tabindex="0">✕</button></div>' +
      '<div class="server-list" id="ctv-quality-list" style="max-height:55vh;overflow-y:auto"></div>' +
      '</div>';
    document.body.appendChild(modal);

    var listEl = modal.querySelector('#ctv-quality-list');
    var isAuto = Boolean(hls.autoLevelEnabled || hls.currentLevel === -1);
    var focusTarget = null;

    var autoBtn = document.createElement('button');
    autoBtn.className = 'focusable';
    autoBtn.tabIndex = 0;
    autoBtn.innerHTML = '<span>' + (isAuto ? '✔ ' : '') + 'Automática (HD 1080p Priorizado)</span>';
    autoBtn.onclick = function () {
      try { hls.currentLevel = -1; hls.nextLevel = -1; } catch (e) {}
      if (typeof window.ctvSaveUserPrefs === 'function') window.ctvSaveUserPrefs({ preferredQuality: 'auto' });
      updateQualityButtonUI();
      modal.remove();
    };
    listEl.appendChild(autoBtn);
    if (isAuto) focusTarget = autoBtn;

    var indexed = hls.levels.map(function (lvl, idx) {
      return { idx: idx, height: lvl.height || 0, bitrate: lvl.bitrate || 0 };
    }).sort(function (a, b) {
      return (b.height - a.height) || (b.bitrate - a.bitrate);
    });

    var seenHeights = new Set();
    indexed.forEach(function (item) {
      var key = item.height > 0 ? String(item.height) : ('idx-' + item.idx);
      if (seenHeights.has(key)) return;
      seenHeights.add(key);
      var b = document.createElement('button');
      b.className = 'focusable';
      b.tabIndex = 0;
      var active = !isAuto && hls.currentLevel === item.idx;
      var kbps = item.bitrate ? (' · ' + (item.bitrate / 1000000).toFixed(1) + ' Mbps') : '';
      b.innerHTML = '<span>' + (active ? '✔ ' : '') + formatHeightLabel(item.height) + kbps + '</span>';
      b.onclick = function () {
        try { hls.currentLevel = item.idx; hls.loadLevel = item.idx; } catch (e) {}
        if (item.height > 0 && typeof window.ctvSaveUserPrefs === 'function') {
          window.ctvSaveUserPrefs({ preferredQuality: String(item.height) });
        }
        updateQualityButtonUI();
        modal.remove();
      };
      listEl.appendChild(b);
      if (active) focusTarget = b;
    });

    modal.querySelector('#ctv-quality-close').onclick = function () { modal.remove(); };
    modal.addEventListener('click', function (e) { if (e.target === modal) modal.remove(); });
    setTimeout(function () {
      if (focusTarget && focusTarget.focus) focusTarget.focus();
    }, 50);
  }

  // Hook universal idempotente y seguro ante OTA sobre hls.js interno (class ys) para arrancar directamente en 1080p/HD (5 Mbps initial estimate)
  window.__ctvOnHlsUserConfigSet = function (inst, val) {
    if (!val || typeof val !== 'object' || !inst || !inst.config || typeof inst.config.abrEwmaDefaultEstimate !== 'number') {
      return;
    }
    try {
      inst.config.abrEwmaDefaultEstimate = 5000000;
      inst.config.abrEwmaDefaultEstimateMax = 20000000;
      inst.config.capLevelToPlayerSize = false;
      inst.config.abrBandWidthFactor = 0.95;
      inst.config.abrBandWidthUpFactor = 0.85;
      inst.config.maxBufferLength = 45;
      inst.config.maxMaxBufferLength = 600;
      inst.config.backBufferLength = 60;
      val.abrEwmaDefaultEstimate = 5000000;
      val.capLevelToPlayerSize = false;
      if (inst.constructor && inst.constructor.DefaultConfig) {
        inst.constructor.DefaultConfig.abrEwmaDefaultEstimate = 5000000;
        inst.constructor.DefaultConfig.capLevelToPlayerSize = false;
      }
      setActiveHls(inst);
      var ref = typeof WeakRef === 'function' ? new WeakRef(inst) : { deref: function () { return inst; } };
      setTimeout(function () {
        try {
          var hlsInst = ref.deref();
          if (!hlsInst || typeof hlsInst.on !== 'function' || hlsInst.__ctvEventsBound) return;
          hlsInst.__ctvEventsBound = true;
          var onManifestParsed = function () {
            try {
              var curHls = ref.deref();
              if (!curHls) return;
              var prefs = typeof window.ctvGetUserPrefs === 'function' ? window.ctvGetUserPrefs() : { preferredQuality: 'auto' };
              var prefH = parseInt(prefs.preferredQuality, 10) || 0;
              if (prefH > 0 && Array.isArray(curHls.levels) && curHls.levels.length > 1) {
                var bestIdx = -1;
                for (var li = 0; li < curHls.levels.length; li++) {
                  var lh = curHls.levels[li].height || 0;
                  if (lh === prefH || (bestIdx < 0 && lh <= prefH)) bestIdx = li;
                }
                if (bestIdx >= 0) curHls.currentLevel = bestIdx;
              }
            } catch (e) {}
            updateQualityButtonUI();
          };
          var onLevelSwitched = function () {
            updateQualityButtonUI();
          };
          var onDestroying = function () {
            var curHls = ref.deref();
            if (curHls && getActiveHls() === curHls) {
              setActiveHls(null);
            }
          };
          hlsInst.on('hlsManifestParsed', onManifestParsed);
          hlsInst.on('hlsLevelSwitched', onLevelSwitched);
          hlsInst.on('hlsDestroying', onDestroying);
          registerPlaybackCleanup(function () {
            try {
              var curHls = ref.deref();
              if (curHls && typeof curHls.off === 'function') {
                curHls.off('hlsManifestParsed', onManifestParsed);
                curHls.off('hlsLevelSwitched', onLevelSwitched);
                curHls.off('hlsDestroying', onDestroying);
              }
            } catch (e) {}
            setActiveHls(null);
          });
        } catch (e) {}
      }, 0);
    } catch (e) {}
  };

  if (!window.__ctvHlsHookVersion) {
    window.__ctvHlsHookVersion = 15;
    try {
      var existingDesc = Object.getOwnPropertyDescriptor(Object.prototype, 'userConfig');
      if (!existingDesc || existingDesc.configurable !== false) {
        Object.defineProperty(Object.prototype, 'userConfig', {
          configurable: true,
          enumerable: false,
          get: function () {
            return undefined;
          },
          set: function (val) {
            try {
              Object.defineProperty(this, 'userConfig', {
                value: val,
                writable: true,
                enumerable: true,
                configurable: true
              });
            } catch (e) {}
            try {
              if (typeof window.__ctvOnHlsUserConfigSet === 'function') {
                window.__ctvOnHlsUserConfigSet(this, val);
              }
            } catch (e) {}
          }
        });
      }
    } catch (e) {}
  }

  try {
    var pvEl = document.getElementById('player-video');
    if (pvEl && !pvEl.__ctvQualBound) {
      pvEl.__ctvQualBound = true;
      pvEl.addEventListener('loadedmetadata', updateQualityButtonUI);
      pvEl.addEventListener('resize', updateQualityButtonUI);
    }
  } catch (e) {}

  function cleanupSubs() {
    activeBlobUrls.forEach(function (u) {
      try { URL.revokeObjectURL(u); } catch (e) {}
    });
    activeBlobUrls = [];
    currentSubTracks = [];
    selectedSubIndex = -1;
    var subBtn = document.getElementById('player-subs');
    if (subBtn) subBtn.classList.add('hidden');
    var subModal = document.getElementById('ctv-subs-modal');
    if (subModal) subModal.remove();
    var qBtn = document.getElementById('player-quality');
    if (qBtn) qBtn.classList.add('hidden');
    var qModal = document.getElementById('ctv-quality-modal');
    if (qModal) qModal.remove();
    var mBtn = document.getElementById('player-imgmode');
    if (mBtn) mBtn.classList.add('hidden');
    setActiveHls(null);
    var video = document.getElementById('player-video');
    if (video) {
      video.onerror = null;
      var tracks = video.querySelectorAll('track');
      for (var i = 0; i < tracks.length; i++) tracks[i].remove();
    }
  }

  function removeAgendaStatusOverlay() {
    try {
      var st = document.getElementById('ctv-agenda-status');
      if (st) st.remove();
    } catch (e) {}
  }

  window.ctvOnPlayerClose = function () {
    window.__ctvPlaySessionId = (window.__ctvPlaySessionId || 0) + 1;
    cleanupActivePlayback();
    removePlayerLoader();
    cleanupSubs();
    revokeStreamBlob();
    removeAgendaStatusOverlay();
    var pFavRestore = document.getElementById('player-fav');
    if (pFavRestore) pFavRestore.classList.remove('hidden');
    var pfClose = document.getElementById('player-frame');
    if (pfClose) pfClose.removeAttribute('sandbox');
    if (window.__ctvLastServerBtn && window.__ctvLastServerBtn.isConnected) {
      var btn = window.__ctvLastServerBtn;
      setTimeout(function () {
        try { btn.focus({ preventScroll: true }); } catch (e) { try { btn.focus(); } catch (x) {} }
      }, 60);
    }
    if (typeof window.__ctvFlushPendingOta === 'function') {
      setTimeout(window.__ctvFlushPendingOta, 120);
    }
  };

  function parseCookiesFromHeader(raw) {
    if (!raw) return '';
    var str = Array.isArray(raw) ? raw.join(', ') : String(raw);
    str = str.replace(/expires=[A-Za-z]{3},\s*[^;,]+/gi, '');
    var parts = str.split(/,\s*(?=[a-zA-Z0-9_-]+=)/);
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      var kv = parts[i].split(';')[0].trim();
      if (kv && kv.indexOf('=') > 0) out.push(kv);
    }
    return out.join('; ');
  }

  // Petición HTTP con Referer personalizado (usa /__ctv_proxy en PC y CapacitorHttp nativo en iOS/Android)
  async function ctvHttpRequest(targetUrl, opts) {
    opts = opts || {};
    var method = (opts.method || 'GET').toUpperCase();
    var ref = opts.referer || 'https://pelisjuanita.com/';
    var contentType = opts.contentType || '';
    var body = opts.body || '';
    var cookie = opts.cookie || '';

    // 1. Desktop (Electron local server)
    if (window.ctvIsDesktopProxyAvailable()) {
      try {
        var proxyUrl =
          '/__ctv_proxy?url=' + encodeURIComponent(targetUrl) +
          '&ref=' + encodeURIComponent(ref) +
          '&method=' + encodeURIComponent(method) +
          (contentType ? '&ct=' + encodeURIComponent(contentType) : '') +
          (cookie ? '&cookie=' + encodeURIComponent(cookie) : '') +
          (body ? '&body=' + encodeURIComponent(body) : '');
        var r = await fetch(proxyUrl);
        if (r.ok) {
          var j = await r.json();
          if (j && j.body) {
            return { status: j.status || 200, url: j.finalUrl || targetUrl, cookies: j.cookies || '', body: j.body };
          }
        }
      } catch (e) {}
    }

    // 2. Android / iOS / Smart TV CapacitorHttp nativo (sin restricciones CORS y con IP real del dispositivo)
    try {
      var capHttpFn = null;
      if (window.Capacitor && typeof window.Capacitor.nativePromise === 'function') {
        capHttpFn = function (payload) { return window.Capacitor.nativePromise('CapacitorHttp', 'request', payload); };
      } else if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.CapacitorHttp && typeof window.Capacitor.Plugins.CapacitorHttp.request === 'function') {
        capHttpFn = function (payload) { return window.Capacitor.Plugins.CapacitorHttp.request(payload); };
      }
      if (capHttpFn) {
        var refOrigin = 'https://pelisjuanita.com';
        try { refOrigin = new URL(ref).origin; } catch (e) {}
        var headers = {
          'Referer': ref,
          'Origin': refOrigin,
          'User-Agent': navigator.userAgent || 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        };
        if (contentType) headers['Content-Type'] = contentType;
        if (cookie) headers['Cookie'] = cookie;

        var reqPayload = {
          url: targetUrl,
          method: method,
          headers: headers,
          responseType: 'text',
          connectTimeout: 8000,
          readTimeout: 8000
        };
        if (body) {
          reqPayload.data = contentType.indexOf('json') >= 0 ? JSON.parse(body) : body;
        }
        var capRes = await capHttpFn(reqPayload);
        if (capRes && capRes.data != null) {
          var strData = typeof capRes.data === 'string' ? capRes.data : JSON.stringify(capRes.data);
          var resHeaders = capRes.headers || {};
          var rawSc = resHeaders['Set-Cookie'] || resHeaders['set-cookie'] || '';
          var parsedCookies = parseCookiesFromHeader(rawSc);
          return { status: capRes.status || 200, url: capRes.url || targetUrl, cookies: parsedCookies, body: strData };
        }
      }
    } catch (e) {}

    // 3. Fallback fetch estándar
    try {
      var fetchOpts = { method: method, headers: {} };
      if (contentType) fetchOpts.headers['Content-Type'] = contentType;
      if (body) fetchOpts.body = body;
      var resp = await fetch(targetUrl, fetchOpts);
      var txt = await resp.text();
      return { status: resp.status, url: resp.url || targetUrl, cookies: '', body: txt };
    } catch (e) {
      return { status: 0, url: targetUrl, cookies: '', body: '' };
    }
  }

  function baseN(num, base) {
    var digits = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    if (num === 0) return '0';
    var out = '';
    while (num > 0) {
      out = digits[num % base] + out;
      num = Math.floor(num / base);
    }
    return out;
  }

  function unpackPacker(html) {
    if (!html) return '';
    var extra = '';
    var re = /\}\('([\s\S]*?)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'([\s\S]*?)'\.split\('\|'\)/g;
    var m;
    while ((m = re.exec(html)) !== null) {
      try {
        var p = m[1];
        var a = parseInt(m[2], 10);
        var c = parseInt(m[3], 10);
        var k = m[4].split('|');
        for (var i = c - 1; i >= 0; i--) {
          if (k[i]) {
            var token = baseN(i, a);
            p = p.replace(new RegExp('\\b' + token + '\\b', 'g'), k[i]);
          }
        }
        extra += '\n' + p;
      } catch (e) {}
    }
    return html + extra;
  }

  function hexToBytes(hex) {
    var bytes = new Uint8Array(hex.length / 2);
    for (var i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return bytes;
  }

  function bytesToHex(bytes) {
    var out = '';
    for (var i = 0; i < bytes.length; i++) {
      var h = bytes[i].toString(16);
      out += h.length < 2 ? '0' + h : h;
    }
    return out;
  }

  async function solveVoeAltcha(html, targetUrl, pageCookies) {
    try {
      if (!html || html.indexOf('altcha-widget') < 0) return null;
      var tokenMatch = html.match(/name=["']_token["']\s+value=["']([^"']+)["']/i);
      var chalMatch = html.match(/challenge=["'](https?:\/\/[^"']+)["']/i);
      if (!tokenMatch || !chalMatch) return null;
      var csrfToken = tokenMatch[1];
      var chalUrl = chalMatch[1];

      var chalRes = await ctvHttpRequest(chalUrl, { referer: targetUrl, cookie: pageCookies });
      if (!chalRes.body) return null;
      var chal = JSON.parse(chalRes.body);
      if (!chal || !chal.parameters || !chal.parameters.nonce || !chal.parameters.salt) return null;

      var subtle = window.crypto && window.crypto.subtle;
      if (!subtle) return null;

      var params = chal.parameters;
      var nonceBytes = hexToBytes(params.nonce);
      var saltBytes = hexToBytes(params.salt);
      var cost = params.cost || 10000;
      var keyLenBits = (params.keyLength || 32) * 8;
      var prefix = String(params.keyPrefix || '00').toLowerCase();
      var hashAlgo = params.algorithm && params.algorithm.indexOf('512') >= 0
        ? 'SHA-512'
        : (params.algorithm && params.algorithm.indexOf('384') >= 0 ? 'SHA-384' : 'SHA-256');

      var t0 = Date.now();
      var solution = null;
      var batchSize = 16;
      for (var n = 0; n < 12000 && !solution; n += batchSize) {
        if (n > 0 && n % 64 === 0) {
          await new Promise(function (r) { setTimeout(r, 0); });
        }
        var tasks = [];
        for (var j = 0; j < batchSize; j++) {
          (function (counter) {
            var pw = new Uint8Array(nonceBytes.length + 4);
            pw.set(nonceBytes, 0);
            new DataView(pw.buffer).setUint32(nonceBytes.length, counter, false);
            tasks.push(
              subtle.importKey('raw', pw, { name: 'PBKDF2' }, false, ['deriveBits'])
                .then(function (k) {
                  return subtle.deriveBits({ name: 'PBKDF2', salt: saltBytes, iterations: cost, hash: hashAlgo }, k, keyLenBits);
                })
                .then(function (bits) {
                  return { counter: counter, hex: bytesToHex(new Uint8Array(bits)) };
                })
            );
          })(n + j);
        }
        var results = await Promise.all(tasks);
        for (var rIdx = 0; rIdx < results.length; rIdx++) {
          if (results[rIdx].hex.indexOf(prefix) === 0) {
            solution = {
              counter: results[rIdx].counter,
              derivedKey: results[rIdx].hex,
              time: Date.now() - t0
            };
            break;
          }
        }
      }
      if (!solution) return null;

      var altchaPayload = btoa(JSON.stringify({
        challenge: { parameters: chal.parameters, signature: chal.signature },
        solution: solution
      }));

      var postCookies = chalRes.cookies ? (pageCookies ? pageCookies + '; ' + chalRes.cookies : chalRes.cookies) : pageCookies;
      var postRes = await ctvHttpRequest(targetUrl, {
        method: 'POST',
        referer: targetUrl,
        cookie: postCookies,
        contentType: 'application/json',
        body: JSON.stringify({ _token: csrfToken, access: '0', altcha: altchaPayload })
      });
      if (postRes && postRes.body && postRes.body.length > 3500) {
        return postRes.body;
      }
    } catch (e) {}
    return null;
  }

  function sanitizeEmbedHtml(html, baseUrl) {
    if (!html) return '';
    var origin = '';
    try { origin = new URL(baseUrl).origin; } catch (e) {}
    var cleaned = html
      .replace(/<script[^>]*src=["'][^"']*(?:phruk\.org|flawlessimmunizeguy|llvpn\.com|acscdn\.com|trkr\.ppof\.net|ads-twitter|ima3\.js|pop\.js|histats|aclib|adcash|exoclick|juicyads|propeller|clickadu|popads|popmyads|trafficjunky|tsyndicate|bidgear|onmarshtompor|rtmark|yllix|stripchat|livejasmin|chaturbate|bongacams)[^"']*["'][^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?(?:flawlessimmunizeguy|f98a024e|c5022bca5c8bac1451cf|phruk\.org|llvpn\.com|openLoginTab|streamtp10\.com\/block|\/block\.html|window\.top\s*===\s*window\.self|acscdn\.com|trkr\.ppof\.net|ADCASH_ZONE_ID)[\s\S]*?<\/script>/gi, '')
      .replace(/<div[^>]*id=["']first-click-ad["'][^>]*>[\s\S]*?<\/div>/gi, '')
      .replace(/c74a68dfbd15fcd6f23a6b26879bc82e\s*\(\s*\)/g, 'void 0')
      .replace(/["']hasAttribute["']/g, '"__ctvNoAttr"')
      .replace(/["']\/blocked["']/g, '"#"')
      .replace(/["']\/block\.html["']/gi, '"#"')
      .replace(/document\.domain\s*=\s*document\.domain/g, 'void 0');

    var ctvAntiSandboxSpoof = '<script>(function(){try{var rf=window.frameElement;if(rf){var oHas=Element.prototype.hasAttribute;Element.prototype.hasAttribute=function(n){if(this===rf&&String(n).toLowerCase()==="sandbox")return false;return oHas.call(this,n);};var oGet=Element.prototype.getAttribute;Element.prototype.getAttribute=function(n){if(this===rf&&String(n).toLowerCase()==="sandbox")return null;return oGet.call(this,n);};}Object.defineProperty(window,"frameElement",{get:function(){return null;},configurable:true});Object.defineProperty(window,"open",{value:function(){return{closed:false,focus:function(){},close:function(){},location:{}};},writable:true,configurable:true});}catch(e){}})();<\/script>';

    var shieldTag =
      (origin ? '<base href="' + origin + '/">' : '') +
      ctvAntiSandboxSpoof +
      '<script>window.cRAds=true;<\/script>';

    if (/<head[^>]*>/i.test(cleaned)) {
      cleaned = cleaned.replace(/<head[^>]*>/i, function (m) { return m + shieldTag; });
    } else {
      cleaned = shieldTag + cleaned;
    }
    return cleaned;
  }

  function decodeVoeJson(html) {
    try {
      var m = html.match(/<script\s+type=["']application\/json["']>\s*(\[\s*["'][\s\S]*?["']\s*\])\s*<\/script>/i);
      if (!m) return null;
      var arr = JSON.parse(m[1]);
      if (!arr || !arr[0]) return null;
      var s = String(arr[0]).replace(/[a-zA-Z]/g, function (c) {
        var code = c.charCodeAt(0);
        var base = code <= 90 ? 65 : 97;
        return String.fromCharCode(((code - base + 13) % 26) + base);
      });
      var junk = ['@$', '^^', '~@', '%?', '*~', '!!', '#&'];
      for (var i = 0; i < junk.length; i++) {
        s = s.split(junk[i]).join('');
      }
      var step1 = atob(s);
      var shifted = '';
      for (var j = step1.length - 1; j >= 0; j--) {
        shifted += String.fromCharCode(step1.charCodeAt(j) - 3);
      }
      var finalJson = atob(shifted);
      return JSON.parse(finalJson);
    } catch (e) {
      return null;
    }
  }

  function srtToVtt(text) {
    if (!text) return '';
    var trimmed = text.trim();
    if (trimmed.indexOf('WEBVTT') === 0) return trimmed;
    return 'WEBVTT\n\n' + trimmed.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
  }

  function parseSportsStreamFromHtml(html) {
    if (!html) return null;
    var norm = html.replace(/\\\//g, '/');

    var xorMatch = norm.match(/var\s+_p\s*=\s*["']([^"']+)["']\s*,\s*_k\s*=\s*([0-9]+)/);
    if (xorMatch && xorMatch[1] && xorMatch[2]) {
      try {
        var rawBin = atob(xorMatch[1]);
        var kNum = parseInt(xorMatch[2], 10) || 0;
        var decoded = '';
        for (var xi = 0; xi < rawBin.length; xi++) {
          decoded += String.fromCharCode((rawBin.charCodeAt(xi) ^ ((kNum + xi) & 255)) & 255);
        }
        var uMatch = decoded.match(/var\s+u\s*=\s*["'](https?:\/\/[^"']+\.mpd[^"']*)["']/i);
        var iMatch = decoded.match(/,\s*i\s*=\s*["']([a-f0-9]+)["']/i);
        var kMatch = decoded.match(/,\s*k\s*=\s*["']([a-f0-9]+)["']/i);
        if (uMatch && uMatch[1]) {
          return {
            url: uMatch[1],
            keyId: (iMatch && iMatch[1]) || '',
            key: (kMatch && kMatch[1]) || '',
            type: 'dash',
            isLive: true,
            tracks: []
          };
        }
      } catch (e) {}
    }

    var pbMatch = norm.match(/playbackURL\s*=\s*['"](https?:\/\/[^'"]+\.m3u8[^'"]*)['"]/i);
    if (pbMatch) return { url: pbMatch[1], type: 'hls', isLive: true, tracks: [] };
    var srcMatch = norm.match(/["']src["']\s*:\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i);
    if (srcMatch) return { url: srcMatch[1], type: 'hls', isLive: true, tracks: [] };
    var m3u8Match = norm.match(/https?:\/\/[^\s"'<>\\]+\.m3u8[^\s"'<>\\]*/i);
    if (m3u8Match) return { url: m3u8Match[0], type: 'hls', isLive: true, tracks: [] };

    var b64Re = /atob\(\s*['"]([A-Za-z0-9+/=_-]{24,})['"]\s*\)/g;
    var bm;
    while ((bm = b64Re.exec(norm)) !== null) {
      try {
        var decB64 = atob(bm[1].replace(/-/g, '+').replace(/_/g, '/'));
        var mB64 = decB64.match(/https?:\/\/[^\s"'<>\\]+\.m3u8[^\s"'<>\\]*/i);
        if (mB64) return { url: mB64[0], type: 'hls', isLive: true, tracks: [] };
        var dB64 = decB64.match(/https?:\/\/[^\s"'<>\\]+\.mpd[^\s"'<>\\]*/i);
        if (dB64) return { url: dB64[0], keyId: '', key: '', type: 'dash', isLive: true, tracks: [] };
      } catch (e) {}
    }
    return null;
  }

  async function extractTvf90(rawUrl) {
    try {
      var target = rawUrl;
      if (target.indexOf('eventos.html?r=') >= 0) {
        var b64 = target.split('eventos.html?r=')[1].split('&')[0];
        try {
          target = decodeURIComponent(escape(atob(decodeURIComponent(b64).replace(/-/g, '+').replace(/_/g, '/'))));
        } catch (e) {
          try { target = atob(decodeURIComponent(b64)); } catch (e2) {}
        }
      }

      var candidates = [];
      if (target.indexOf('tvf90.com/') >= 0 && target.indexOf('.php?stream=') >= 0) {
        var target5 = target.replace(/\/[a-z0-9_-]+\.php\?stream=/i, '/5.php?stream=');
        if (target5 !== target) candidates.push(target5);
      }
      candidates.push(target);

      var lastSanitized = null;
      for (var cIdx = 0; cIdx < candidates.length; cIdx++) {
        var curUrl = candidates[cIdx];
        var curRef = curUrl.indexOf('tvf90.com') >= 0 || curUrl.indexOf('tv-90.com') >= 0
          ? 'https://tvf90.com/'
          : 'https://pelisjuanita.com/';

        for (var hop = 0; hop < 3; hop++) {
          var res = await ctvHttpRequest(curUrl, { referer: curRef });
          if (!res || !res.body) break;

          var extracted = parseSportsStreamFromHtml(res.body);
          if (extracted) return extracted;

          if (res.body.indexOf('<html') >= 0 && res.body.indexOf('pelotalibre.uno') < 0 && res.body.indexOf('block.html') < 0) {
            lastSanitized = { url: curUrl, type: 'srcdoc', html: sanitizeEmbedHtml(res.body, curUrl), isLive: true, tracks: [] };
          }

          var ifrMatch = res.body.match(/<iframe[^>]+src=["']([^"']+)["']/i);
          if (!ifrMatch || !ifrMatch[1]) break;
          var nextUrl = '';
          try { nextUrl = new URL(ifrMatch[1], curUrl).toString(); } catch (e) { break; }
          if (!nextUrl || nextUrl === curUrl || nextUrl.indexOf('block.html') >= 0) break;
          curRef = curUrl;
          curUrl = nextUrl;
        }
      }

      if (lastSanitized) return lastSanitized;
      return null;
    } catch (e) {
      return null;
    }
  }

  async function extractDoodStream(rawUrl) {
    try {
      var pageRes = await ctvHttpRequest(rawUrl, { referer: 'https://pelisjuanita.com/' });
      if (!pageRes.body) return null;
      var html = pageRes.body;
      var md5Match = html.match(/\/pass_md5\/([a-zA-Z0-9_-]+)/);
      if (!md5Match) return null;
      var parsed = new URL(rawUrl);
      var passUrl = parsed.origin + '/pass_md5/' + md5Match[1];
      var tokRes = await ctvHttpRequest(passUrl, { referer: rawUrl });
      if (!tokRes.body) return null;
      var baseStream = tokRes.body.trim();
      if (!baseStream) return null;
      var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      var rnd = '';
      for (var i = 0; i < 10; i++) rnd += chars.charAt(Math.floor(Math.random() * chars.length));
      var tokenMatch = passUrl.match(/\/pass_md5\/([^/]+)/);
      var token = tokenMatch ? tokenMatch[1] : '';
      var finalMp4 = baseStream + rnd + '?token=' + token + '&expiry=' + Date.now();
      return { url: finalMp4, type: 'mp4', tracks: [] };
    } catch (e) {
      return null;
    }
  }

  async function extractVsembedStream(rawUrl) {
    try {
      var parsed = new URL(rawUrl);
      var tmdbId = parsed.searchParams.get('tmdb') || '';
      var imdbId = parsed.searchParams.get('imdb') || '';
      var season = parsed.searchParams.get('season') || parsed.searchParams.get('s') || '';
      var episode = parsed.searchParams.get('episode') || parsed.searchParams.get('e') || '';
      var isTv = parsed.pathname.indexOf('/tv') >= 0 || (season && episode);

      var id = imdbId || tmdbId;
      if (!id) {
        var parts = parsed.pathname.split('/').filter(Boolean);
        id = parts[parts.length - 1];
      }
      if (!id) return null;

      var vsApiUrl = 'https://vsembed.su/vs_src.php?type=' + (isTv ? 'tv' : 'movie') + '&id=' + encodeURIComponent(id) + '&ds_lang=es';
      if (isTv && season && episode) {
        vsApiUrl += '&season=' + encodeURIComponent(season) + '&episode=' + encodeURIComponent(episode);
      }

      var r1 = await ctvHttpRequest(vsApiUrl, { referer: rawUrl });
      if (!r1.body) return null;
      var j1 = JSON.parse(r1.body);
      if (!j1 || !j1.src) return null;
      var src1 = j1.src;
      if (src1.indexOf('//') === 0) src1 = 'https:' + src1;

      var r2 = await ctvHttpRequest(src1, { referer: 'https://vsembed.su/' });
      if (!r2.body) return null;
      var cfgMatch = r2.body.match(/window\.CFG\s*=\s*(\{[\s\S]*?\});/);
      if (!cfgMatch) return null;
      var cfg = JSON.parse(cfgMatch[1]);
      if (!cfg.playerUrl) return null;

      var playerUrl = new URL(cfg.playerUrl, src1).toString();
      var r3 = await ctvHttpRequest(playerUrl, { referer: src1 });
      if (!r3.body) return null;
      var confMatch = r3.body.match(/window\.CONFIG\s*=\s*(\{[\s\S]*?\});/);
      if (!confMatch) return null;
      var conf = JSON.parse(confMatch[1]);

      var metaUrl = conf.metaApi || (conf.streamBase ? conf.streamBase + '&season=' + (season || 1) + '&episode=' + (episode || 1) : '');
      var streamHost = null;
      var metaImdb = conf.imdb || imdbId || '';
      if (metaUrl) {
        try {
          var rMeta = await ctvHttpRequest(metaUrl, { referer: playerUrl });
          if (rMeta.body) {
            var jMeta = JSON.parse(rMeta.body);
            if (jMeta && jMeta.data) {
              streamHost = jMeta.data.stream_urls_api_host || null;
              if (jMeta.data.imdb_id) metaImdb = jMeta.data.imdb_id;
            }
          }
        } catch (e) {}
      }

      var baseStreamApi = conf.api || (conf.streamBase + '&season=' + (conf.season || season || 1) + '&episode=' + (conf.episode || episode || 1) + '&stream_urls');
      var streamApi = baseStreamApi + (baseStreamApi.indexOf('?') >= 0 ? '&' : '?') + 'api_token=' + encodeURIComponent(conf.apiToken || '');
      if (streamHost) {
        try {
          var uHost = new URL(streamApi);
          uHost.host = streamHost;
          streamApi = uHost.toString();
        } catch (e) {}
      }

      var rStream = await ctvHttpRequest(streamApi, { referer: playerUrl });
      if (!rStream.body) return null;
      var jStream = JSON.parse(rStream.body);
      if (!jStream || !jStream.data) return null;

      var streamList = jStream.data.stream_urls;
      if (typeof streamList === 'string' && jStream.vs) {
        var wasmBytes = null;
        if (jStream.vs.wasm_url) {
          var rWasm = await fetch(jStream.vs.wasm_url);
          wasmBytes = await rWasm.arrayBuffer();
        } else if (jStream.vs.wasm) {
          var bStr = atob(jStream.vs.wasm);
          var u8 = new Uint8Array(bStr.length);
          for (var i = 0; i < bStr.length; i++) u8[i] = bStr.charCodeAt(i);
          wasmBytes = u8.buffer;
        }
        if (wasmBytes && window.WebAssembly) {
          var wasmMod = await WebAssembly.instantiate(wasmBytes, {});
          var ex = wasmMod.instance.exports;
          var bEnc = atob(streamList);
          var encBytes = new Uint8Array(bEnc.length);
          for (var k = 0; k < bEnc.length; k++) encBytes[k] = bEnc.charCodeAt(k);
          var ptr = ex.alloc(encBytes.length);
          new Uint8Array(ex.memory.buffer, ptr, encBytes.length).set(encBytes);
          var outLen = ex.decrypt(ptr, encBytes.length);
          var decStr = new TextDecoder().decode(new Uint8Array(ex.memory.buffer, ptr + 12, outLen));
          streamList = decStr.split('\n').filter(Boolean);
        }
      }

      if (!Array.isArray(streamList) || !streamList.length) return null;
      var chosenStream = streamList[0];
      var streamOrigin = new URL(chosenStream).origin;

      try {
        var rTok = await ctvHttpRequest(streamOrigin + '/generate.php?api_token=' + encodeURIComponent(conf.apiToken || ''), { referer: playerUrl });
        if (rTok.body) {
          var tokText = rTok.body.trim();
          try {
            var tokJson = JSON.parse(tokText);
            tokText = typeof tokJson === 'string' ? tokJson : (tokJson.token || tokJson.data || '');
          } catch (e) {}
          if (tokText) {
            if (chosenStream.indexOf('__TOKEN__') >= 0) {
              chosenStream = chosenStream.split('__TOKEN__').join(tokText);
            } else {
              chosenStream += (chosenStream.indexOf('?') >= 0 ? '&' : '?') + 'token=' + tokText;
            }
          }
        }
      } catch (e) {}

      var tracks = [];
      if (metaImdb) {
        try {
          var rawImdb = metaImdb.replace(/^tt/i, '');
          var osUrl = 'https://rest.opensubtitles.org/search/imdbid-' + rawImdb;
          if (isTv && season && episode) {
            osUrl += '/season-' + season + '/episode-' + episode;
          }
          osUrl += '/sublanguageid-spa';
          var rOs = await fetch(osUrl, { headers: { 'X-User-Agent': 'trailers.to-UA' } });
          if (rOs.ok) {
            var osList = await rOs.json();
            if (Array.isArray(osList)) {
              osList.slice(0, 3).forEach(function (sub, idx) {
                if (sub && sub.SubDownloadLink) {
                  tracks.push({
                    url: sub.SubDownloadLink,
                    label: (sub.LanguageName || 'Español') + (idx > 0 ? ' (' + (idx + 1) + ')' : ''),
                    default: idx === 0,
                    isGz: true
                  });
                }
              });
            }
          }
        } catch (e) {}
      }

      return { url: chosenStream, type: 'hls', tracks: tracks };
    } catch (err) {
      return null;
    }
  }

  async function extractDirectStream(rawUrl) {
    try {
      var parsed = new URL(rawUrl);
      var host = parsed.hostname.toLowerCase();

      // Caso 0A: AGENDA DEPORTIVA (TVF90 / TV-90 / Eventos en vivo)
      if (
        host.indexOf('tvf90.com') >= 0 ||
        host.indexOf('tv-90.com') >= 0 ||
        host.indexOf('streamtp') >= 0 ||
        host.indexOf('la12hd') >= 0 ||
        host.indexOf('la14hd') >= 0 ||
        host.indexOf('pelotalibre') >= 0 ||
        rawUrl.indexOf('eventos.html?r=') >= 0
      ) {
        var tvfRes = await extractTvf90(rawUrl);
        if (tvfRes) return tvfRes;
      }

      // Caso 0B: VIMEUS / VIMEOS (Servidor principal en Latino HD sin anuncios)
      if (host.indexOf('vimeus') >= 0) {
        var vimPage = await ctvHttpRequest(rawUrl, { referer: 'https://pelisjuanita.com/' });
        if (vimPage.body) {
          var dataTag = vimPage.body.match(/<script[^>]*id=["']data["'][^>]*>([\s\S]*?)<\/script>/i);
          if (dataTag && dataTag[1]) {
            try {
              var vimData = JSON.parse(dataTag[1].trim());
              if (vimData && Array.isArray(vimData.embeds) && vimData.embeds[0] && vimData.embeds[0].url) {
                rawUrl = vimData.embeds[0].url;
                parsed = new URL(rawUrl);
                host = parsed.hostname.toLowerCase();
              }
            } catch (e) {}
          }
        }
      }

      // Caso A: VIDARA / VIDARAA (API POST /api/stream con fallback automático a mobile si desktop/tv falla)
      if (host.indexOf('vidara') >= 0 && parsed.pathname.indexOf('/e/') === 0) {
        var fcode = parsed.pathname.split('/').filter(Boolean).pop();
        if (fcode) {
          var vidaraPayloads = [
            {
              filecode: fcode,
              device: window.ctvIsDesktopProxyAvailable() ? 'desktop' : 'tv',
              codecs: ['avc1.640033', 'avc1.64002a', 'avc1.640028']
            },
            {
              filecode: fcode,
              device: 'mobile',
              codecs: ['avc1.640028']
            }
          ];
          for (var vpIdx = 0; vpIdx < vidaraPayloads.length; vpIdx++) {
            try {
              var apiRes = await ctvHttpRequest(parsed.origin + '/api/stream', {
                method: 'POST',
                referer: rawUrl,
                contentType: 'application/json',
                body: JSON.stringify(vidaraPayloads[vpIdx])
              });
              if (apiRes && apiRes.body) {
                var vj = JSON.parse(apiRes.body);
                if (vj && vj.streaming_url) {
                  var vSubs = [];
                  if (Array.isArray(vj.subtitles)) {
                    vj.subtitles.forEach(function (st) {
                      if (st && st.file_path) {
                        vSubs.push({
                          url: st.file_path,
                          label: st.language || 'Subtítulo',
                          default: String(st.language || '').toLowerCase().indexOf('esp') >= 0
                        });
                      }
                    });
                  }
                  return { url: vj.streaming_url, type: 'hls', tracks: vSubs };
                }
              }
            } catch (e) {}
          }
        }
      }

      // Caso C: HGLINK -> VIBUXER mirror / VIDHIDE -> CALLISTANISE mirror
      var targetUrl = rawUrl;
      if (host.indexOf('hglink.to') >= 0) {
        targetUrl = 'https://vibuxer.com' + parsed.pathname + parsed.search;
      } else if (host.indexOf('vidhide') >= 0) {
        targetUrl = 'https://callistanise.com' + parsed.pathname + parsed.search;
      }

      var pageRes = await ctvHttpRequest(targetUrl, {
        referer: host.indexOf('vimeos') >= 0 ? 'https://vimeus.net/' : 'https://pelisjuanita.com/'
      });
      if (!pageRes.body) return null;
      var html = pageRes.body;
      var pageCookies = pageRes.cookies || '';

      // Seguir redirección JS (ej. voe.sx -> arianathankspecial.com)
      var jsRedir = html.match(/window\.location\.href\s*=\s*['"](https?:\/\/[^'"]+)['"]/i);
      if (jsRedir && jsRedir[1] && html.length < 3000) {
        var secondRes = await ctvHttpRequest(jsRedir[1], { referer: targetUrl, cookie: pageCookies });
        if (secondRes.body) {
          html = secondRes.body;
          targetUrl = jsRedir[1];
          if (secondRes.cookies) pageCookies = secondRes.cookies;
        }
      }

      // Resolver verificación Altcha de VOE automáticamente en segundo plano
      if (html.indexOf('altcha-widget') >= 0) {
        var solvedHtml = await solveVoeAltcha(html, targetUrl, pageCookies);
        if (solvedHtml) html = solvedHtml;
      }

      // Caso D: VOE JSON obfuscation
      var voeData = decodeVoeJson(html);
      if (voeData && voeData.source) {
        var voeTracks = [];
        if (Array.isArray(voeData.captions)) {
          voeData.captions.forEach(function (c) {
            if (c && c.file) {
              voeTracks.push({
                url: c.file,
                label: c.label || c.language || 'Subtítulo',
                default: String(c.label || '').toLowerCase().indexOf('esp') >= 0
              });
            }
          });
        }
        return { url: voeData.source, type: 'hls', tracks: voeTracks };
      }

      // Caso E: SERIESPLAYER / PELISPLAYER / VIMEOS / PACKER (StreamHG, Vibuxer, Morencius, Callistanise, Lulustream, MixDrop)
      var unpacked = unpackPacker(html).replace(/\\\//g, '/');

      // Extraer subtítulos de JWPlayer tracks: [...]
      var tracks = [];
      var tracksMatch = unpacked.match(/tracks\s*:\s*(\[\s*\{[\s\S]*?\}\s*\])/);
      if (tracksMatch) {
        try {
          var rawTracks = JSON.parse(tracksMatch[1]);
          if (Array.isArray(rawTracks)) {
            rawTracks.forEach(function (t) {
              if (t && t.file && t.file.indexOf('empty.srt') < 0 && (!t.kind || t.kind === 'subtitles' || t.kind === 'captions')) {
                var fUrl = t.file;
                if (fUrl.indexOf('http') === 0) {
                  tracks.push({
                    url: fUrl,
                    label: t.label || 'Subtítulo',
                    default: !!t.default || String(t.label || '').toLowerCase().indexOf('espa') >= 0 || String(t.label || '').toLowerCase().indexOf('span') >= 0
                  });
                }
              }
            });
          }
        } catch (e) {}
      }

      function scoreStreamCandidate(u, ctx) {
        var s = String(u || '').toLowerCase();
        var c = String(ctx || '').toLowerCase();
        var score = 0;
        if (/master\.m3u8|index\.m3u8|playlist\.m3u8/.test(s)) score += 35;
        if (/2160|4k|uhd/.test(s) || /2160|4k|uhd/.test(c)) score += 50;
        else if (/1080|fhd|fullhd|[_.-]x\.m3u8|[_.-]h\.m3u8/.test(s) || /1080|fhd/.test(c)) score += 40;
        else if (/720|[_.-]hd|[_.-]n\.m3u8/.test(s) || /720|\bhd\b/.test(c)) score += 25;
        else if (/480/.test(s) || /480/.test(c)) score += 10;
        else if (/360|240/.test(s) || /360|240/.test(c)) score -= 15;
        return score;
      }

      var m3u8Re = /(?:https?:)?\/\/[^\s"'<>\\]+\.m3u8[^\s"'<>\\]*/gi;
      var m3u8Best = '';
      var m3u8BestScore = -999;
      var mMatch;
      while ((mMatch = m3u8Re.exec(unpacked)) !== null) {
        var candM = mMatch[0];
        if (candM.indexOf('//') === 0) candM = 'https:' + candM;
        var ctxM = unpacked.slice(Math.max(0, mMatch.index - 80), Math.min(unpacked.length, mMatch.index + candM.length + 80));
        var scM = scoreStreamCandidate(candM, ctxM);
        if (!m3u8Best || scM > m3u8BestScore) {
          m3u8Best = candM;
          m3u8BestScore = scM;
        }
      }
      if (m3u8Best) {
        return { url: m3u8Best, type: 'hls', tracks: tracks };
      }

      // MixDrop / MP4 directo (priorizando el candidato de mayor resolución)
      var mp4Re = /(?:https?:)?\/\/[^\s"'<>\\]+\.mp4\?[^\s"'<>\\]*/gi;
      var mp4Best = '';
      var mp4BestScore = -999;
      var pMatch;
      while ((pMatch = mp4Re.exec(unpacked)) !== null) {
        var candP = pMatch[0];
        if (candP.indexOf('bigbuckbunny') >= 0) continue;
        if (candP.indexOf('//') === 0) candP = 'https:' + candP;
        var ctxP = unpacked.slice(Math.max(0, pMatch.index - 80), Math.min(unpacked.length, pMatch.index + candP.length + 80));
        var scP = scoreStreamCandidate(candP, ctxP);
        if (!mp4Best || scP > mp4BestScore) {
          mp4Best = candP;
          mp4BestScore = scP;
        }
      }
      if (mp4Best) {
        return { url: mp4Best, type: 'mp4', tracks: tracks };
      }

      // Fallback limpio con HTML desinfectado (sin anuncios ni popups)
      if (html.indexOf('<html') >= 0 && html.length > 1000) {
        return { url: targetUrl, type: 'srcdoc', html: sanitizeEmbedHtml(html, targetUrl), tracks: [] };
      }
    } catch (e) {
      console.warn('Error extrayendo stream directo:', e);
    }
    return null;
  }
  window.__ctvExtractDirectStream = extractDirectStream;

  function applySubtitleSelection(index, persistPref) {
    var video = document.getElementById('player-video');
    if (!video || !video.textTracks) return;
    selectedSubIndex = index;
    for (var i = 0; i < video.textTracks.length; i++) {
      video.textTracks[i].mode = i === index ? 'showing' : 'disabled';
    }
    var subBtn = document.getElementById('player-subs');
    if (subBtn) {
      if (index >= 0 && currentSubTracks[index]) {
        subBtn.textContent = '💬 ' + currentSubTracks[index].label;
      } else {
        subBtn.textContent = '💬 Subtítulos (Off)';
      }
    }
    if (persistPref !== false && typeof window.ctvSaveUserPrefs === 'function') {
      window.ctvSaveUserPrefs({ subtitlesEnabled: index >= 0 });
    }
  }

  function showSubtitlesModal() {
    var old = document.getElementById('ctv-subs-modal');
    if (old) { old.remove(); return; }

    var modal = document.createElement('div');
    modal.id = 'ctv-subs-modal';
    modal.className = 'modal';
    modal.style.zIndex = '99999';

    var html =
      '<div class="dialog" style="max-width:420px">' +
      '<div class="dialog-head"><h3>💬 Subtítulos</h3><button class="btn focusable" id="ctv-subs-close" tabindex="0">✕</button></div>' +
      '<div class="server-list" id="ctv-subs-list" style="max-height:55vh;overflow-y:auto"></div>' +
      '</div>';
    modal.innerHTML = html;
    document.body.appendChild(modal);

    var listEl = modal.querySelector('#ctv-subs-list');

    var offBtn = document.createElement('button');
    offBtn.className = 'focusable';
    offBtn.tabIndex = 0;
    offBtn.innerHTML = '<span>' + (selectedSubIndex < 0 ? '✔ ' : '') + 'Desactivados</span>';
    offBtn.onclick = function () {
      applySubtitleSelection(-1);
      modal.remove();
    };
    listEl.appendChild(offBtn);

    currentSubTracks.forEach(function (tr, i) {
      var b = document.createElement('button');
      b.className = 'focusable';
      b.tabIndex = 0;
      b.innerHTML = '<span>' + (selectedSubIndex === i ? '✔ ' : '') + tr.label + '</span>';
      b.onclick = function () {
        applySubtitleSelection(i);
        modal.remove();
      };
      listEl.appendChild(b);
    });

    modal.querySelector('#ctv-subs-close').onclick = function () { modal.remove(); };
    modal.addEventListener('click', function (e) { if (e.target === modal) modal.remove(); });
  }

  async function attachSubtitlesToVideo(tracks) {
    cleanupSubs();
    if (!Array.isArray(tracks) || !tracks.length) return;
    var video = document.getElementById('player-video');
    if (!video) return;

    // Ordenar poniendo Español primero
    var sorted = tracks.slice().sort(function (a, b) {
      var aEs = /espa|spanish|latino|castellano/i.test(a.label || '') ? 0 : 1;
      var bEs = /espa|spanish|latino|castellano/i.test(b.label || '') ? 0 : 1;
      return aEs - bEs;
    });

    var defaultIdx = -1;
    for (var i = 0; i < sorted.length; i++) {
      var t = sorted[i];
      try {
        var subText = '';
        if (t.isGz && typeof DecompressionStream !== 'undefined') {
          var gzResp = await fetch(t.url);
          if (gzResp.ok && gzResp.body) {
            var decompressed = gzResp.body.pipeThrough(new DecompressionStream('gzip'));
            subText = await new Response(decompressed).text();
          }
        } else {
          var res = await ctvHttpRequest(t.url, { referer: 'https://pelisjuanita.com/' });
          if (res.body && res.body.length >= 10) {
            subText = res.body;
          }
        }
        if (!subText || subText.length < 10) continue;
        var vttText = srtToVtt(subText);
        var blob = new Blob([vttText], { type: 'text/vtt;charset=utf-8' });
        var blobUrl = URL.createObjectURL(blob);
        activeBlobUrls.push(blobUrl);

        var trackIdx = currentSubTracks.length;
        currentSubTracks.push({ label: t.label || ('Subtítulo ' + (trackIdx + 1)), blobUrl: blobUrl });

        var trackEl = document.createElement('track');
        trackEl.kind = 'subtitles';
        trackEl.label = t.label || ('Subtítulo ' + (trackIdx + 1));
        trackEl.srclang = /espa|spanish/i.test(t.label || '') ? 'es' : 'en';
        trackEl.src = blobUrl;
        if (defaultIdx < 0 && (t.default || /espa|spanish/i.test(t.label || ''))) {
          defaultIdx = trackIdx;
          trackEl.default = true;
        }
        video.appendChild(trackEl);
      } catch (e) {}
    }

    if (currentSubTracks.length > 0) {
      if (defaultIdx < 0) defaultIdx = 0;
      var subBtn = document.getElementById('player-subs');
      if (subBtn) {
        subBtn.classList.remove('hidden');
        subBtn.onclick = function (e) {
          e.stopPropagation();
          showSubtitlesModal();
        };
      }
      var subsWanted = typeof window.ctvGetUserPrefs === 'function' ? window.ctvGetUserPrefs().subtitlesEnabled : true;
      var subApplyTimer = setTimeout(function () {
        applySubtitleSelection(subsWanted ? defaultIdx : -1, false);
      }, 400);
      registerPlaybackCleanup(function () { clearTimeout(subApplyTimer); });
    }
  }

  function isExtractableServer(url) {
    if (!url) return false;
    var l = String(url).toLowerCase();
    if (
      l.indexOf('vsembed.') >= 0 ||
      l.indexOf('vidsrc.') >= 0 ||
      l.indexOf('vidlink.') >= 0 ||
      l.indexOf('multiembed.') >= 0 ||
      l.indexOf('2embed.') >= 0 ||
      l.indexOf('nontongo.') >= 0 ||
      l.indexOf('bysesukior.') >= 0
    ) {
      return false;
    }
    return true;
  }

  function ctvConfigureIframeSandbox(iframeEl, targetUrl, isSrcDoc) {
    if (!iframeEl) return;
    if (isSrcDoc) {
      iframeEl.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-presentation');
      return;
    }
    var u = String(targetUrl || '').toLowerCase();
    var antiSandboxDomains = [
      'vimeus', 'vimeos', 'pelisjuanita', 'morencius', 'vidara',
      'vidsrc', 'vsembed', 'vidlink', 'multiembed', '2embed', 'nontongo',
      'cloudnestra', 'streamwish', 'hlswish', 'wishembed', 'lulustream', 'luluvdo',
      'vibuxer', 'hglink', 'callistanise', 'vidhide', 'mixdrop',
      'tvf90', 'tv-90', 'ftlly', 'streamtp', 'pelotalibre', 'la12hd', 'la14hd'
    ];
    var isElectron = Boolean(window.DesktopBridge || /Electron/i.test(navigator.userAgent || '') || window.ctvIsDesktopProxyAvailable());
    var needsNoSandbox = isElectron || antiSandboxDomains.some(function (d) { return u.indexOf(d) !== -1; });
    if (needsNoSandbox) {
      iframeEl.removeAttribute('sandbox');
    } else {
      iframeEl.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-presentation');
    }
  }

  function focusNextServerAfterClose() {
    var currentBtn = window.__ctvLastServerBtn;
    if (typeof window.__ctvClosePlayer === 'function') window.__ctvClosePlayer();
    setTimeout(function () {
      try {
        var scope = (currentBtn && currentBtn.closest && currentBtn.closest('.agenda-embeds, #detail-servers, #serie-servers-wrap, .server-list')) ||
          document.querySelector('#serie-servers-wrap .server-list, #detail-servers, .agenda-embeds');
        if (!scope) return;
        var btns = Array.prototype.slice.call(scope.querySelectorAll('button'));
        if (!btns.length) return;
        var idx = currentBtn ? btns.indexOf(currentBtn) : -1;
        var nextBtn = btns[idx + 1] || btns[0];
        if (nextBtn && nextBtn.focus) {
          nextBtn.focus();
          try { nextBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (e) {}
        }
      } catch (e) {}
    }, 90);
  }

  function findNextFallbackServer(triedSet) {
    var list = Array.isArray(window.__ctvActiveServerList) ? window.__ctvActiveServerList : [];
    for (var i = 0; i < list.length; i++) {
      var cand = list[i];
      if (cand && cand.url && !triedSet.has(cand.url)) return cand;
    }
    return null;
  }

  function openInCleanIframe(rawUrl, title, onErrorCb) {
    cleanupActivePlayback();
    cleanupSubs();
    removeAgendaStatusOverlay();
    if (typeof window.__ctvOpenModal === 'function') {
      window.__ctvOpenModal(title);
    } else {
      var modal = document.getElementById('player-modal');
      var pTitle = document.getElementById('player-title');
      var pVideo = document.getElementById('player-video');
      if (pTitle) pTitle.textContent = title || '';
      if (pVideo) {
        pVideo.pause();
        pVideo.removeAttribute('src');
        pVideo.classList.add('hidden');
      }
      if (modal) modal.classList.remove('hidden');
    }
    var mBtnIf = ensureImageModeButton();
    if (mBtnIf) {
      applyImageMode(null, false);
      mBtnIf.classList.remove('hidden');
    }
    if (typeof window.ctvUpdateFavButtonsUI === 'function') {
      window.ctvUpdateFavButtonsUI();
    }
    showPlayerLoader('Cargando servidor…');
    var f = document.getElementById('player-frame');
    if (f) {
      ctvConfigureIframeSandbox(f, rawUrl, false);
      f.removeAttribute('referrerpolicy');
      try { f.removeAttribute('srcdoc'); } catch (e) {}
      f.classList.remove('hidden');
      var loaderDone = false;
      var doneLoader = function () {
        if (loaderDone) return;
        loaderDone = true;
        removePlayerLoader();
      };
      var onLoad = function () { doneLoader(); };
      var onErr = function () {
        doneLoader();
        if (typeof onErrorCb === 'function') onErrorCb();
      };
      f.addEventListener('load', onLoad, { once: true });
      f.addEventListener('error', onErr, { once: true });
      var safeHideTimer = setTimeout(doneLoader, 5000);
      registerPlaybackCleanup(function () {
        clearTimeout(safeHideTimer);
        try { f.removeEventListener('load', onLoad); } catch (e) {}
        try { f.removeEventListener('error', onErr); } catch (e) {}
      });
      f.src = rawUrl;
      var backBtn = document.getElementById('player-back');
      if (backBtn && backBtn.focus) backBtn.focus();
      else f.focus();
    } else {
      removePlayerLoader();
    }
  }

  function showAgendaStatusOverlay(title, subtitle, onRetry, opts) {
    opts = opts || {};
    cleanupActivePlayback();
    removePlayerLoader();
    cleanupSubs();
    removeAgendaStatusOverlay();
    var modal = document.getElementById('player-modal');
    if (!modal) return;
    if (typeof window.__ctvOpenModal === 'function') {
      window.__ctvOpenModal(title || 'Reproducción');
    }
    var pf = document.getElementById('player-frame');
    var pv = document.getElementById('player-video');
    if (pf) { pf.classList.add('hidden'); pf.src = ''; }
    if (pv) { try { pv.pause(); } catch (e) {} pv.classList.add('hidden'); }

    var isSports = opts.isSports !== false;
    var icon = opts.icon || (isSports ? '⚽' : '📡');
    var heading = opts.heading || (isSports ? 'Señal temporalmente no disponible' : 'No se pudo cargar este servidor');
    var backLabel = opts.backLabel || (isSports ? '◀ Volver a la Agenda' : '◀ Volver');
    var showSwitch = opts.showSwitch !== false;

    var box = document.createElement('div');
    box.id = 'ctv-agenda-status';
    box.style.cssText = 'position:absolute;inset:0;z-index:15;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:24px;text-align:center;background:radial-gradient(circle at center,#181926 0%,#08090e 100%);color:#fff';
    box.innerHTML =
      '<div style="font-size:2.6rem">' + icon + '</div>' +
      '<h3 style="font-size:1.2rem;font-weight:800;max-width:460px;margin:0">' + heading + '</h3>' +
      '<p style="font-size:.92rem;color:#b8c0d4;max-width:460px;line-height:1.45;margin:0">' + (subtitle || 'El servidor está saturado o no respondió a tiempo. Puedes reintentar o elegir otro servidor.') + '</p>' +
      '<div class="ctv-as-actions" style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center;margin-top:6px">' +
      '<button id="ctv-agenda-retry" class="btn focusable" tabindex="0" style="background:var(--red,#b04cf2);border-color:#fff;color:#fff;font-weight:700;padding:10px 20px">🔄 Reintentar</button>' +
      (showSwitch ? '<button id="ctv-agenda-switch" class="btn focusable" tabindex="0" style="padding:10px 20px">🔀 Cambiar servidor</button>' : '') +
      '<button id="ctv-agenda-back" class="btn focusable" tabindex="0" style="padding:10px 20px">' + backLabel + '</button>' +
      '</div>';
    modal.appendChild(box);

    var retryBtn = box.querySelector('#ctv-agenda-retry');
    var switchBtn = box.querySelector('#ctv-agenda-switch');
    var backBtn = box.querySelector('#ctv-agenda-back');
    if (retryBtn) {
      retryBtn.onclick = function (ev) {
        ev.stopPropagation();
        removeAgendaStatusOverlay();
        if (typeof onRetry === 'function') onRetry();
      };
    }
    if (switchBtn) {
      switchBtn.onclick = function (ev) {
        ev.stopPropagation();
        if (typeof opts.onSwitch === 'function') {
          removeAgendaStatusOverlay();
          opts.onSwitch();
        } else {
          focusNextServerAfterClose();
        }
      };
    }
    if (backBtn) {
      backBtn.onclick = function (ev) {
        ev.stopPropagation();
        if (typeof window.__ctvClosePlayer === 'function') window.__ctvClosePlayer();
      };
    }
    var pBar = document.getElementById('player-bar');
    if (pBar) { pBar.classList.remove('hidden'); pBar.style.opacity = '1'; }
    setTimeout(function () {
      if (retryBtn && retryBtn.focus) retryBtn.focus();
    }, 40);
  }

  window.ctvPlaySmartEmbed = function (url, title, serverName, slugOrType, resumeKey, failoverState) {
    cleanupActivePlayback();
    window.__ctvPlaySessionId = (window.__ctvPlaySessionId || 0) + 1;
    var currentPlaySession = window.__ctvPlaySessionId;

    var rawUrl = String(url || '');
    if (!rawUrl || rawUrl.indexOf('youtube.com/embed') >= 0) return false;

    var isAgendaSports = (
      slugOrType === 'agenda-deportiva' ||
      /tvf90\.com|tv-90\.com|eventos\.html\?r=|ftlly\.com|streamtp|pelotalibre|la12hd|la14hd|futbollibre/i.test(rawUrl)
    );

    if (!failoverState) {
      if (document.activeElement && document.activeElement !== document.body) {
        window.__ctvLastServerBtn = document.activeElement;
      }
      failoverState = {
        tried: new Set([rawUrl]),
        hop: 0,
        originalUrl: rawUrl,
        originalTitle: String(title || 'Reproduciendo'),
        originalServer: String(serverName || '')
      };
    } else {
      failoverState.tried.add(rawUrl);
    }

    removeAgendaStatusOverlay();
    var pFavBtn = document.getElementById('player-fav');
    if (isAgendaSports) {
      window.__ctvCurrentItem = null;
      if (pFavBtn) pFavBtn.classList.add('hidden');
    } else if (pFavBtn) {
      pFavBtn.classList.remove('hidden');
    }

    var pFrameInit = document.getElementById('player-frame');
    if (pFrameInit) {
      ctvConfigureIframeSandbox(pFrameInit, rawUrl, false);
      pFrameInit.removeAttribute('referrerpolicy');
    }

    function markServerSuccess() {
      removePlayerLoader();
      if (!isAgendaSports && serverName && typeof window.ctvSaveUserPrefs === 'function') {
        window.ctvSaveUserPrefs({ preferredServer: String(serverName) });
      }
    }

    function attemptAutoFailoverOrError(reason) {
      if (window.__ctvPlaySessionId !== currentPlaySession) return;
      var modal = document.getElementById('player-modal');
      if (!modal || modal.classList.contains('hidden')) return;

      if (isAgendaSports) {
        showAgendaStatusOverlay(
          title || 'Agenda deportiva',
          'El partido aún no comienza, ya terminó o el servidor está ocupado. Puedes reintentar o elegir otra opción (OP2 / OP3 / HD).',
          function () {
            window.ctvPlaySmartEmbed(failoverState.originalUrl, failoverState.originalTitle, failoverState.originalServer, slugOrType, resumeKey);
          },
          { isSports: true, showSwitch: true }
        );
        return;
      }

      var nextSrv = failoverState.hop < 3 ? findNextFallbackServer(failoverState.tried) : null;
      if (nextSrv) {
        failoverState.hop += 1;
        failoverState.tried.add(nextSrv.url);
        var curLabel = serverName || 'El servidor actual';
        var nextTitle = nextSrv.baseTitle ? (nextSrv.baseTitle + ' · ' + nextSrv.name) : ((title || '').split(' · ')[0] + ' · ' + nextSrv.name);
        if (typeof window.ctvShowToast === 'function') {
          window.ctvShowToast('⚡ ' + curLabel + ' no respondió · cambiando a ' + nextSrv.name + '…');
        }
        window.ctvPlaySmartEmbed(nextSrv.url, nextTitle, nextSrv.name, slugOrType, resumeKey, failoverState);
        return;
      }

      if (failoverState.hop === 0 && reason !== 'iframe-error' && isExtractableServer(rawUrl)) {
        openInCleanIframe(rawUrl, title, function () {
          attemptAutoFailoverOrError('iframe-error');
        });
        return;
      }

      showAgendaStatusOverlay(
        failoverState.originalTitle || title || 'Reproducción',
        'Los servidores disponibles están saturados o sin respuesta en este momento. Puedes reintentar o seleccionar otro servidor manualmente.',
        function () {
          window.ctvPlaySmartEmbed(failoverState.originalUrl, failoverState.originalTitle, failoverState.originalServer, slugOrType, resumeKey);
        },
        { isSports: false, showSwitch: true }
      );
    }

    if (!isExtractableServer(rawUrl)) {
      openInCleanIframe(rawUrl, title, function () {
        attemptAutoFailoverOrError('iframe-error');
      });
      if (!isAgendaSports && serverName && typeof window.ctvSaveUserPrefs === 'function') {
        window.ctvSaveUserPrefs({ preferredServer: String(serverName) });
      }
      return true;
    }

    // Abrir modal en estado de carga limpia y extraer el stream directo sin anuncios
    if (typeof window.__ctvOpenModal === 'function') {
      window.__ctvOpenModal((title || 'Reproduciendo') + ' · Conectando…');
    }
    var mBtnPlay = ensureImageModeButton();
    if (mBtnPlay) {
      applyImageMode(null, false);
      mBtnPlay.classList.remove('hidden');
    }
    showPlayerLoader(
      failoverState.hop > 0
        ? ('Cambiando a ' + (serverName || 'servidor alternativo') + '…')
        : ('Conectando con ' + (serverName || 'el servidor') + '…')
    );
    if (!isAgendaSports && typeof window.ctvUpdateFavButtonsUI === 'function') {
      window.ctvUpdateFavButtonsUI();
    }

    var didFallback = false;
    var agendaRetries = 0;

    function fallbackToNext(reason) {
      if (window.__ctvPlaySessionId !== currentPlaySession) return;
      if (didFallback) return;
      didFallback = true;
      attemptAutoFailoverOrError(reason);
    }

    function playResolvedResult(res) {
      if (window.__ctvPlaySessionId !== currentPlaySession) return;
      if (didFallback) return;
      var modal = document.getElementById('player-modal');
      if (!modal || modal.classList.contains('hidden')) return;

      if (res && res.type === 'dash' && res.url) {
        if (window.AndroidBridge && typeof window.AndroidBridge.playChannelFull === 'function') {
          try {
            removePlayerLoader();
            if (typeof window.__ctvClosePlayer === 'function') window.__ctvClosePlayer();
            window.AndroidBridge.playChannelFull(title || 'Agenda Deportiva', res.url, '', res.keyId || '', res.key || '', '');
            return;
          } catch (e) {}
        }
        if (typeof window.__ctvPlayDash === 'function') {
          try {
            window.__ctvPlayDash(res.url, res.keyId || '', res.key || '', title || 'Agenda Deportiva');
            markServerSuccess();
            if (!isAgendaSports && typeof window.ctvUpdateFavButtonsUI === 'function') window.ctvUpdateFavButtonsUI();
            return;
          } catch (e) {}
        }
        fallbackToNext('dash-error');
        return;
      }

      if (res && res.type === 'hls' && res.url) {
        if ((isAgendaSports || res.isLive) && window.AndroidBridge && typeof window.AndroidBridge.playChannelFull === 'function') {
          try {
            removePlayerLoader();
            if (typeof window.__ctvClosePlayer === 'function') window.__ctvClosePlayer();
            window.AndroidBridge.playChannelFull(title || 'Agenda Deportiva', '', res.url, '', '', '');
            return;
          } catch (e) {}
        }

        if (typeof window.__ctvPlayHls === 'function') {
          var handleHlsFailure = function () {
            if (window.__ctvPlaySessionId !== currentPlaySession) return;
            if (isAgendaSports && agendaRetries < 1) {
              agendaRetries++;
              showPlayerLoader('Reintentando con otro nodo…');
              extractDirectStream(rawUrl).then(function (retryRes) {
                if (window.__ctvPlaySessionId !== currentPlaySession) return;
                if (retryRes && retryRes.url && retryRes.url !== res.url) {
                  playResolvedResult(retryRes);
                } else {
                  fallbackToNext('hls-retry-empty');
                }
              }).catch(function () { fallbackToNext('hls-retry-error'); });
              return;
            }
            fallbackToNext('hls-error');
          };

          window.__ctvPlayHls(res.url, title, handleHlsFailure);
          if (!isAgendaSports && typeof window.ctvUpdateFavButtonsUI === 'function') window.ctvUpdateFavButtonsUI();
          var vHls = document.getElementById('player-video');
          if (vHls) {
            var started = false;
            var stallTimer = null;
            var onPlaying = function () {
              started = true;
              if (stallTimer) { clearTimeout(stallTimer); stallTimer = null; }
              vHls.removeEventListener('playing', onPlaying);
              vHls.removeEventListener('loadeddata', onPlaying);
              markServerSuccess();
            };
            vHls.addEventListener('playing', onPlaying);
            vHls.addEventListener('loadeddata', onPlaying);
            vHls.onerror = function () {
              vHls.onerror = null;
              if (window.__ctvPlaySessionId !== currentPlaySession) return;
              if (stallTimer) { clearTimeout(stallTimer); stallTimer = null; }
              handleHlsFailure();
            };
            stallTimer = setTimeout(function () {
              if (window.__ctvPlaySessionId !== currentPlaySession) return;
              if (!started && !didFallback && vHls.readyState === 0 && !modal.classList.contains('hidden')) {
                handleHlsFailure();
              }
            }, 8500);
            registerPlaybackCleanup(function () {
              if (stallTimer) { clearTimeout(stallTimer); stallTimer = null; }
              try { vHls.removeEventListener('playing', onPlaying); } catch (e) {}
              try { vHls.removeEventListener('loadeddata', onPlaying); } catch (e) {}
            });
          } else {
            removePlayerLoader();
          }
          attachSubtitlesToVideo(res.tracks || []);
          return;
        }
      }

      if (res && res.type === 'mp4' && res.url) {
        if (typeof window.__ctvOpenModal === 'function') window.__ctvOpenModal(title);
        if (!isAgendaSports && typeof window.ctvUpdateFavButtonsUI === 'function') window.ctvUpdateFavButtonsUI();
        var v = document.getElementById('player-video');
        if (v) {
          v.classList.remove('hidden');
          var mp4Started = false;
          var mp4Stall = null;
          var onMp4Play = function () {
            mp4Started = true;
            if (mp4Stall) { clearTimeout(mp4Stall); mp4Stall = null; }
            v.removeEventListener('playing', onMp4Play);
            v.removeEventListener('loadeddata', onMp4Play);
            markServerSuccess();
          };
          v.addEventListener('playing', onMp4Play);
          v.addEventListener('loadeddata', onMp4Play);
          v.onerror = function () {
            v.onerror = null;
            if (window.__ctvPlaySessionId !== currentPlaySession) return;
            if (mp4Stall) { clearTimeout(mp4Stall); mp4Stall = null; }
            fallbackToNext('mp4-error');
          };
          mp4Stall = setTimeout(function () {
            if (window.__ctvPlaySessionId !== currentPlaySession) return;
            if (!mp4Started && !didFallback && v.readyState === 0 && !modal.classList.contains('hidden')) {
              fallbackToNext('mp4-stall');
            }
          }, 8500);
          registerPlaybackCleanup(function () {
            if (mp4Stall) { clearTimeout(mp4Stall); mp4Stall = null; }
            try { v.removeEventListener('playing', onMp4Play); } catch (e) {}
            try { v.removeEventListener('loadeddata', onMp4Play); } catch (e) {}
          });
          v.src = res.url;
          v.play().catch(function () {});
          v.focus();
          attachSubtitlesToVideo(res.tracks || []);
          return;
        }
      }

      if (res && res.type === 'srcdoc' && res.html) {
        if (typeof window.__ctvOpenModal === 'function') window.__ctvOpenModal(title);
        if (!isAgendaSports && typeof window.ctvUpdateFavButtonsUI === 'function') window.ctvUpdateFavButtonsUI();
        var f = document.getElementById('player-frame');
        if (f) {
          ctvConfigureIframeSandbox(f, '', true);
          f.removeAttribute('referrerpolicy');
          f.classList.remove('hidden');
          var srcdocHide = setTimeout(markServerSuccess, 2500);
          var onSrcdocLoad = function () { clearTimeout(srcdocHide); markServerSuccess(); };
          f.addEventListener('load', onSrcdocLoad, { once: true });
          registerPlaybackCleanup(function () {
            clearTimeout(srcdocHide);
            try { f.removeEventListener('load', onSrcdocLoad); } catch (e) {}
          });
          f.srcdoc = res.html;
          f.focus();
          return;
        }
      }

      if (res && res.type === 'iframe' && res.url && !isAgendaSports) {
        openInCleanIframe(res.url, title, function () { fallbackToNext('iframe-error'); });
        return;
      }

      fallbackToNext('empty-extract');
    }

    var timeoutId = setTimeout(function () {
      if (window.__ctvPlaySessionId !== currentPlaySession) return;
      fallbackToNext('extract-timeout');
    }, 9500);
    registerPlaybackCleanup(function () { clearTimeout(timeoutId); });

    extractDirectStream(rawUrl)
      .then(function (res) {
        clearTimeout(timeoutId);
        playResolvedResult(res);
      })
      .catch(function () {
        clearTimeout(timeoutId);
        if (window.__ctvPlaySessionId !== currentPlaySession) return;
        fallbackToNext('extract-error');
      });

    return true;
  };
})();

/* ============================================================================
 * CTV: COMPROBADOR MULTIPLATAFORMA NO BLOQUEANTE DE ACTUALIZACIONES (GITHUB)
 * Timeout estricto 5s (AbortController), manejo offline silencioso, caché TTL 6h
 * y notificación banner UX no intrusiva con progreso real de descarga.
 * ============================================================================ */
(function () {
  var GITHUB_LATEST_URL = 'https://api.github.com/repos/Demon11701/CTV-Desktop/releases/latest';
  var ALTSTORE_REPO_URL = 'https://raw.githubusercontent.com/Demon11701/CTV-Desktop/main/altstore-repo.json';
  var GH_CACHE_KEY = 'ctv_gh_release_cache_v1';
  var DISMISSED_TAG_KEY = 'ctv_dismissed_update_v1';
  var GH_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
  var latestReleaseData = null;

  function getAuthoritativeAppVersion() {
    if (window.DesktopBridge && typeof window.DesktopBridge.appVersion === 'string' && window.DesktopBridge.appVersion) {
      return window.DesktopBridge.appVersion;
    }
    if (detectPlatform() === 'android') {
      if (window.AndroidBridge && typeof window.AndroidBridge.getAppVersionName === 'function') {
        try {
          var androidVer = window.AndroidBridge.getAppVersionName();
          if (androidVer) return String(androidVer).trim();
        } catch (e) {}
      }
      return window.CTV_ANDROID_APK_VERSION || '1.6.0';
    }
    return window.CTV_APP_VERSION || '1.6.1';
  }
  window.ctvGetAuthoritativeAppVersion = getAuthoritativeAppVersion;

  function resolveEffectiveReleaseVersion(release, platform) {
    if (!release) return '';
    var plat = platform || detectPlatform();
    var fallbackTag = String(release.tag_name || release.name || '').trim();
    if (plat === 'android' && Array.isArray(release.assets)) {
      for (var i = 0; i < release.assets.length; i++) {
        var a = release.assets[i];
        if (!a) continue;
        var aName = String(a.name || '');
        var aUrl = String(a.browser_download_url || '');
        if (/\.apk(\?|$)/i.test(aName) || /\.apk(\?|$)/i.test(aUrl)) {
          var m = aName.match(/(\d+\.\d+\.\d+)/);
          if (!m && aUrl) {
            var urlFile = aUrl.split('?')[0].split('/').pop() || aUrl;
            m = urlFile.match(/(\d+\.\d+\.\d+)/) || aUrl.match(/(\d+\.\d+\.\d+)/);
          }
          if (m && m[1]) return m[1];
        }
      }
    }
    return fallbackTag;
  }
  window.ctvResolveEffectiveReleaseVersion = resolveEffectiveReleaseVersion;

  function ctvFetchWithTimeout(url, opts, timeoutMs) {
    var ms = timeoutMs || 5000;
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, ms) : null;
    var fetchOpts = Object.assign({}, opts || {});
    if (ctrl) fetchOpts.signal = ctrl.signal;
    var fn = window.__ctvTrueNativeFetch || window.fetch.bind(window);
    return fn(url, fetchOpts).finally(function () {
      if (timer) clearTimeout(timer);
    });
  }
  window.ctvFetchWithTimeout = ctvFetchWithTimeout;

  function parseSemver(v) {
    var base = String(v || '').trim().replace(/^[vV]+/, '').split(/[-+]/)[0];
    var parts = base.split('.').map(function (n) { return parseInt(n, 10) || 0; });
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
  window.ctvCompareSemver = compareSemver;

  function isNewerVersion(remoteVer, localVer) {
    return compareSemver(remoteVer, localVer) > 0;
  }

  function persistDismissedUpdateTag(tag) {
    if (!tag) return;
    try { sessionStorage.setItem('ctv_gh_update_postponed_' + tag, '1'); } catch (e) {}
    try { localStorage.setItem(DISMISSED_TAG_KEY, String(tag)); } catch (e) {}
    if (typeof window.ctvPersistDesktopState === 'function') {
      window.ctvPersistDesktopState({ dismissedUpdateTag: String(tag) });
    }
  }

  function isUpdateTagDismissed(tag) {
    if (!tag) return false;
    try {
      if (sessionStorage.getItem('ctv_gh_update_postponed_' + tag)) return true;
      if (localStorage.getItem(DISMISSED_TAG_KEY) === String(tag)) return true;
    } catch (e) {}
    return false;
  }

  function detectPlatform() {
    var ua = navigator.userAgent || '';
    var capPlatform = '';
    try {
      if (window.Capacitor && typeof window.Capacitor.getPlatform === 'function') {
        capPlatform = window.Capacitor.getPlatform();
      }
    } catch (e) {}

    if (
      capPlatform === 'ios' ||
      /iPhone|iPad|iPod/i.test(ua) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    ) {
      return 'ios';
    }
    if (
      capPlatform === 'android' ||
      (window.AndroidBridge && typeof window.AndroidBridge.playChannelFull === 'function')
    ) {
      return 'android';
    }
    if (/Windows/i.test(ua) || /Win32|Win64/i.test(navigator.platform || '')) {
      return 'windows';
    }
    return 'linux';
  }

  function findAssetUrl(assets, ext) {
    if (!Array.isArray(assets)) return '';
    var lower = ext.toLowerCase();
    for (var i = 0; i < assets.length; i++) {
      var a = assets[i];
      if (a && a.name && a.name.toLowerCase().endsWith(lower) && a.browser_download_url) {
        return a.browser_download_url;
      }
    }
    return '';
  }

  function clearUpdatePoll() {
    if (window.__ctvUpdatePollTimer) {
      clearInterval(window.__ctvUpdatePollTimer);
      window.__ctvUpdatePollTimer = null;
    }
  }

  function removeUpdateBanner() {
    try {
      var b = document.getElementById('ctv-update-banner');
      if (b && b.parentNode) b.remove();
    } catch (e) {}
  }

  function showGitHubUpdateModal(release) {
    removeUpdateBanner();
    var modal = document.getElementById('update-modal');
    if (!modal || !release) return;

    var tag = release.tag_name || release.name || '';
    var platform = detectPlatform();
    var assets = release.assets || [];

    var titleEl = document.getElementById('update-version-title');
    var changelogEl = document.getElementById('update-changelog');
    var progressWrap = document.getElementById('update-progress-container');
    var progressBar = document.getElementById('update-progress-bar');
    var progressPct = document.getElementById('update-progress-percent');
    var progressLbl = document.getElementById('update-progress-label');
    var btnInstall = document.getElementById('btn-update-install');
    var btnLater = document.getElementById('btn-update-later');

    if (titleEl) titleEl.textContent = 'CTV ' + tag;
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
        btnInstall.textContent = '⚡ Actualizar en SideStore';
      } else if (platform === 'android') {
        btnInstall.textContent = '⚡ Actualizar APK (' + tag + ')';
      } else if (platform === 'windows') {
        btnInstall.textContent = '⚡ Auto-actualizar .EXE (' + tag + ')';
      } else {
        btnInstall.textContent = '⚡ Auto-actualizar .AppImage (' + tag + ')';
      }

      function triggerDesktopAutoReplace(dlUrl) {
        if (!dlUrl) return;
        if (!window.ctvIsDesktopProxyAvailable()) {
          window.open(dlUrl, '_blank');
          return;
        }
        clearUpdatePoll();
        if (progressWrap) progressWrap.classList.remove('hidden');
        if (progressLbl) progressLbl.textContent = 'Descargando e instalando automáticamente…';
        btnInstall.disabled = true;

        var startPromise = (window.DesktopBridge && typeof window.DesktopBridge.startSelfUpdate === 'function')
          ? window.DesktopBridge.startSelfUpdate(dlUrl)
          : ctvFetchWithTimeout('/__ctv_self_update?url=' + encodeURIComponent(dlUrl), {}, 6000).then(function (r) { return r.json(); });

        var getStatus = function () {
          if (window.DesktopBridge && typeof window.DesktopBridge.getSelfUpdateStatus === 'function') {
            return window.DesktopBridge.getSelfUpdateStatus();
          }
          return ctvFetchWithTimeout('/__ctv_self_update_status', {}, 4000).then(function (r) { return r.json(); });
        };

        startPromise
          .then(function (res) {
            if (res && res.ok === false) throw new Error(res.error || 'update-rejected');
            window.__ctvUpdatePollTimer = setInterval(function () {
              getStatus()
                .then(function (st) {
                  if (!st) return;
                  var pct = st.percent || 0;
                  if (progressBar) progressBar.style.width = pct + '%';
                  if (progressPct) progressPct.textContent = pct + '%';
                  if (st.state === 'downloading') {
                    if (progressLbl) progressLbl.textContent = 'Descargando actualización… ' + pct + '%';
                  } else if (st.state === 'restarting') {
                    clearUpdatePoll();
                    if (progressLbl) progressLbl.textContent = '¡Actualización lista! Reiniciando CTV…';
                  } else if (st.state === 'error') {
                    clearUpdatePoll();
                    btnInstall.disabled = false;
                    if (progressLbl) progressLbl.textContent = 'Abriendo descarga directa…';
                    window.open(dlUrl, '_blank');
                  }
                })
                .catch(function () {});
            }, 450);
          })
          .catch(function () {
            clearUpdatePoll();
            btnInstall.disabled = false;
            window.open(dlUrl, '_blank');
          });
      }

      btnInstall.onclick = function () {
        if (platform === 'ios') {
          window.location.href = 'sidestore://source?url=' + encodeURIComponent(ALTSTORE_REPO_URL);
          setTimeout(function () {
            window.location.href = 'sidestore://';
          }, 600);
          return;
        }

        if (platform === 'android') {
          var apkUrl = findAssetUrl(assets, '.apk') || release.html_url;
          var bridge = window.AndroidBridge;
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
          if (apkUrl) window.open(apkUrl, '_blank');
          return;
        }

        if (platform === 'windows') {
          var exeUrl = findAssetUrl(assets, '.exe') || release.html_url;
          triggerDesktopAutoReplace(exeUrl);
          return;
        }

        var appImageUrl = findAssetUrl(assets, '.AppImage') || release.html_url;
        triggerDesktopAutoReplace(appImageUrl);
      };
    }

    if (btnLater) {
      btnLater.style.display = '';
      btnLater.onclick = function () {
        clearUpdatePoll();
        persistDismissedUpdateTag(tag);
        modal.classList.add('hidden');
      };
    }

    modal.classList.remove('hidden');
    if (btnInstall && btnInstall.focus) btnInstall.focus();
  }

  function showNonIntrusiveUpdateBanner(release) {
    if (!release || !release.tag_name) return;
    var tag = release.tag_name;
    if (isUpdateTagDismissed(tag)) return;
    removeUpdateBanner();
    var banner = document.createElement('div');
    banner.id = 'ctv-update-banner';
    banner.innerHTML =
      '<span style="font-weight:700;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">⚡ CTV ' + tag + ' disponible</span>' +
      '<button type="button" id="ctv-ub-open" class="btn focusable" tabindex="0" style="background:linear-gradient(135deg,#8d37de,#b04cf2);border:0;color:#fff;padding:6px 12px;font-weight:700;font-size:.82rem">Actualizar</button>' +
      '<button type="button" id="ctv-ub-close" class="btn focusable" tabindex="0" aria-label="Cerrar aviso" style="padding:6px 9px;font-size:.82rem">✕</button>';
    document.body.appendChild(banner);
    var openBtn = banner.querySelector('#ctv-ub-open');
    var closeBtn = banner.querySelector('#ctv-ub-close');
    if (openBtn) openBtn.onclick = function () { showGitHubUpdateModal(release); };
    if (closeBtn) {
      closeBtn.onclick = function () {
        persistDismissedUpdateTag(tag);
        removeUpdateBanner();
      };
    }
  }

  function applyReleaseResult(release, forceModal) {
    if (!release || !release.tag_name) return;
    var platform = detectPlatform();
    var effectiveRemoteVer = resolveEffectiveReleaseVersion(release, platform);
    var localVer = getAuthoritativeAppVersion();
    var bell = document.getElementById('update-bell');
    if (!forceModal && compareSemver(effectiveRemoteVer, localVer) <= 0) {
      removeUpdateBanner();
      if (bell) bell.classList.add('hidden');
      return;
    }
    latestReleaseData = release;
    if (bell) {
      bell.classList.remove('hidden');
      bell.onclick = function (e) {
        e.preventDefault();
        e.stopPropagation();
        showGitHubUpdateModal(latestReleaseData);
      };
    }
    if (forceModal) {
      showGitHubUpdateModal(release);
    } else {
      showNonIntrusiveUpdateBanner(release);
    }
  }

  function checkGitHubRelease(forceModal) {
    if (!forceModal) {
      try {
        var rawCache = localStorage.getItem(GH_CACHE_KEY);
        if (rawCache) {
          var parsed = JSON.parse(rawCache);
          if (parsed && parsed.ts && (Date.now() - parsed.ts) < GH_CACHE_TTL_MS && parsed.data) {
            applyReleaseResult(parsed.data, false);
            return;
          }
        }
      } catch (e) {}
    }

    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

    ctvFetchWithTimeout(GITHUB_LATEST_URL, {
      headers: { Accept: 'application/vnd.github+json' },
      cache: 'no-store'
    }, 5000)
      .then(function (r) {
        return r && r.ok ? r.json() : null;
      })
      .then(function (release) {
        if (!release || !release.tag_name) return;
        try {
          localStorage.setItem(GH_CACHE_KEY, JSON.stringify({ ts: Date.now(), data: release }));
        } catch (e) {}
        applyReleaseResult(release, forceModal);
      })
      .catch(function () {});
  }

  window.checkCTVGitHubUpdate = checkGitHubRelease;
  var scheduleReleaseCheck = function () {
    setTimeout(function () {
      if (typeof window.checkCTVGitHubUpdate === 'function') {
        window.checkCTVGitHubUpdate(false);
      }
    }, 4200);
  };
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(scheduleReleaseCheck, { timeout: 5000 });
  } else {
    scheduleReleaseCheck();
  }
})();

/* ============================================================================
 * CTV: AUTO-ACTUALIZADOR EN LA NUBE (OTA LIVE LOADER) SIN REINSTALAR LA APP
 * Descarga y aplica parches en vivo desde GitHub al abrir la app en cualquier
 * dispositivo (.exe, .AppImage, .ipa iOS y .apk Android/Smart TV).
 * ============================================================================ */
(function () {
  var OTA_SCRIPT_URL = 'https://raw.githubusercontent.com/Demon11701/CTV-Desktop/main/src/ctv-ota.js';
  var OTA_CACHE_KEY = 'ctv_ota_live_script_v1';

  // Auto-reparación del DOM por si la plantilla HTML local es de una versión anterior
  try {
    var menu = document.querySelector('.menu');
    if (menu && !menu.querySelector('[data-section="anime"]')) {
      var favBtn = menu.querySelector('[data-section="favorites"]');
      var animeBtn = document.createElement('button');
      animeBtn.className = 'menu-item focusable';
      animeBtn.setAttribute('data-section', 'anime');
      animeBtn.tabIndex = 0;
      animeBtn.innerHTML =
        '<span class="menu-icon" aria-hidden="true">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z"/><circle cx="12" cy="12" r="2" fill="currentColor"/></svg>' +
        '</span><span class="menu-label">Anime</span>';
      animeBtn.addEventListener('click', function () {
        document.querySelectorAll('.menu-item').forEach(function (s) { s.classList.remove('active'); });
        animeBtn.classList.add('active');
        var si = document.getElementById('search-input');
        var sc = document.getElementById('search-clear');
        if (si) si.value = '';
        if (sc) sc.classList.add('hidden');
        if (window.ctvOpenAnimeSection) window.ctvOpenAnimeSection();
      });
      if (favBtn) menu.insertBefore(animeBtn, favBtn);
      else menu.appendChild(animeBtn);
    }

    var pBar = document.getElementById('player-bar');
    if (pBar && !document.getElementById('player-subs')) {
      var pFav = document.getElementById('player-fav');
      var subBtn = document.createElement('button');
      subBtn.id = 'player-subs';
      subBtn.className = 'btn focusable hidden';
      subBtn.tabIndex = 0;
      subBtn.title = 'Subtítulos';
      subBtn.textContent = '💬 Subtítulos';
      if (pFav) pBar.insertBefore(subBtn, pFav);
      else pBar.appendChild(subBtn);
    }

    var pFrame = document.getElementById('player-frame');
    if (pFrame) {
      if (pFrame.classList.contains('hidden')) pFrame.removeAttribute('sandbox');
      pFrame.removeAttribute('referrerpolicy');
    }

    // Navegación D-Pad Smart TV + Atajos Desktop (F pantalla completa, Esc atrás/salir fullscreen, Espacio play/pause)
    if (window.__ctvDpadKeyHandler) {
      window.removeEventListener('keydown', window.__ctvDpadKeyHandler, true);
    }
    window.__ctvDpadKeyHandler = function (e) {
      var kc = e.keyCode || e.which || 0;
      var isSelectKey = (e.key === 'Enter' || e.key === 'NumpadEnter' || e.key === ' ' || e.key === 'Select' || kc === 13 || kc === 23 || kc === 66);
      var isBackKey = (e.key === 'Escape' || e.key === 'Backspace' || e.key === 'GoBack' || kc === 4 || kc === 27);
      var activeNow = document.activeElement;
      var activeTag = activeNow && activeNow.tagName ? activeNow.tagName.toUpperCase() : '';
      var isTypingTarget = activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT' || (activeNow && activeNow.isContentEditable);

      var subsModal = document.getElementById('ctv-subs-modal') || document.getElementById('ctv-quality-modal');
      if (subsModal) {
        var isQualModal = subsModal.id === 'ctv-quality-modal';
        var subBtns = Array.prototype.slice.call(subsModal.querySelectorAll('button.focusable'));
        var curIdx = subBtns.indexOf(document.activeElement);
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          e.stopPropagation();
          if (e.stopImmediatePropagation) e.stopImmediatePropagation();
          var next = subBtns[curIdx + 1] || subBtns[0];
          if (next) next.focus();
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          e.stopPropagation();
          if (e.stopImmediatePropagation) e.stopImmediatePropagation();
          var prev = subBtns[curIdx - 1] || subBtns[subBtns.length - 1];
          if (prev) prev.focus();
          return;
        }
        if (isBackKey) {
          e.preventDefault();
          e.stopPropagation();
          if (e.stopImmediatePropagation) e.stopImmediatePropagation();
          subsModal.remove();
          var ps = document.getElementById(isQualModal ? 'player-quality' : 'player-subs');
          if (ps && !ps.classList.contains('hidden')) ps.focus();
          return;
        }
        return;
      }

      var updModal = document.getElementById('update-modal');
      if (updModal && !updModal.classList.contains('hidden') && isBackKey) {
        e.preventDefault();
        e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        var laterBtn = document.getElementById('btn-update-later');
        if (laterBtn) laterBtn.click();
        else updModal.classList.add('hidden');
        return;
      }

      var pModal = document.getElementById('player-modal');
      var playerOpen = Boolean(pModal && !pModal.classList.contains('hidden'));

      if (!playerOpen) {
        if (e.key === 'Escape' && (document.fullscreenElement || document.webkitFullscreenElement || window.__ctvIsFullscreen)) {
          e.preventDefault();
          e.stopPropagation();
          if (e.stopImmediatePropagation) e.stopImmediatePropagation();
          if (typeof window.ctvExitFullscreen === 'function') window.ctvExitFullscreen();
          return;
        }
        var activeEl = document.activeElement;
        if (!activeEl || !activeEl.closest) return;

        var filterPill = activeEl.closest('#filter-bar .pill');
        if (filterPill && e.key === 'ArrowDown') {
          var firstAg = document.querySelector('#content .agenda-card');
          if (firstAg) {
            e.preventDefault();
            e.stopPropagation();
            if (e.stopImmediatePropagation) e.stopImmediatePropagation();
            firstAg.focus();
            try { firstAg.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (x) {}
            return;
          }
        }

        var agEmbedBtn = activeEl.closest('.agenda-embeds button');
        if (agEmbedBtn) {
          var parentCard = agEmbedBtn.closest('.agenda-card');
          var embedBox = agEmbedBtn.closest('.agenda-embeds');
          var embedBtns = embedBox ? Array.prototype.slice.call(embedBox.querySelectorAll('button')) : [];
          var ebIdx = embedBtns.indexOf(agEmbedBtn);

          if (e.key === 'ArrowRight') {
            e.preventDefault();
            e.stopPropagation();
            if (e.stopImmediatePropagation) e.stopImmediatePropagation();
            if (ebIdx >= 0 && ebIdx < embedBtns.length - 1) embedBtns[ebIdx + 1].focus();
            return;
          }
          if (e.key === 'ArrowLeft') {
            e.preventDefault();
            e.stopPropagation();
            if (e.stopImmediatePropagation) e.stopImmediatePropagation();
            if (ebIdx > 0) {
              embedBtns[ebIdx - 1].focus();
            } else {
              var actMenu1 = document.querySelector('.menu-item.active') || document.querySelector('.menu-item');
              if (actMenu1) actMenu1.focus();
            }
            return;
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            e.stopPropagation();
            if (e.stopImmediatePropagation) e.stopImmediatePropagation();
            if (parentCard) parentCard.focus();
            return;
          }
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            e.stopPropagation();
            if (e.stopImmediatePropagation) e.stopImmediatePropagation();
            var allCards1 = Array.prototype.slice.call(document.querySelectorAll('#content .agenda-card'));
            var cIdx1 = allCards1.indexOf(parentCard);
            var nextCard1 = allCards1[cIdx1 + 1];
            if (nextCard1) {
              nextCard1.focus();
              try { nextCard1.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (x) {}
            }
            return;
          }
          if (isBackKey) {
            e.preventDefault();
            e.stopPropagation();
            if (e.stopImmediatePropagation) e.stopImmediatePropagation();
            if (embedBox) { embedBox.style.display = 'none'; embedBox.innerHTML = ''; }
            if (parentCard) parentCard.focus();
            return;
          }
          if (kc === 23 || kc === 66 || e.key === 'NumpadEnter' || e.key === 'Select') {
            e.preventDefault();
            e.stopPropagation();
            if (e.stopImmediatePropagation) e.stopImmediatePropagation();
            agEmbedBtn.click();
            return;
          }
          return;
        }

        var agCard = activeEl.classList && activeEl.classList.contains('agenda-card') ? activeEl : null;
        if (agCard) {
          var allCards = Array.prototype.slice.call(document.querySelectorAll('#content .agenda-card'));
          var cIdx = allCards.indexOf(agCard);
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            e.stopPropagation();
            if (e.stopImmediatePropagation) e.stopImmediatePropagation();
            var openBtn = agCard.querySelector('.agenda-embeds button');
            if (openBtn && agCard.querySelector('.agenda-embeds').style.display !== 'none') {
              openBtn.focus();
            } else if (cIdx >= 0 && cIdx < allCards.length - 1) {
              allCards[cIdx + 1].focus();
              try { allCards[cIdx + 1].scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (x) {}
            }
            return;
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            e.stopPropagation();
            if (e.stopImmediatePropagation) e.stopImmediatePropagation();
            if (cIdx > 0) {
              allCards[cIdx - 1].focus();
              try { allCards[cIdx - 1].scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (x) {}
            } else {
              var actPill = document.querySelector('#filter-bar .pill.active') || document.querySelector('#filter-bar .pill') || document.querySelector('#search-input');
              if (actPill) actPill.focus();
            }
            return;
          }
          if (e.key === 'ArrowLeft') {
            e.preventDefault();
            e.stopPropagation();
            if (e.stopImmediatePropagation) e.stopImmediatePropagation();
            var actMenu2 = document.querySelector('.menu-item.active') || document.querySelector('.menu-item');
            if (actMenu2) actMenu2.focus();
            return;
          }
          if (isSelectKey && e.key !== 'Enter' && !e.repeat) {
            e.preventDefault();
            e.stopPropagation();
            if (e.stopImmediatePropagation) e.stopImmediatePropagation();
            agCard.click();
            return;
          }
        }
        return;
      }

      if (!isTypingTarget && e.key && e.key.toLowerCase() === 'f' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.repeat) {
        e.preventDefault();
        e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        if (typeof window.ctvToggleFullscreen === 'function') {
          window.ctvToggleFullscreen().then(function (isFs) {
            if (typeof window.ctvShowToast === 'function') {
              window.ctvShowToast(isFs ? '⛶ Pantalla completa' : '⛶ Modo ventana');
            }
          });
        }
        return;
      }

      if (e.key === 'Escape' && (document.fullscreenElement || document.webkitFullscreenElement || window.__ctvIsFullscreen)) {
        e.preventDefault();
        e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        if (typeof window.ctvExitFullscreen === 'function') window.ctvExitFullscreen();
        return;
      }

      var agStatus = document.getElementById('ctv-agenda-status');
      if (agStatus) {
        var stBtns = Array.prototype.slice.call(agStatus.querySelectorAll('button.focusable'));
        var sIdx = stBtns.indexOf(document.activeElement);
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault();
          e.stopPropagation();
          if (e.stopImmediatePropagation) e.stopImmediatePropagation();
          var nextSt = stBtns[sIdx + 1] || stBtns[0];
          if (nextSt) nextSt.focus();
          return;
        }
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault();
          e.stopPropagation();
          if (e.stopImmediatePropagation) e.stopImmediatePropagation();
          var prevSt = stBtns[sIdx - 1] || stBtns[stBtns.length - 1];
          if (prevSt) prevSt.focus();
          return;
        }
        if (isBackKey) {
          e.preventDefault();
          e.stopPropagation();
          if (e.stopImmediatePropagation) e.stopImmediatePropagation();
          if (typeof window.__ctvClosePlayer === 'function') window.__ctvClosePlayer();
          return;
        }
      }

      var pBar = document.getElementById('player-bar');
      var v = document.getElementById('player-video');
      var f = document.getElementById('player-frame');
      var isVideoActive = v && !v.classList.contains('hidden');
      var active = document.activeElement;
      var inBar = pBar && pBar.contains(active);

      if (e.key === 'MediaPlayPause' || kc === 85 || kc === 179) {
        if (isVideoActive) {
          e.preventDefault();
          if (e.stopImmediatePropagation) e.stopImmediatePropagation();
          if (v.paused) v.play().catch(function () {});
          else v.pause();
        }
        return;
      }

      if ((e.key === ' ' || e.code === 'Space') && isVideoActive && !isTypingTarget && activeTag !== 'BUTTON') {
        e.preventDefault();
        e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        if (v.paused) v.play().catch(function () {});
        else v.pause();
        return;
      }

      if (inBar) {
        var barBtns = Array.prototype.slice.call(pBar.querySelectorAll('.btn:not(.hidden)'));
        var bIdx = barBtns.indexOf(active);
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          e.stopPropagation();
          if (e.stopImmediatePropagation) e.stopImmediatePropagation();
          if (bIdx >= 0 && bIdx < barBtns.length - 1) barBtns[bIdx + 1].focus();
          return;
        }
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          e.stopPropagation();
          if (e.stopImmediatePropagation) e.stopImmediatePropagation();
          if (bIdx > 0) barBtns[bIdx - 1].focus();
          return;
        }
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          e.stopPropagation();
          if (e.stopImmediatePropagation) e.stopImmediatePropagation();
          if (isVideoActive) v.focus();
          else if (f && !f.classList.contains('hidden')) f.focus();
          return;
        }
        if ((kc === 23 || kc === 66 || e.key === 'Select' || e.key === 'NumpadEnter') && active && typeof active.click === 'function' && !e.repeat) {
          e.preventDefault();
          e.stopPropagation();
          if (e.stopImmediatePropagation) e.stopImmediatePropagation();
          active.click();
          return;
        }
        return;
      }

      if (isVideoActive) {
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          e.stopPropagation();
          if (e.stopImmediatePropagation) e.stopImmediatePropagation();
          if (pBar) {
            pBar.classList.remove('hidden');
            pBar.style.opacity = '1';
            var bFirst = pBar.querySelector('.btn:not(.hidden)');
            if (bFirst) bFirst.focus();
          }
          return;
        }
        if (e.key === 'ArrowLeft' || e.key === 'MediaRewind') {
          e.preventDefault();
          e.stopPropagation();
          if (e.stopImmediatePropagation) e.stopImmediatePropagation();
          try { v.currentTime = Math.max(0, (v.currentTime || 0) - 10); } catch (x) {}
          return;
        }
        if (e.key === 'ArrowRight' || e.key === 'MediaFastForward') {
          e.preventDefault();
          e.stopPropagation();
          if (e.stopImmediatePropagation) e.stopImmediatePropagation();
          try { v.currentTime = Math.min(v.duration || 999999, (v.currentTime || 0) + 10); } catch (x) {}
          return;
        }
        if ((e.key === 'Enter' || e.key === ' ' || kc === 23) && (active === v || active === document.body || active === pModal)) {
          e.preventDefault();
          e.stopPropagation();
          if (e.stopImmediatePropagation) e.stopImmediatePropagation();
          if (v.paused) v.play().catch(function () {});
          else v.pause();
          return;
        }
      } else if (f && !f.classList.contains('hidden')) {
        if (e.key === 'ArrowUp') {
          if (pBar) {
            pBar.classList.remove('hidden');
            pBar.style.opacity = '1';
            var bBack = document.getElementById('player-back');
            if (bBack) bBack.focus();
          }
        }
      }
    };
    window.addEventListener('keydown', window.__ctvDpadKeyHandler, true);

    // Adaptar textos largos del menú en pantallas estrechas para que las 7 pestañas nunca se corten
    function adaptResponsiveLabels() {
      try {
        var compact = window.innerWidth <= 860 || (window.innerHeight >= window.innerWidth && window.innerWidth <= 1024);
        var liveLbl = document.querySelector('.menu-item[data-section="live"] .menu-label');
        var agendaLbl = document.querySelector('.menu-item[data-section="agenda"] .menu-label');
        if (liveLbl) liveLbl.textContent = compact ? 'En vivo' : 'TV en vivo';
        if (agendaLbl) agendaLbl.textContent = compact ? 'Agenda' : 'Agenda deportiva';
      } catch (e) {}
    }
    window.addEventListener('resize', adaptResponsiveLabels);
    window.addEventListener('orientationchange', adaptResponsiveLabels);
    adaptResponsiveLabels();

    if (window.__ctvFavCaptureClickHandler) {
      document.removeEventListener('click', window.__ctvFavCaptureClickHandler, true);
    }
    window.__ctvFavCaptureClickHandler = function (e) {
      var t = e.target;
      if (!t || !t.closest) return;

      var favBtn = t.closest('#player-fav, #detail-fav');
      if (favBtn) {
        var curFav = window.__ctvCurrentItem;
        if (favBtn.id === 'player-fav' && curFav && curFav.kind === 'tv') {
          var beforeTv = '';
          try { beforeTv = localStorage.getItem('pj2_favs_slugs') || ''; } catch (x) {}
          setTimeout(function () {
            var afterTv = '';
            try { afterTv = localStorage.getItem('pj2_favs_slugs') || ''; } catch (x) {}
            if (beforeTv === afterTv && typeof window.ctvToggleFavoriteItem === 'function') {
              window.ctvToggleFavoriteItem(curFav);
            } else {
              if (typeof window.ctvInvalidateFavCache === 'function') window.ctvInvalidateFavCache();
              if (typeof window.ctvPersistDesktopState === 'function') window.ctvPersistDesktopState();
              if (typeof window.ctvUpdateFavButtonsUI === 'function') window.ctvUpdateFavButtonsUI();
              var nowFav = typeof window.ctvIsItemFavorite === 'function' ? window.ctvIsItemFavorite(curFav) : false;
              if (typeof window.ctvShowToast === 'function') {
                window.ctvShowToast(nowFav ? '★ Guardado en Favoritos' : '☆ Eliminado de Favoritos');
              }
            }
          }, 25);
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        if (typeof window.ctvToggleFavoriteItem === 'function') {
          window.ctvToggleFavoriteItem(curFav);
        }
        return;
      }

      var liveCard = t.closest('.card.live[data-slug]');
      if (liveCard) {
        var cSlug = liveCard.getAttribute('data-slug') || (liveCard.__canal && liveCard.__canal.slug) || '';
        if (cSlug) {
          window.__ctvCurrentItem = {
            kind: 'tv',
            slug: cSlug,
            title: (liveCard.__canal && liveCard.__canal.nombre) || ''
          };
          setTimeout(function () {
            if (typeof window.ctvUpdateFavButtonsUI === 'function') window.ctvUpdateFavButtonsUI();
          }, 80);
        }
      }
    };
    document.addEventListener('click', window.__ctvFavCaptureClickHandler, true);

    function ctvReadFavListLocal(storageKey) {
      try {
        var raw = JSON.parse(localStorage.getItem(storageKey) || '[]');
        return Array.isArray(raw) ? raw : [];
      } catch (e) {
        return [];
      }
    }

    function ctvGuessCardItem(card) {
      if (!card) return null;
      if (card.__ctvItem && card.__ctvItem.slug) return card.__ctvItem;
      var titleEl = card.querySelector('.card-title');
      var imgEl = card.querySelector('.card-poster');
      var yearEl = card.querySelector('.movie-year');
      var ratingEl = card.querySelector('.movie-rating');
      var title = titleEl ? (titleEl.getAttribute('title') || titleEl.textContent || '').trim() : '';
      var poster = imgEl ? (imgEl.getAttribute('src') || '') : '';
      var isSerie = Boolean(card.querySelector('.badge-serie, .badge-serie-r')) ||
        (card.querySelector('.card-meta') && /serie/i.test(card.querySelector('.card-meta').textContent || '')) ||
        Boolean(document.querySelector('.menu-item.active[data-section="series"]'));

      var slug = card.getAttribute('data-slug') || '';
      if (!slug && window.__ctvCatalog) {
        var normT = title.toLowerCase().trim();
        var keys = Object.keys(window.__ctvCatalog);
        for (var i = 0; i < keys.length; i++) {
          var it = window.__ctvCatalog[keys[i]];
          if (!it) continue;
          var itTitle = String(it.titulo || it.nombre || it.titulo_principal || it.title || '').toLowerCase().trim();
          if (itTitle && itTitle === normT) {
            slug = it.slug || keys[i];
            if (it.tipo === 'serie') isSerie = true;
            break;
          }
        }
      }
      if (!slug) {
        var favArr = ctvReadFavListLocal('pj2_favs_series').concat(ctvReadFavListLocal('pj2_favs_movies'));
        for (var j = 0; j < favArr.length; j++) {
          var f = favArr[j];
          if (f && String(f.title || '').toLowerCase().trim() === title.toLowerCase().trim()) {
            slug = f.slug;
            if (f.tipo === 'serie') isSerie = true;
            break;
          }
        }
      }
      if (!slug) return null;
      var itemObj = {
        kind: isSerie ? 'serie' : 'movie',
        tipo: isSerie ? 'serie' : 'pelicula',
        slug: slug,
        title: title || 'Título',
        poster: poster,
        year: yearEl ? (yearEl.textContent || '').trim().slice(0, 4) : '',
        rating: ratingEl ? (ratingEl.textContent || '').replace('★', '').trim() : ''
      };
      card.setAttribute('data-slug', slug);
      card.__ctvItem = itemObj;
      return itemObj;
    }

    function ctvBindMovieCardsInContainer(root) {
      if (!root || !root.querySelectorAll) return;
      var cards = root.querySelectorAll('.card.movie');
      var anyBound = false;
      cards.forEach(function (card) {
        if (card.__ctvFavBound) return;
        var item = ctvGuessCardItem(card);
        card.__ctvFavBound = true;
        anyBound = true;

        var touchTimer = null;
        var keyTimer = null;
        var longPressed = false;

        card.addEventListener('touchstart', function () {
          longPressed = false;
          touchTimer = setTimeout(function () {
            var it = ctvGuessCardItem(card) || item;
            if (it && it.slug && typeof window.ctvToggleFavoriteItem === 'function') {
              longPressed = true;
              window.ctvToggleFavoriteItem(it);
            }
          }, 600);
        }, { passive: true });

        card.addEventListener('touchend', function () {
          if (touchTimer) { clearTimeout(touchTimer); touchTimer = null; }
        }, { passive: true });

        card.addEventListener('touchmove', function () {
          if (touchTimer) { clearTimeout(touchTimer); touchTimer = null; }
        }, { passive: true });

        card.addEventListener('click', function (ev) {
          if (longPressed) {
            longPressed = false;
            ev.preventDefault();
            ev.stopPropagation();
            if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
            return;
          }
          var it = ctvGuessCardItem(card) || item;
          if (it && it.slug) {
            window.__ctvCurrentItem = it;
          }
        }, true);

        card.addEventListener('keydown', function (ev) {
          var evKc = ev.keyCode || ev.which || 0;
          var isOk = (ev.key === 'Enter' || ev.key === 'NumpadEnter' || evKc === 13 || evKc === 23);
          if (ev.key && ev.key.toLowerCase() === 'f' && !ev.repeat) {
            var it = ctvGuessCardItem(card) || item;
            if (it && it.slug && typeof window.ctvToggleFavoriteItem === 'function') {
              ev.preventDefault();
              ev.stopPropagation();
              window.ctvToggleFavoriteItem(it);
            }
          } else if (isOk && !ev.repeat && !keyTimer) {
            keyTimer = setTimeout(function () {
              keyTimer = null;
              var it = ctvGuessCardItem(card) || item;
              if (it && it.slug && typeof window.ctvToggleFavoriteItem === 'function') {
                longPressed = true;
                window.ctvToggleFavoriteItem(it);
              }
            }, 850);
          }
        });

        card.addEventListener('keyup', function (ev) {
          var evKc = ev.keyCode || ev.which || 0;
          var isOk = (ev.key === 'Enter' || ev.key === 'NumpadEnter' || evKc === 13 || evKc === 23);
          if (isOk) {
            if (keyTimer) {
              clearTimeout(keyTimer);
              keyTimer = null;
            }
            if (longPressed) {
              longPressed = false;
              ev.preventDefault();
              ev.stopPropagation();
              if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
            }
          }
        }, true);
      });
      if (anyBound && typeof window.ctvUpdateFavButtonsUI === 'function') {
        window.ctvUpdateFavButtonsUI();
      }
    }

    function ctvOptimizeImagesInContainer(root) {
      if (!root || !root.querySelectorAll) return;
      var imgs = root.querySelectorAll('img');
      for (var i = 0; i < imgs.length; i++) {
        var img = imgs[i];
        if (img.__ctvImgOpt) continue;
        img.__ctvImgOpt = true;
        if (!img.getAttribute('loading')) img.setAttribute('loading', 'lazy');
        if (!img.getAttribute('decoding')) img.setAttribute('decoding', 'async');
      }
    }

    if (window.__ctvDomEnhancerObserver) {
      try { window.__ctvDomEnhancerObserver.disconnect(); } catch (e) {}
      window.__ctvDomEnhancerObserver = null;
    }
    if (Array.isArray(window.__ctvScopedObservers)) {
      window.__ctvScopedObservers.forEach(function (obs) {
        try { obs.disconnect(); } catch (e) {}
      });
    }
    window.__ctvScopedObservers = [];

    var ctvContentRaf = null;
    var ctvContentTimer = null;
    function runContentPass() {
      ctvContentRaf = null;
      ctvContentTimer = null;
      try {
        var contentEl = document.getElementById('content');
        if (!contentEl) return;
        if (contentEl.children && contentEl.children.length > 0 && typeof window.ctvDismissSplash === 'function') {
          window.ctvDismissSplash();
        }
        ctvOptimizeImagesInContainer(contentEl);
        ctvBindMovieCardsInContainer(contentEl);
      } catch (e) {}
    }
    function scheduleContentPass() {
      if (ctvContentTimer || ctvContentRaf) return;
      ctvContentTimer = setTimeout(function () {
        ctvContentTimer = null;
        var raf = window.requestAnimationFrame || function (cb) { return setTimeout(cb, 16); };
        ctvContentRaf = raf(runContentPass);
      }, 60);
    }

    var ctvDetailRaf = null;
    function scheduleDetailPass() {
      if (ctvDetailRaf) return;
      var raf = window.requestAnimationFrame || function (cb) { return setTimeout(cb, 16); };
      ctvDetailRaf = raf(function () {
        ctvDetailRaf = null;
        try {
          var detailBody = document.getElementById('detail-body');
          if (!detailBody) return;
          ctvOptimizeImagesInContainer(detailBody);
          if (detailBody.querySelector('#detail-fav') && typeof window.ctvUpdateFavButtonsUI === 'function') {
            window.ctvUpdateFavButtonsUI();
          }
        } catch (e) {}
      });
    }

    function cleanupStaleMxNodes() {
      var staleMxPill = document.getElementById('ctv-quick-mx-pill');
      if (staleMxPill) staleMxPill.remove();
      var staleMxSec = document.getElementById('ctv-mx-filter-sec');
      if (staleMxSec) staleMxSec.remove();
    }

    // Observadores acotados a contenedores concretos (sin observar document.body)
    var contentTarget = document.getElementById('content');
    if (contentTarget && typeof MutationObserver === 'function') {
      var contentObs = new MutationObserver(scheduleContentPass);
      contentObs.observe(contentTarget, { childList: true, subtree: true });
      window.__ctvScopedObservers.push(contentObs);
    }
    var detailTarget = document.getElementById('detail-body');
    if (detailTarget && typeof MutationObserver === 'function') {
      var detailObs = new MutationObserver(scheduleDetailPass);
      detailObs.observe(detailTarget, { childList: true, subtree: true });
      window.__ctvScopedObservers.push(detailObs);
    }
    var filterBarTarget = document.getElementById('filter-bar');
    if (filterBarTarget && typeof MutationObserver === 'function') {
      var filterObs = new MutationObserver(cleanupStaleMxNodes);
      filterObs.observe(filterBarTarget, { childList: true });
      window.__ctvScopedObservers.push(filterObs);
    }

    cleanupStaleMxNodes();
    scheduleContentPass();
    scheduleDetailPass();
  } catch (e) {}

  var OTA_LAST_CHECK_KEY = 'ctv_ota_last_check_v1';
  var OTA_CHECK_TTL_MS = 15 * 60 * 1000;
  var BUILTIN_OTA_REV = 15; // Nivel de parches ya integrado en este build (equivale a 1.6.1-ota.15)
  var pendingOtaCode = '';
  if (!window.CTV_OTA_VERSION) {
    window.CTV_OTA_VERSION = '1.6.1-ota.15';
  }

  function extractOtaRevision(code) {
    if (!code) return 0;
    var m = String(code).match(/CTV_OTA_VERSION\s*=\s*['"][^'"]*?ota\.(\d+)['"]/i);
    return m ? (parseInt(m[1], 10) || 0) : 0;
  }

  function runOtaCode(code) {
    if (!code || window.__ctvOtaExecuted === code) return;
    window.__ctvOtaExecuted = code;
    try {
      var fn = new Function(code);
      fn();
    } catch (e) {
      try {
        var prevTag = document.getElementById('ctv-ota-live-script');
        if (prevTag) prevTag.remove();
        var sc = document.createElement('script');
        sc.id = 'ctv-ota-live-script';
        sc.textContent = code;
        (document.head || document.documentElement).appendChild(sc);
      } catch (e2) {
        console.warn('Error ejecutando OTA:', e2);
      }
    }
  }

  window.__ctvFlushPendingOta = function () {
    if (!pendingOtaCode) return;
    var pModal = document.getElementById('player-modal');
    if (pModal && !pModal.classList.contains('hidden')) return;
    var codeToApply = pendingOtaCode;
    pendingOtaCode = '';
    runOtaCode(codeToApply);
  };

  // 1. Ejecutar caché OTA instantáneamente solo si es ESTRICTAMENTE más reciente que BUILTIN_OTA_REV (evita downgrades)
  var cached = '';
  var hasValidCache = false;
  try {
    cached = localStorage.getItem(OTA_CACHE_KEY) || '';
    var cachedRev = extractOtaRevision(cached);
    if (cached && cachedRev > BUILTIN_OTA_REV) {
      hasValidCache = true;
      runOtaCode(cached);
    } else if (cached && cachedRev > 0 && cachedRev <= BUILTIN_OTA_REV) {
      try { localStorage.removeItem(OTA_CACHE_KEY); } catch (e2) {}
      cached = '';
    }
  } catch (e) {}

  // 2. Comprobación OTA en segundo plano no bloqueante: timeout 5s, offline silencioso y caché TTL 15 min
  function checkOtaInBackground() {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    try {
      var lastTs = parseInt(localStorage.getItem(OTA_LAST_CHECK_KEY) || '0', 10) || 0;
      if (lastTs && (Date.now() - lastTs) < OTA_CHECK_TTL_MS) return;
    } catch (e) {}

    var fetchFn = typeof window.ctvFetchWithTimeout === 'function'
      ? window.ctvFetchWithTimeout
      : function (u, o) { return fetch(u, o); };

    fetchFn(OTA_SCRIPT_URL + '?t=' + Date.now(), { cache: 'no-store' }, 5000)
      .then(function (r) { return r && r.ok ? r.text() : ''; })
      .then(function (remoteCode) {
        try { localStorage.setItem(OTA_LAST_CHECK_KEY, String(Date.now())); } catch (e) {}
        if (!remoteCode || remoteCode.indexOf('CTV_OTA_VERSION') < 0) return;
        // Nunca aplicar un parche OTA remoto igual o más antiguo que el código integrado en este build
        if (extractOtaRevision(remoteCode) <= BUILTIN_OTA_REV) return;
        var savedCode = cached;
        try { savedCode = localStorage.getItem(OTA_CACHE_KEY) || cached; } catch (e) {}
        if (remoteCode !== savedCode || window.__ctvOtaExecuted !== remoteCode) {
          try { localStorage.setItem(OTA_CACHE_KEY, remoteCode); } catch (e) {}
          var pModal = document.getElementById('player-modal');
          if (pModal && !pModal.classList.contains('hidden')) {
            pendingOtaCode = remoteCode;
            if (typeof window.ctvShowToast === 'function') {
              window.ctvShowToast('✨ Parche de mejora listo (se aplicará al salir del reproductor)');
            }
          } else {
            runOtaCode(remoteCode);
          }
        }
      })
      .catch(function () {});
  }

  var scheduleOta = function () {
    setTimeout(checkOtaInBackground, hasValidCache ? 2600 : 1200);
  };
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(scheduleOta, { timeout: 3500 });
  } else {
    scheduleOta();
  }
})();
