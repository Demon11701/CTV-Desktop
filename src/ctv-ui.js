/* CTV UI v1.6.0:
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

  var content = document.getElementById('content');
  if (!content) return;
  var picks = [], idx = 0, rot = null, deb = null, building = false;

  function isHome() {
    var a = document.querySelector('.menu-item.active');
    var si = document.getElementById('search-input');
    return !!a && a.getAttribute('data-section') === 'home' && (!si || !si.value.trim());
  }

  function txt(el) { return el ? (el.textContent || '').trim() : ''; }

  function show(hero, i) {
    var c = picks[i];
    if (!c) return;
    var img = c.querySelector('.card-poster');
    var src = img ? (img.currentSrc || img.src) : '';
    var kick = c.querySelector('.badge-top') ? '\u2605 Top' : (c.querySelector('.badge-serie') ? 'Serie' : 'Estreno');
    var y = txt(c.querySelector('.movie-year')), r = txt(c.querySelector('.movie-rating'));
    var meta = [y, r].filter(Boolean).join('  \u00b7  ');
    hero.classList.add('fade');
    setTimeout(function () {
      hero.querySelector('.ctv-hero-bg').src = src;
      hero.querySelector('.ctv-hero-poster').src = src;
      hero.querySelector('.ctv-hero-kicker').textContent = kick;
      hero.querySelector('.ctv-hero-title').textContent = txt(c.querySelector('.card-title')) || 'CTV';
      hero.querySelector('.ctv-hero-meta').textContent = meta;
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
      var old = content.querySelector('.ctv-hero');
      if (!isHome()) { if (old) old.remove(); return; }
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
        '<img class="ctv-hero-bg" referrerpolicy="no-referrer" alt="">' +
        '<div class="ctv-hero-info">' +
        '<span class="ctv-hero-kicker"></span>' +
        '<div class="ctv-hero-title"></div>' +
        '<div class="ctv-hero-meta"></div>' +
        '<button class="ctv-hero-btn focusable" tabindex="0">\u25b6 Ver ahora</button>' +
        '</div>' +
        '<img class="ctv-hero-poster" referrerpolicy="no-referrer" alt="">' +
        '<div class="ctv-hero-dots">' + picks.map(function () { return '<i></i>'; }).join('') + '</div>';
      hero.querySelector('.ctv-hero-btn').addEventListener('click', function () {
        var c = picks[idx];
        if (c && c.isConnected) c.click();
      });
      content.insertBefore(hero, content.firstChild);
      show(hero, 0);
      clearInterval(rot);
      rot = setInterval(function () {
        var h = content.querySelector('.ctv-hero');
        if (!h) { clearInterval(rot); return; }
        show(h, (idx + 1) % picks.length);
      }, 7000);
    } catch (e) {
    } finally {
      building = false;
    }
  }

  try {
    new MutationObserver(function () {
      clearTimeout(deb);
      deb = setTimeout(build, 200);
    }).observe(content, { childList: true });
    setTimeout(build, 600);
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
 * CTV: ENRIQUECEDOR DE SERVIDORES (SERIES COREANAS, ANIME Y PELÍCULAS)
 * ============================================================================ */
