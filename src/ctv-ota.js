/* CTV OTA (Over-The-Air) Live Cloud Patch
 * Este archivo se descarga y ejecuta automáticamente desde GitHub (rama main)
 * al abrir CTV en cualquier dispositivo (Windows .exe, Linux .AppImage, iOS .ipa y Android .apk)
 * sin necesidad de reinstalar la aplicación.
 */
(function () {
  window.CTV_OTA_VERSION = '1.6.0-ota.4';

  // 1. Inyectar parche de diseño 100% responsivo universal (Notch/Dynamic Island, barras, grillas y modales)
  try {
    var styleId = 'ctv-ota-responsive-patch';
    var styleEl = document.getElementById(styleId);
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = styleId;
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = [
      ':root{--safe-top:env(safe-area-inset-top,0px);--safe-bottom:env(safe-area-inset-bottom,0px);--safe-left:env(safe-area-inset-left,0px);--safe-right:env(safe-area-inset-right,0px);--page-px:clamp(14px,2.6vw,36px);--detail-px:clamp(16px,2.8vw,34px)}',
      'html,body,.app,.detail-full,.player{width:100%!important;max-width:100vw!important;height:100vh!important;height:100dvh!important;overflow:hidden!important}',
      '.sidebar{gap:clamp(8px,1.2vw,16px)!important;padding:max(10px,calc(var(--safe-top) + 6px)) max(var(--page-px),calc(var(--safe-right) + 14px)) 10px max(var(--page-px),calc(var(--safe-left) + 14px))!important;flex-shrink:0}',
      '.menu{gap:clamp(3px,0.55vw,8px)!important;padding:6px 4px!important;margin:-6px 0!important;scrollbar-width:none}',
      '.menu::-webkit-scrollbar{display:none}',
      '.menu .menu-item,.menu .menu-item:focus,.menu .menu-item:focus-visible,.menu .menu-item.active:focus,.menu .menu-item.active:focus-visible{padding:clamp(6px,0.6vw,8px) clamp(9px,1.15vw,16px)!important;font-size:clamp(.78rem,.95vw,.96rem)!important;min-height:36px}',
      '.sidebar .search{width:clamp(130px,15vw,230px);padding:7px 13px;transition:width .2s ease}',
      '.sidebar .search:focus-within{width:clamp(155px,19vw,260px)}',
      '.filter-bar{padding:8px max(var(--page-px),calc(var(--safe-right) + 14px)) 12px max(var(--page-px),calc(var(--safe-left) + 14px))!important;flex-shrink:0}',
      '.content{padding:10px max(var(--page-px),calc(var(--safe-right) + 14px)) max(44px,calc(var(--safe-bottom) + 24px)) max(var(--page-px),calc(var(--safe-left) + 14px))!important;overflow-x:hidden!important}',
      '.carousel{gap:clamp(12px,1.5vw,20px)!important;padding:14px 6px 22px!important;margin:0!important}',
      '.carousel .card{flex:0 0 clamp(142px,13.5vw,215px);width:clamp(142px,13.5vw,215px)}',
      '.grid{grid-template-columns:repeat(auto-fill,minmax(clamp(136px,13vw,182px),1fr))!important;gap:clamp(12px,1.6vw,22px)!important;padding:12px 6px 28px!important;margin:0!important}',
      '.modal,.filter-modal{padding:max(14px,calc(var(--safe-top) + 10px)) max(14px,calc(var(--safe-right) + 10px)) max(14px,calc(var(--safe-bottom) + 10px)) max(14px,calc(var(--safe-left) + 10px))!important}',
      '.dialog,.filter-dialog{width:min(680px,100%)!important;max-height:calc(100dvh - var(--safe-top) - var(--safe-bottom) - 28px)!important;overflow-y:auto!important;padding:clamp(16px,2.5vw,26px)!important}',
      '.filter-dialog{width:min(820px,100%)!important}',
      '.detail-topbar{padding:max(10px,calc(var(--safe-top) + 8px)) max(var(--detail-px),calc(var(--safe-right) + 14px)) 10px max(var(--detail-px),calc(var(--safe-left) + 14px))!important}',
      '.detail{padding-bottom:max(40px,calc(var(--safe-bottom) + 28px))!important}',
      '.detail-body{gap:clamp(16px,2.4vw,28px)!important;padding:clamp(16px,2.4vw,26px) max(var(--detail-px),calc(var(--safe-right) + 14px)) 16px max(var(--detail-px),calc(var(--safe-left) + 14px))!important}',
      '.detail-servers-head,.season-strip{padding-left:max(var(--detail-px),calc(var(--safe-left) + 14px))!important;padding-right:max(var(--detail-px),calc(var(--safe-right) + 14px))!important}',
      '.episode-grid{grid-template-columns:repeat(auto-fill,minmax(min(210px,100%),1fr))!important;padding:4px max(var(--detail-px),calc(var(--safe-right) + 14px)) 8px max(var(--detail-px),calc(var(--safe-left) + 14px))!important}',
      '.detail .server-list{padding:10px max(var(--detail-px),calc(var(--safe-right) + 14px)) max(32px,calc(var(--safe-bottom) + 24px)) max(var(--detail-px),calc(var(--safe-left) + 14px))!important}',
      '.player-bar{top:max(12px,calc(var(--safe-top) + 8px))!important;left:max(12px,calc(var(--safe-left) + 12px))!important;right:max(12px,calc(var(--safe-right) + 12px))!important;gap:clamp(6px,1.2vw,14px)!important;padding:clamp(7px,1vw,10px) clamp(10px,1.5vw,16px)!important;flex-wrap:nowrap!important}',
      '.player-bar .btn{flex-shrink:0;padding:clamp(6px,0.9vw,9px) clamp(10px,1.4vw,16px)!important;font-size:clamp(.76rem,.9vw,.9rem)!important}',
      '.player-bar #player-title{min-width:40px;font-size:clamp(.82rem,1.05vw,1rem)}',
      '#player-video{object-fit:contain;width:100%;height:100%;max-width:100vw;max-height:100dvh}',
      '.ctv-hero{--h:clamp(220px,40dvh,390px);padding:clamp(18px,2.5vw,28px) clamp(20px,3vw,36px);margin:4px 0 20px}',
      '.ctv-hero-info{min-height:0;gap:clamp(6px,1.1dvh,12px);padding-bottom:10px}',
      '.ctv-hero-title{font-size:clamp(1.35rem,min(3.2vw,5.2dvh),2.8rem)}',
      '@media (orientation:landscape) and (max-height:540px){',
      '  .sidebar{padding:max(6px,calc(var(--safe-top) + 4px)) max(16px,calc(var(--safe-right) + 12px)) 6px max(16px,calc(var(--safe-left) + 12px))!important;gap:8px!important}',
      '  .brand-logo{width:30px!important;height:30px!important}.brand-sub{display:none!important}',
      '  .menu .menu-item,.menu .menu-item:focus,.menu .menu-item:focus-visible,.menu .menu-item.active:focus,.menu .menu-item.active:focus-visible{min-height:32px!important;padding:5px 10px!important;font-size:.8rem!important}',
      '  .ctv-hero{--h:clamp(155px,48dvh,235px)!important;padding:14px 22px 22px!important;margin-bottom:12px!important}',
      '  .ctv-hero-title{font-size:clamp(1.15rem,2.6vw,1.65rem)!important;-webkit-line-clamp:1!important}',
      '  .ctv-hero-btn{padding:6px 16px!important;font-size:.84rem!important}',
      '  .carousel .card{flex:0 0 clamp(114px,14vw,155px)!important;width:clamp(114px,14vw,155px)!important}',
      '}',
      '@media (max-width:860px), (orientation:portrait) and (max-width:1024px){',
      '  .sidebar{padding:max(10px,calc(var(--safe-top) + 6px)) max(14px,calc(var(--safe-right) + 12px)) 10px max(14px,calc(var(--safe-left) + 12px))!important}',
      '  .brand-sub{display:none!important}.sidebar .search,.sidebar .search:focus-within{flex:1 1 auto!important;width:auto!important;min-width:0!important}',
      '  .menu{position:fixed!important;left:0!important;right:0!important;bottom:0!important;z-index:60!important;display:grid!important;grid-template-columns:repeat(7,minmax(0,1fr))!important;align-items:center!important;gap:2px!important;padding:6px max(6px,var(--safe-left)) max(10px,calc(var(--safe-bottom) + 6px)) max(6px,var(--safe-right))!important;margin:0!important;background:rgba(10,11,16,.95)!important;border-top:1px solid rgba(255,255,255,.08)!important;overflow:hidden!important}',
      '  .menu .menu-item:first-child,.menu .menu-item:last-child{margin:0!important}',
      '  .menu .menu-item,.menu .menu-item:focus,.menu .menu-item:focus-visible,.menu .menu-item.active:focus,.menu .menu-item.active:focus-visible{width:100%!important;min-width:0!important;min-height:0!important;flex-direction:column!important;justify-content:center!important;gap:3px!important;padding:5px 2px!important;font-size:clamp(.56rem,2vw,.72rem)!important;background:transparent!important;box-shadow:none!important;transform:none!important}',
      '  .menu .menu-item.active,.menu .menu-item.active:focus,.menu .menu-item.active:focus-visible{color:#fff!important;background:rgba(255,255,255,.08)!important}',
      '  .menu .menu-icon{display:grid!important;width:22px!important;height:22px!important}.menu .menu-icon svg{width:20px!important;height:20px!important}',
      '  .menu .menu-label{width:100%!important;white-space:nowrap!important;text-align:center!important;overflow:hidden!important;text-overflow:ellipsis!important}',
      '  .content{padding:6px max(14px,calc(var(--safe-right) + 12px)) calc(92px + var(--safe-bottom)) max(14px,calc(var(--safe-left) + 12px))!important}',
      '  .carousel .card{flex:0 0 clamp(114px,29vw,155px)!important;width:clamp(114px,29vw,155px)!important}',
      '  .grid{grid-template-columns:repeat(auto-fill,minmax(clamp(102px,26vw,142px),1fr))!important;gap:12px!important}',
      '  .ctv-hero{--h:clamp(240px,42dvh,400px)!important;flex-direction:column!important;justify-content:flex-end!important;padding:18px 18px 32px!important}',
      '  .ctv-hero-poster{display:none!important}.ctv-hero-info{max-width:100%!important}',
      '  .ctv-hero-title{font-size:clamp(1.35rem,min(6.2vw,4.5dvh),2.1rem)!important}',
      '  .detail-body{flex-direction:column!important;align-items:center!important;padding:16px max(16px,calc(var(--safe-right) + 12px)) 14px max(16px,calc(var(--safe-left) + 12px))!important}',
      '  .detail-poster{width:clamp(130px,40vw,200px)!important;align-self:center!important}',
      '  .detail-title{font-size:clamp(1.3rem,5vw,1.65rem)!important;text-align:center}',
      '  .detail-meta,.detail-genre,.detail-actions{justify-content:center}',
      '}'
    ].join('\n');
  } catch (e) {}

  // 2. Adaptar nombres largos del menú en pantallas compactas
  try {
    function adaptLabels() {
      var compact = window.innerWidth <= 860 || (window.innerHeight >= window.innerWidth && window.innerWidth <= 1024);
      var liveLbl = document.querySelector('.menu-item[data-section="live"] .menu-label');
      var agendaLbl = document.querySelector('.menu-item[data-section="agenda"] .menu-label');
      if (liveLbl) liveLbl.textContent = compact ? 'En vivo' : 'TV en vivo';
      if (agendaLbl) agendaLbl.textContent = compact ? 'Agenda' : 'Agenda deportiva';
    }
    window.addEventListener('resize', adaptLabels);
    window.addEventListener('orientationchange', adaptLabels);
    adaptLabels();
  } catch (e) {}

  // 3. Escudo anti-caídas y bypass de límite diario (100 vistas) de PelisJuanita
  try {
    function ctvGetRandomIp() {
      var b1 = Math.floor(Math.random() * 40) + 180;
      var b2 = Math.floor(Math.random() * 200) + 20;
      var b3 = Math.floor(Math.random() * 240) + 10;
      var b4 = Math.floor(Math.random() * 240) + 10;
      return b1 + '.' + b2 + '.' + b3 + '.' + b4;
    }

    window.__ctvCatalog = window.__ctvCatalog || {};
    var _nativeFetch = window.fetch;

    window.fetch = async function (resource, init) {
      var url = typeof resource === 'string' ? resource : (resource && resource.url) || '';
      var isPj = url.indexOf('pelisjuanita.com') >= 0;

      if (!isPj) {
        return _nativeFetch.apply(this, arguments);
      }

      var opts = init ? Object.assign({}, init) : {};
      var headers = opts.headers ? Object.assign({}, opts.headers) : {};
      var rndIp = ctvGetRandomIp();
      headers['X-Forwarded-For'] = rndIp;
      headers['X-Real-IP'] = rndIp;
      headers['Client-IP'] = rndIp;
      opts.headers = headers;

      // 1. Guardar metadatos en catálogo cada vez que se listen películas o series
      var isCatalogList = url.indexOf('/app/movies.php') >= 0 || url.indexOf('/app/series.php') >= 0 || url.indexOf('/app/home.php') >= 0 || url.indexOf('/app/buscar.php') >= 0;
      if (isCatalogList && url.indexOf('slug=') < 0) {
        try {
          var resp = await _nativeFetch.call(this, url, opts);
          var clone = resp.clone();
          clone.json().then(function (j) {
            if (!j) return;
            var items = Array.isArray(j.datos) ? j.datos : (Array.isArray(j) ? j : []);
            if (Array.isArray(j.sections)) {
              j.sections.forEach(function (sec) {
                if (Array.isArray(sec.data)) items = items.concat(sec.data);
              });
            }
            items.forEach(function (it) {
              if (it && it.slug) {
                window.__ctvCatalog[it.slug] = Object.assign(window.__ctvCatalog[it.slug] || {}, it);
              }
            });
          }).catch(function () {});
          return resp;
        } catch (e) {
          return _nativeFetch.apply(this, arguments);
        }
      }

      // 2. Detalle de película: Si da 429 o error, reintentar con nueva IP para obtener TODOS los servidores en Latino
      if (url.indexOf('/app/movies.php?') >= 0 && url.indexOf('slug=') >= 0) {
        for (var mAttempt = 0; mAttempt < 3; mAttempt++) {
          try {
            var mIp = ctvGetRandomIp();
            opts.headers['X-Forwarded-For'] = mIp;
            opts.headers['X-Real-IP'] = mIp;
            opts.headers['Client-IP'] = mIp;

            var mResp = await _nativeFetch.call(this, url, opts);
            if (mResp.status === 200) {
              var mClone = mResp.clone();
              var mJson = await mClone.json().catch(function () { return null; });
              if (mJson && mJson.status !== 'error' && mJson.datos) {
                if (mJson.datos.slug) {
                  window.__ctvCatalog[mJson.datos.slug] = Object.assign(window.__ctvCatalog[mJson.datos.slug] || {}, mJson.datos);
                }
                return mResp;
              }
            }
          } catch (e) {}
        }

        var slugMatch = url.match(/[?&]slug=([^&]+)/);
        var mSlug = slugMatch ? decodeURIComponent(slugMatch[1]) : '';
        var cachedMovie = window.__ctvCatalog[mSlug];
        if (cachedMovie) {
          return new Response(JSON.stringify({ status: 'ok', datos: cachedMovie }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }

      // 3. Detalle de serie: Reintentar con nueva IP para obtener todos los servidores
      if (url.indexOf('/app/series.php?') >= 0 && url.indexOf('slug=') >= 0 && url.indexOf('&t=') < 0) {
        for (var sAttempt = 0; sAttempt < 3; sAttempt++) {
          try {
            var sIp = ctvGetRandomIp();
            opts.headers['X-Forwarded-For'] = sIp;
            opts.headers['X-Real-IP'] = sIp;
            opts.headers['Client-IP'] = sIp;

            var sResp = await _nativeFetch.call(this, url, opts);
            if (sResp.status === 200) {
              var sClone = sResp.clone();
              var sJson = await sClone.json().catch(function () { return null; });
              if (sJson && sJson.status !== 'error' && (sJson.datos || sJson.serie || sJson.episodio)) {
                var sObj = sJson.datos || sJson.serie || sJson.episodio;
                if (sObj && sObj.slug) {
                  window.__ctvCatalog[sObj.slug] = Object.assign(window.__ctvCatalog[sObj.slug] || {}, sObj);
                }
                return sResp;
              }
            }
          } catch (e) {}
        }

        var sSlugMatch = url.match(/[?&]slug=([^&]+)/);
        var sSlug = sSlugMatch ? decodeURIComponent(sSlugMatch[1]) : '';
        var cachedSerie = window.__ctvCatalog[sSlug];
        if (cachedSerie) {
          var synthSerie = Object.assign({}, cachedSerie, {
            temporadas: cachedSerie.temporadas || cachedSerie.temp || 1,
            entransmision: cachedSerie.entransmision || 0
          });
          return new Response(JSON.stringify({ status: 'ok', datos: synthSerie }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }

      // 4. Servidores de episodios: Reintentar con nueva IP para obtener los servidores en Latino
      if (url.indexOf('/app/series.php?') >= 0 && url.indexOf('&t=') >= 0 && url.indexOf('&e=') >= 0) {
        for (var epAttempt = 0; epAttempt < 3; epAttempt++) {
          try {
            var epIp = ctvGetRandomIp();
            opts.headers['X-Forwarded-For'] = epIp;
            opts.headers['X-Real-IP'] = epIp;
            opts.headers['Client-IP'] = epIp;

            var epResp = await _nativeFetch.call(this, url, opts);
            if (epResp.status === 200) {
              var epClone = epResp.clone();
              var epJson = await epClone.json().catch(function () { return null; });
              if (epJson && epJson.status !== 'error' && Array.isArray(epJson.servidores) && epJson.servidores.length) {
                return epResp;
              }
            }
          } catch (e) {}
        }

        return new Response(JSON.stringify({ status: 'ok', servidores: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return _nativeFetch.call(this, url, opts);
    };
  } catch (e) {}

  // 4. Enriquecedor universal de servidores multi-idioma (Películas, Series, Doramas y Anime)
  try {
    function serverRank(s) {
      var lang = ((s && (s.idioma || s.audio)) || '').toUpperCase();
      var name = ((s && (s.server_name || s.ServerName || s['server-name'])) || '').toUpperCase();
      var u = ((s && (s.url || s.link)) || '').toLowerCase();

      // 1. Audio Latino al frente (servidores oficiales de PelisJuanita en Latino)
      if (lang.indexOf('LATIN') >= 0) {
        if (name.indexOf('PELISJUANITA') >= 0 || name.indexOf('DIRECTO') >= 0 || name.indexOf('PELISPLAYER') >= 0 || name.indexOf('SERIESPLAYER') >= 0) return 120;
        if (u.indexOf('voe.sx') >= 0) return 115;
        if (u.indexOf('vibuxer') >= 0 || u.indexOf('streamwish') >= 0) return 114;
        if (u.indexOf('lulustream') >= 0 || u.indexOf('lulust') >= 0) return 113;
        if (u.indexOf('savefiles') >= 0 || u.indexOf('vidara') >= 0 || u.indexOf('mixdrop') >= 0 || u.indexOf('bysesukior') >= 0) return 112;
        return 110;
      }
      // 2. Audio Castellano / Español
      if (lang.indexOf('ESPA') >= 0 || lang.indexOf('CAST') >= 0) {
        if (name.indexOf('PELISJUANITA') >= 0 || name.indexOf('DIRECTO') >= 0 || name.indexOf('PELISPLAYER') >= 0 || name.indexOf('SERIESPLAYER') >= 0) return 98;
        if (u.indexOf('voe.sx') >= 0) return 95;
        if (u.indexOf('vibuxer') >= 0 || u.indexOf('streamwish') >= 0) return 94;
        if (u.indexOf('lulustream') >= 0 || u.indexOf('lulust') >= 0) return 93;
        return 90;
      }
      // 3. Servidores subtitulados / multi-idioma limpios
      if (name.indexOf('PELISJUANITA') >= 0 || name.indexOf('DIRECTO') >= 0 || name.indexOf('PELISPLAYER') >= 0 || name.indexOf('SERIESPLAYER') >= 0) return 88;
      if (name.indexOf('VSEMBED') >= 0 || u.indexOf('vsembed.su') >= 0) return 85;
      if (name.indexOf('VIDSRC') >= 0 || u.indexOf('vidsrc') >= 0) return 84;
      if (name.indexOf('VIDLINK') >= 0 || u.indexOf('vidlink') >= 0) return 83;
      if (name.indexOf('MULTIEMBED') >= 0 || u.indexOf('multiembed') >= 0) return 82;
      if (name.indexOf('2EMBED') >= 0 || u.indexOf('2embed') >= 0) return 81;
      if (name.indexOf('NONTONGO') >= 0 || u.indexOf('nontongo') >= 0) return 80;
      if (u.indexOf('playmogo') >= 0 || u.indexOf('dood') >= 0) return 75;
      return 60;
    }

    window.ctvEnrichSeriesServers = function (servers, serieInfo, slug, season, episode) {
      var list = Array.isArray(servers) ? servers.slice() : [];
      var seenUrls = new Set();
      list.forEach(function (s) {
        var u = (s && (s.url || s.link)) || '';
        if (u) seenUrls.add(u);
      });

      // 1. Mantener servidores oficiales de PelisJuanita (etiquetar SERIESPLAYER como DIRECTO)
      list.forEach(function (s) {
        if (s) {
          var u = (s.url || s.link || '').toLowerCase();
          if (u.indexOf('seriesplayer.fortamomar.workers.dev') >= 0 || u.indexOf('pelisplayer.fortamomar.workers.dev') >= 0) {
            s.server_name = 'PELISJUANITA (DIRECTO)';
          }
        }
      });

      // 2. Agregar servidores multi-embed internacionales/subtitulados para TODAS las series
      var info = serieInfo || (window.__ctvCatalog && window.__ctvCatalog[slug]) || {};
      var tmdbId = info.TMDbId || info.tmdb_id || info.tmdb;
      var imdbId = info.imdb_id || info.ImdbId || info.imdb;
      var t = season || 1;
      var e = episode || 1;

      var extraCandidates = [];
      if (imdbId) {
        extraCandidates.push({
          server_name: 'VSEMBED · MULTI',
          url: 'https://vsembed.su/embed/tv?imdb=' + encodeURIComponent(imdbId) + '&season=' + t + '&episode=' + e + '&ds_lang=es',
          audio: 'SUBTITULADA',
          quality: 'HD'
        });
      } else if (tmdbId) {
        extraCandidates.push({
          server_name: 'VSEMBED · MULTI',
          url: 'https://vsembed.su/embed/tv?tmdb=' + encodeURIComponent(tmdbId) + '&season=' + t + '&episode=' + e + '&ds_lang=es',
          audio: 'SUBTITULADA',
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
          },
          {
            server_name: 'NONTONGO HD',
            url: 'https://www.nontongo.win/embed/tv/' + encodeURIComponent(tmdbId) + '/' + t + '/' + e,
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

      list.sort(function (a, b) {
        return serverRank(b) - serverRank(a);
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

      // 1. Mantener servidores oficiales de PelisJuanita (etiquetar PELISPLAYER como DIRECTO)
      list.forEach(function (s) {
        if (s) {
          var u = (s.url || s.link || '').toLowerCase();
          if (u.indexOf('seriesplayer.fortamomar.workers.dev') >= 0 || u.indexOf('pelisplayer.fortamomar.workers.dev') >= 0) {
            s.server_name = 'PELISJUANITA (DIRECTO)';
          }
        }
      });

      // 2. Agregar servidores multi-embed internacionales para TODAS las películas
      var info = movieInfo || (movieInfo && movieInfo.slug && window.__ctvCatalog && window.__ctvCatalog[movieInfo.slug]) || {};
      var tmdbId = info.TMDbId || info.tmdb_id || info.tmdb;
      var imdbId = info.imdb_id || info.ImdbId || info.imdb;

      var extras = [];
      if (imdbId) {
        extras.push({
          server_name: 'VSEMBED · MULTI',
          url: 'https://vsembed.su/embed/movie?imdb=' + encodeURIComponent(imdbId) + '&ds_lang=es',
          idioma: 'SUBTITULADA',
          calidad: 'HD'
        });
      } else if (tmdbId) {
        extras.push({
          server_name: 'VSEMBED · MULTI',
          url: 'https://vsembed.su/embed/movie?tmdb=' + encodeURIComponent(tmdbId) + '&ds_lang=es',
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
          },
          {
            server_name: '2EMBED SERVER',
            url: 'https://www.2embed.cc/embed/' + encodeURIComponent(tmdbId),
            idioma: 'SUBTITULADA',
            calidad: 'HD'
          },
          {
            server_name: 'NONTONGO HD',
            url: 'https://www.nontongo.win/embed/movie/' + encodeURIComponent(tmdbId),
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

      list.sort(function (a, b) {
        return serverRank(b) - serverRank(a);
      });

      return list;
    };
  } catch (e) {}
})();