(function () {
  var SERIESPLAYER_MIRRORS = [
    { host: 'r-limit.flixlat.com', name: 'FLIXLAT DIRECTO' },
    { host: 'vod-limit-02.playspelis.com', name: 'PLAYSPELIS DIRECTO' },
    { host: 'akm-cdn-play-web.onfilom.com', name: 'ONFILOM DIRECTO' },
    { host: 'data-limit-c.solo-latino.com', name: 'SOLOLATINO DIRECTO' }
  ];

  function addParam(url, key, val) {
    return url + (url.indexOf('?') >= 0 ? '&' : '?') + key + '=' + encodeURIComponent(val);
  }

  window.ctvEnrichSeriesServers = function (servers, serieInfo, slug, season, episode) {
    var list = Array.isArray(servers) ? servers.slice() : [];
    var seenUrls = new Set();
    list.forEach(function (s) {
      var u = (s && (s.url || s.link)) || '';
      if (u) seenUrls.add(u);
    });

    // 1. Expandir SERIESPLAYER con 4 espejos CDN independientes sin anuncios
    var spServers = list.filter(function (s) {
      var u = (s && (s.url || s.link)) || '';
      return u.indexOf('seriesplayer.fortamomar.workers.dev') >= 0 || u.indexOf('pelisplayer.fortamomar.workers.dev') >= 0;
    });

    spServers.forEach(function (sp) {
      var baseUrl = sp.url || sp.link || '';
      var audio = sp.audio || sp.idioma || 'SUBTITULADA';
      var quality = sp.quality || sp.calidad || 'HD';
      sp.server_name = 'SERIESPLAYER · DIRECTO';

      SERIESPLAYER_MIRRORS.forEach(function (m) {
        var mirrorUrl = addParam(baseUrl, 'ctv_cdn', m.host);
        if (!seenUrls.has(mirrorUrl)) {
          seenUrls.add(mirrorUrl);
          list.push({
            url: mirrorUrl,
            audio: audio,
            quality: quality,
            server_name: m.name,
            ServerName: m.name
          });
        }
      });
    });

    // 2. Agregar servidores multi-embed internacionales/subtitulados usando TMDbId / IMDbId
    var tmdbId = serieInfo && (serieInfo.TMDbId || serieInfo.tmdb_id || serieInfo.tmdb);
    var imdbId = serieInfo && (serieInfo.imdb_id || serieInfo.ImdbId || serieInfo.imdb);
    var t = season || 1;
    var e = episode || 1;

    var defaultAudio = 'SUBTITULADA / MULTI';
    if (list.length && (list[0].audio || list[0].idioma)) {
      defaultAudio = list[0].audio || list[0].idioma;
    }

    var extraCandidates = [];
    if (imdbId) {
      extraCandidates.push({
        server_name: 'VSEMBED · MULTI',
        url: 'https://vsembed.su/embed/tv?imdb=' + encodeURIComponent(imdbId) + '&season=' + t + '&episode=' + e + '&ds_lang=es',
        audio: defaultAudio,
        quality: 'HD'
      });
    } else if (tmdbId) {
      extraCandidates.push({
        server_name: 'VSEMBED · MULTI',
        url: 'https://vsembed.su/embed/tv?tmdb=' + encodeURIComponent(tmdbId) + '&season=' + t + '&episode=' + e + '&ds_lang=es',
        audio: defaultAudio,
        quality: 'HD'
      });
    }

    if (tmdbId) {
      extraCandidates.push(
        {
          server_name: 'VIDSRC PRO',
          url: 'https://vidsrc.me/embed/tv?tmdb=' + encodeURIComponent(tmdbId) + '&season=' + t + '&episode=' + e + '&ds_lang=es',
          audio: 'SUBTITULADA',
          quality: 'HD'
        },
        {
          server_name: 'VIDLINK HD',
          url: 'https://vidlink.pro/tv/' + encodeURIComponent(tmdbId) + '/' + t + '/' + e,
          audio: 'SUBTITULADA',
          quality: 'FHD'
        },
        {
          server_name: 'MULTIEMBED',
          url: 'https://multiembed.mov/?video_id=' + encodeURIComponent(tmdbId) + '&tmdb=1&s=' + t + '&e=' + e,
          audio: 'SUBTITULADA',
          quality: 'HD'
        },
        {
          server_name: '2EMBED SERVER',
          url: 'https://www.2embed.cc/embedtv/' + encodeURIComponent(tmdbId) + '&s=' + t + '&e=' + e,
          audio: 'SUBTITULADA',
          quality: 'HD'
        }
      );
    }

    extraCandidates.forEach(function (cand) {
      if (!seenUrls.has(cand.url)) {
        seenUrls.add(cand.url);
        list.push(cand);
      }
    });

    return list;
  };

  window.ctvEnrichMovieServers = function (servers, movieInfo) {
    var list = Array.isArray(servers) ? servers.slice() : [];
    var seenUrls = new Set();
    list.forEach(function (s) {
      var u = (s && (s.url || s.link)) || '';
      if (u) seenUrls.add(u);
    });

    var spServers = list.filter(function (s) {
      var u = (s && (s.url || s.link)) || '';
      return u.indexOf('seriesplayer.fortamomar.workers.dev') >= 0 || u.indexOf('pelisplayer.fortamomar.workers.dev') >= 0;
    });

    spServers.forEach(function (sp) {
      var baseUrl = sp.url || sp.link || '';
      var idioma = sp.idioma || sp.audio || 'LATINO';
      var calidad = sp.calidad || sp.quality || 'HD';
      sp.server_name = 'PELISPLAYER · DIRECTO';

      SERIESPLAYER_MIRRORS.forEach(function (m) {
        var mirrorUrl = addParam(baseUrl, 'ctv_cdn', m.host);
        if (!seenUrls.has(mirrorUrl)) {
          seenUrls.add(mirrorUrl);
          list.push({
            url: mirrorUrl,
            idioma: idioma,
            calidad: calidad,
            server_name: m.name,
            ServerName: m.name
          });
        }
      });
    });

    var tmdbId = movieInfo && (movieInfo.TMDbId || movieInfo.tmdb_id || movieInfo.tmdb);
    var imdbId = movieInfo && (movieInfo.imdb_id || movieInfo.ImdbId || movieInfo.imdb);
    var genre = String((movieInfo && movieInfo.genero) || '').toLowerCase();
    var isAnimeOrFew = genre.indexOf('anime') >= 0 || genre.indexOf('animac') >= 0 || list.length <= 3;

    if (isAnimeOrFew && (tmdbId || imdbId)) {
      var extras = [];
      if (imdbId) {
        extras.push({
          server_name: 'VSEMBED · MULTI',
          url: 'https://vsembed.su/embed/movie?imdb=' + encodeURIComponent(imdbId) + '&ds_lang=es',
          idioma: 'SUBTITULADA',
          calidad: 'HD'
        });
      }
      if (tmdbId) {
        extras.push(
          {
            server_name: 'VIDSRC PRO',
            url: 'https://vidsrc.me/embed/movie?tmdb=' + encodeURIComponent(tmdbId) + '&ds_lang=es',
            idioma: 'SUBTITULADA',
            calidad: 'HD'
          },
          {
            server_name: 'VIDLINK HD',
            url: 'https://vidlink.pro/movie/' + encodeURIComponent(tmdbId),
            idioma: 'SUBTITULADA',
            calidad: 'FHD'
          },
          {
            server_name: 'MULTIEMBED',
            url: 'https://multiembed.mov/?video_id=' + encodeURIComponent(tmdbId) + '&tmdb=1',
            idioma: 'SUBTITULADA',
            calidad: 'HD'
          }
        );
      }
      extras.forEach(function (ex) {
        if (!seenUrls.has(ex.url)) {
          seenUrls.add(ex.url);
          list.push(ex);
        }
      });
    }

    return list;
  };
})();

/* ============================================================================
 * CTV: EXTRACTOR DIRECTO DE VIDEO (.M3U8 / .MP4 + SUBTÍTULOS .VTT) SIN ANUNCIOS
 * Funciona en Windows (.exe), Linux (.AppImage), iOS (.ipa) y Android (.apk)
 * ============================================================================ */
(function () {
  var activeBlobUrls = [];
  var currentSubTracks = [];
  var selectedSubIndex = -1;

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
    var video = document.getElementById('player-video');
    if (video) {
      var tracks = video.querySelectorAll('track');
      for (var i = 0; i < tracks.length; i++) tracks[i].remove();
    }
  }

  window.ctvOnPlayerClose = cleanupSubs;

  // Petición HTTP con Referer personalizado (usa /__ctv_proxy en PC y CapacitorHttp nativo en iOS)
  async function ctvHttpRequest(targetUrl, opts) {
    opts = opts || {};
    var method = (opts.method || 'GET').toUpperCase();
    var ref = opts.referer || 'https://pelisjuanita.com/';
    var contentType = opts.contentType || '';
    var body = opts.body || '';

    // 1. Desktop (Electron local server en 127.0.0.1)
    if (location.hostname === '127.0.0.1' || location.hostname === 'localhost') {
      try {
        var proxyUrl =
          '/__ctv_proxy?url=' + encodeURIComponent(targetUrl) +
          '&ref=' + encodeURIComponent(ref) +
          '&method=' + encodeURIComponent(method) +
          (contentType ? '&ct=' + encodeURIComponent(contentType) : '') +
          (body ? '&body=' + encodeURIComponent(body) : '');
        var r = await fetch(proxyUrl);
        if (r.ok) {
          var j = await r.json();
          if (j && j.body) {
            return { status: j.status || 200, url: j.finalUrl || targetUrl, body: j.body };
          }
        }
      } catch (e) {}
    }

    // 2. iOS / Capacitor nativePromise('CapacitorHttp', 'request', ...)
    try {
      if (window.Capacitor && typeof window.Capacitor.nativePromise === 'function') {
        var headers = {
          'Referer': ref,
          'Origin': 'https://pelisjuanita.com',
          'User-Agent': navigator.userAgent || 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Sec-Fetch-Dest': 'iframe',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'cross-site'
        };
        if (contentType) headers['Content-Type'] = contentType;

        var reqPayload = {
          url: targetUrl,
          method: method,
          headers: headers
        };
        if (body) {
          reqPayload.data = contentType.indexOf('json') >= 0 ? JSON.parse(body) : body;
        }
        var capRes = await window.Capacitor.nativePromise('CapacitorHttp', 'request', reqPayload);
        if (capRes && capRes.data != null) {
          var strData = typeof capRes.data === 'string' ? capRes.data : JSON.stringify(capRes.data);
          return { status: capRes.status || 200, url: capRes.url || targetUrl, body: strData };
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
      return { status: resp.status, url: resp.url || targetUrl, body: txt };
    } catch (e) {
      return { status: 0, url: targetUrl, body: '' };
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

  async function extractDirectStream(rawUrl) {
    try {
      var parsed = new URL(rawUrl);
      var host = parsed.hostname.toLowerCase();
      var forceCdn = parsed.searchParams.get('ctv_cdn') || '';

      // Caso A: VIDARA / VIDARAA (API POST /api/stream)
      if (host.indexOf('vidara') >= 0 && parsed.pathname.indexOf('/e/') === 0) {
        var fcode = parsed.pathname.split('/').filter(Boolean).pop();
        if (fcode) {
          var apiRes = await ctvHttpRequest(parsed.origin + '/api/stream', {
            method: 'POST',
            referer: rawUrl,
            contentType: 'application/json',
            body: JSON.stringify({ filecode: fcode, device: 'mobile', codecs: ['avc1.640028'] })
          });
          if (apiRes.body) {
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
        }
      }

      // Caso B: SAVEFILES (POST /dl)
      if (host.indexOf('savefiles.com') >= 0 && parsed.pathname.indexOf('/e/') === 0) {
        var sfCode = parsed.pathname.split('/').filter(Boolean).pop();
        if (sfCode) {
          var sfRes = await ctvHttpRequest(parsed.origin + '/dl', {
            method: 'POST',
            referer: rawUrl,
            contentType: 'application/x-www-form-urlencoded',
            body: 'op=embed&file_code=' + encodeURIComponent(sfCode) + '&auto=1&referer=https://pelisjuanita.com/'
          });
          if (sfRes.body) {
            var sfBody = unpackPacker(sfRes.body).replace(/\\\//g, '/');
            var sfMatch = sfBody.match(/https?:\/\/[^\s"'<>\\]+\.m3u8[^\s"'<>\\]*/i);
            if (sfMatch) {
              return { url: sfMatch[0], type: 'hls', tracks: [] };
            }
          }
        }
      }

      // Caso C: HGLINK -> VIBUXER mirror
      var targetUrl = rawUrl;
      if (host.indexOf('hglink.to') >= 0) {
        targetUrl = 'https://vibuxer.com' + parsed.pathname + parsed.search;
      }

      var pageRes = await ctvHttpRequest(targetUrl, { referer: 'https://pelisjuanita.com/' });
      if (!pageRes.body) return null;
      var html = pageRes.body;

      // Seguir redirección JS (ej. voe.sx -> susanexpectcare.com)
      var jsRedir = html.match(/window\.location\.href\s*=\s*['"](https?:\/\/[^'"]+)['"]/i);
      if (jsRedir && jsRedir[1] && html.length < 3000) {
        var secondRes = await ctvHttpRequest(jsRedir[1], { referer: targetUrl });
        if (secondRes.body) {
          html = secondRes.body;
          targetUrl = jsRedir[1];
        }
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

      // Caso E: SERIESPLAYER / PELISPLAYER / PACKER (StreamHG, Vibuxer, Morencius, Callistanise, Lulustream, MixDrop)
      var unpacked = unpackPacker(html).replace(/\\\//g, '/');

      // Extraer subtítulos de JWPlayer tracks: [...]
      var tracks = [];
      var tracksMatch = html.match(/tracks\s*:\s*(\[\s*\{[\s\S]*?\}\s*\])/);
      if (tracksMatch) {
        try {
          var rawTracks = JSON.parse(tracksMatch[1]);
          if (Array.isArray(rawTracks)) {
            rawTracks.forEach(function (t) {
              if (t && t.file && (!t.kind || t.kind === 'subtitles' || t.kind === 'captions')) {
                tracks.push({
                  url: t.file,
                  label: t.label || 'Subtítulo',
                  default: !!t.default || String(t.label || '').toLowerCase().indexOf('espa') >= 0
                });
              }
            });
          }
        } catch (e) {}
      }

      var m3u8Match = unpacked.match(/(?:https?:)?\/\/[^\s"'<>\\]+\.m3u8[^\s"'<>\\]*/i);
      if (m3u8Match) {
        var streamUrl = m3u8Match[0];
        if (streamUrl.indexOf('//') === 0) streamUrl = 'https:' + streamUrl;
        if (forceCdn) {
          streamUrl = streamUrl.replace(/^https?:\/\/[^/]+/i, 'https://' + forceCdn);
        }
        return { url: streamUrl, type: 'hls', tracks: tracks };
      }

      // MixDrop / MP4 directo
      var mp4Match = unpacked.match(/(?:https?:)?\/\/[^\s"'<>\\]+\.mp4\?[^\s"'<>\\]*/i);
      if (mp4Match && mp4Match[0].indexOf('bigbuckbunny') < 0) {
        var mp4Url = mp4Match[0];
        if (mp4Url.indexOf('//') === 0) mp4Url = 'https:' + mp4Url;
        return { url: mp4Url, type: 'mp4', tracks: tracks };
      }

      // Fallback para seriesplayer si devolvió HTML válido pero sin match directo
      if (host.indexOf('workers.dev') >= 0 && html.indexOf('<html') >= 0) {
        return { url: rawUrl, type: 'srcdoc', html: html, tracks: [] };
      }
    } catch (e) {
      console.warn('Error extrayendo stream directo:', e);
    }
    return null;
  }

  function applySubtitleSelection(index) {
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
        var res = await ctvHttpRequest(t.url, { referer: 'https://pelisjuanita.com/' });
        if (!res.body || res.body.length < 10) continue;
        var vttText = srtToVtt(res.body);
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
      setTimeout(function () {
        applySubtitleSelection(defaultIdx);
      }, 400);
    }
  }

  function isExtractableServer(url) {
    if (!url) return false;
    var l = String(url).toLowerCase();
    return (
      l.indexOf('workers.dev') >= 0 ||
      l.indexOf('seriesplayer') >= 0 ||
      l.indexOf('pelisplayer') >= 0 ||
      l.indexOf('voe.sx') >= 0 ||
      l.indexOf('vibuxer.com') >= 0 ||
      l.indexOf('hglink.to') >= 0 ||
      l.indexOf('streamwish') >= 0 ||
      l.indexOf('morencius.com') >= 0 ||
      l.indexOf('callistanise.com') >= 0 ||
      l.indexOf('vidhide') >= 0 ||
      l.indexOf('lulustream.com') >= 0 ||
      l.indexOf('lulust.com') >= 0 ||
      l.indexOf('vidara.to') >= 0 ||
      l.indexOf('vidaraa.cc') >= 0 ||
      l.indexOf('savefiles.com') >= 0 ||
      l.indexOf('mixdrop.top') >= 0
    );
  }

  window.ctvPlaySmartEmbed = function (url, title, serverName, slug, resumeKey) {
    var rawUrl = String(url || '');
    if (!rawUrl || rawUrl.indexOf('youtube.com/embed') >= 0) return false;

    // En Android nativo (CTV.apk), si el servidor es SERIESPLAYER, renombrarlo para que EmbedPlayerActivity use su ExoPlayer nativo
    var bridge = window.AndroidBridge;
    var isNativeAndroid = !!(bridge && typeof bridge.playEmbedSlug === 'function');
    if (isNativeAndroid && rawUrl.indexOf('workers.dev') >= 0 && rawUrl.indexOf('ctv_cdn=') < 0) {
      var safeServer = String(serverName || 'DIRECTO').replace(/seriesplayer|pelisplayer/gi, 'DIRECTO');
      if (resumeKey && typeof bridge.playEmbedResume === 'function') {
        bridge.playEmbedResume(title, rawUrl, safeServer, slug || '', resumeKey);
        return true;
      }
      bridge.playEmbedSlug(title, rawUrl, safeServer, slug || '');
      return true;
    }

    if (!isExtractableServer(rawUrl)) {
      return false;
    }

    // Abrir modal en estado de carga limpia y extraer el stream directo sin anuncios
    if (typeof window.__ctvOpenModal === 'function') {
      window.__ctvOpenModal(title + ' · Conectando sin anuncios…');
    }

    extractDirectStream(rawUrl).then(function (res) {
      var modal = document.getElementById('player-modal');
      if (!modal || modal.classList.contains('hidden')) return;

      if (res && res.type === 'hls' && res.url) {
        if (typeof window.__ctvPlayHls === 'function') {
          window.__ctvPlayHls(res.url, title);
          attachSubtitlesToVideo(res.tracks || []);
          return;
        }
      }

      if (res && res.type === 'mp4' && res.url) {
        if (typeof window.__ctvOpenModal === 'function') window.__ctvOpenModal(title);
        var v = document.getElementById('player-video');
        if (v) {
          v.classList.remove('hidden');
          v.src = res.url;
          v.play().catch(function () {});
          v.focus();
          attachSubtitlesToVideo(res.tracks || []);
          return;
        }
      }

      if (res && res.type === 'srcdoc' && res.html) {
        if (typeof window.__ctvOpenModal === 'function') window.__ctvOpenModal(title);
        var f = document.getElementById('player-frame');
        if (f) {
          f.classList.remove('hidden');
          f.srcdoc = res.html;
          f.focus();
          return;
        }
      }

      // Fallback al reproductor original si no se pudo extraer
      if (typeof window.__ctvOrigKh === 'function') {
        window.__ctvOrigKh(rawUrl, title, serverName, slug, resumeKey);
      }
    });

    return true;
  };
})();

/* ============================================================================
 * CTV: COMPROBADOR MULTIPLATAFORMA DE ACTUALIZACIONES DESDE GITHUB RELEASES
 * ============================================================================ */
(function () {
  var GITHUB_LATEST_URL = 'https://api.github.com/repos/Demon11701/CTV-Desktop/releases/latest';
  var ALTSTORE_REPO_URL = 'https://raw.githubusercontent.com/Demon11701/CTV-Desktop/main/altstore-repo.json';
  var CURRENT_VERSION = window.CTV_APP_VERSION || '1.6.0';
  var latestReleaseData = null;

  function parseSemver(v) {
    var clean = String(v || '').replace(/^[^0-9]*/, '').trim();
    var parts = clean.split('.').map(function (n) { return parseInt(n, 10) || 0; });
    while (parts.length < 3) parts.push(0);
    return parts;
  }

  function isNewerVersion(remoteVer, localVer) {
    var r = parseSemver(remoteVer);
    var l = parseSemver(localVer);
    for (var i = 0; i < 3; i++) {
      if (r[i] > l[i]) return true;
      if (r[i] < l[i]) return false;
    }
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
    for (var i = 0; i < assets.length; i++) {
      var a = assets[i];
      if (a && a.name && a.name.toLowerCase().endsWith(ext.toLowerCase()) && a.browser_download_url) {
        return a.browser_download_url;
      }
    }
    return '';
  }

  function showGitHubUpdateModal(release) {
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
        if (location.hostname !== '127.0.0.1' && location.hostname !== 'localhost') {
          window.open(dlUrl, '_blank');
          return;
        }
        if (progressWrap) progressWrap.classList.remove('hidden');
        if (progressLbl) progressLbl.textContent = 'Descargando e instalando automáticamente…';
        btnInstall.disabled = true;

        fetch('/__ctv_self_update?url=' + encodeURIComponent(dlUrl))
          .then(function (r) { return r.json(); })
          .then(function () {
            var poll = setInterval(function () {
              fetch('/__ctv_self_update_status')
                .then(function (r) { return r.json(); })
                .then(function (st) {
                  if (!st) return;
                  var pct = st.percent || 0;
                  if (progressBar) progressBar.style.width = pct + '%';
                  if (progressPct) progressPct.textContent = pct + '%';
                  if (st.state === 'downloading') {
                    if (progressLbl) progressLbl.textContent = 'Descargando actualización… ' + pct + '%';
                  } else if (st.state === 'restarting') {
                    clearInterval(poll);
                    if (progressLbl) progressLbl.textContent = '¡Actualización lista! Reiniciando CTV…';
                  } else if (st.state === 'error') {
                    clearInterval(poll);
                    btnInstall.disabled = false;
                    if (progressLbl) progressLbl.textContent = 'Abriendo descarga directa…';
                    window.open(dlUrl, '_blank');
                  }
                })
                .catch(function () {});
            }, 400);
          })
          .catch(function () {
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
        try {
          sessionStorage.setItem('ctv_gh_update_postponed_' + tag, '1');
        } catch (e) {}
        modal.classList.add('hidden');
      };
    }

    modal.classList.remove('hidden');
    if (btnInstall && btnInstall.focus) btnInstall.focus();
  }

  function checkGitHubRelease(forceModal) {
    fetch(GITHUB_LATEST_URL, {
      headers: { Accept: 'application/vnd.github+json' },
      cache: 'no-store'
    })
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(function (release) {
        if (!release || !release.tag_name) return;
        var remoteTag = release.tag_name;
        if (!forceModal && !isNewerVersion(remoteTag, CURRENT_VERSION)) {
          return;
        }
        latestReleaseData = release;
        var bell = document.getElementById('update-bell');
        if (bell) {
          bell.classList.remove('hidden');
          bell.onclick = function (e) {
            e.preventDefault();
            e.stopPropagation();
            showGitHubUpdateModal(latestReleaseData);
          };
        }
        try {
          if (!forceModal && sessionStorage.getItem('ctv_gh_update_postponed_' + remoteTag)) {
            return;
          }
        } catch (e) {}
        showGitHubUpdateModal(release);
      })
      .catch(function () {});
  }

  window.checkCTVGitHubUpdate = checkGitHubRelease;
  setTimeout(function () {
    checkGitHubRelease(false);
  }, 3000);
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
    if (pFrame && !pFrame.getAttribute('sandbox')) {
      pFrame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-presentation');
      pFrame.setAttribute('referrerpolicy', 'origin');
    }

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
  } catch (e) {}

  function runOtaCode(code) {
    if (!code || window.__ctvOtaExecuted === code) return;
    window.__ctvOtaExecuted = code;
    try {
      var fn = new Function(code);
      fn();
    } catch (e) {
      console.warn('Error ejecutando OTA:', e);
    }
  }

  // 1. Ejecutar caché OTA instantáneamente al arrancar
  try {
    var cached = localStorage.getItem(OTA_CACHE_KEY);
    if (cached) runOtaCode(cached);
  } catch (e) {}

  // 2. Comprobar y descargar última versión OTA desde GitHub en segundo plano
  fetch(OTA_SCRIPT_URL + '?t=' + Date.now(), { cache: 'no-store' })
    .then(function (r) { return r.ok ? r.text() : ''; })
    .then(function (remoteCode) {
      if (!remoteCode || remoteCode.indexOf('CTV_OTA_VERSION') < 0) return;
      try {
        localStorage.setItem(OTA_CACHE_KEY, remoteCode);
      } catch (e) {}
      runOtaCode(remoteCode);
    })
    .catch(function () {});
})();
