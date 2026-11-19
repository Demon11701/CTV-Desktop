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
    window.__ctvMxFilterMode = window.__ctvMxFilterMode || null;
    window.__ctvMxArchiveEpCache = window.__ctvMxArchiveEpCache || {};

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
        var old = document.getElementById('ctv-fav-toast');
        if (old) old.remove();
        var t = document.createElement('div');
        t.id = 'ctv-fav-toast';
        t.style.cssText = 'position:fixed;left:50%;bottom:max(88px,calc(env(safe-area-inset-bottom,0px) + 74px));transform:translateX(-50%);background:rgba(18,19,28,.96);color:#fff;border:1px solid rgba(255,215,0,.45);box-shadow:0 10px 30px rgba(0,0,0,.75);padding:10px 20px;border-radius:999px;font-weight:700;font-size:.92rem;z-index:100005;pointer-events:none;white-space:nowrap;transition:opacity .25s ease';
        t.textContent = msg;
        document.body.appendChild(t);
        setTimeout(function () {
          if (t && t.parentNode) {
            t.style.opacity = '0';
            setTimeout(function () { if (t && t.parentNode) t.remove(); }, 260);
          }
        }, 2100);
      } catch (e) {}
    }
    window.ctvShowToast = ctvShowToast;

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
      if (kind === 'tv' || kind === 'live') {
        var tvList = ctvReadFavList('pj2_favs_slugs');
        return tvList.indexOf(item.slug) >= 0;
      }
      if (kind === 'serie' || kind === 'series') {
        return ctvReadFavList('pj2_favs_series').some(function (x) { return x && x.slug === item.slug; });
      }
      return ctvReadFavList('pj2_favs_movies').some(function (x) { return x && x.slug === item.slug; });
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
        var favMovieSlugs = new Set(ctvReadFavList('pj2_favs_movies').map(function (x) { return x && x.slug; }).filter(Boolean));
        var favSerieSlugs = new Set(ctvReadFavList('pj2_favs_series').map(function (x) { return x && x.slug; }).filter(Boolean));
        var favTvSlugs = new Set(ctvReadFavList('pj2_favs_slugs'));
        document.querySelectorAll('.card[data-slug], .card.movie').forEach(function (card) {
          var slug = card.getAttribute('data-slug') || (card.__ctvItem && card.__ctvItem.slug) || '';
          if (!slug) return;
          var wrap = card.querySelector('.card-wrap');
          if (!wrap) return;
          var starred = favMovieSlugs.has(slug) || favSerieSlugs.has(slug) || favTvSlugs.has(slug);
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

    var CTV_MX_CATALOG = window.CTV_MX_CATALOG || [
      {
        slug: 'ctv-mx-lola-la-trailera-1983',
        titulo: 'Lola la Trailera',
        nombre: 'Lola la Trailera',
        año: '1983',
        anio: '1983',
        fecha_estreno: '1983-11-17',
        duracion: '94',
        calidad: 'HD',
        votos: '8.8',
        isTop: true,
        tipo: 'pelicula',
        mx_cat: 'accion',
        origin_country: 'MX',
        TMDbId: '295152',
        imdb_id: 'tt0085860',
        genero: 'Acción, Cine Mexicano, Drama, Crimen',
        direccion: 'Raúl Fernández',
        reparto: 'Rosa Gloria Chagoyán, Rolando Fernández, Irma Serrano «La Tigresa», Emilio Fernández, Miguel Manzano',
        sinopsis: 'Lola hereda el tráiler de su padre tras ser asesinado por una banda de narcotraficantes al negarse a transportar droga. Con su fiel camión y acompañada del detective Jorge, Lola decide enfrentarse a los criminales en las carreteras de México. La película más taquillera de la historia del cine mexicano.',
        img_frente: 'https://s2.dmcdn.net/v/YA_sm1g4OriMWoER_/x480',
        imagen: 'https://s2.dmcdn.net/v/YA_sm1g4OriMWoER_/x480',
        img_fondo: 'https://upload.wikimedia.org/wikipedia/commons/5/54/3_Premier_Lola_La_Trailera.jpeg',
        servidores: [
          { server_name: 'SERVIDOR CINE MX · REMASTERIZADA HD', url: 'https://www.dailymotion.com/embed/video/x9hbzjk?autoplay=1', idioma: 'LATINO', calidad: 'HD' },
          { server_name: 'ARCHIVE MX · RESPALDO', url: 'https://archive.org/download/maten-al-fugitivo-1986-vhs-aka-la-fugo-de-caro/Maten%20al%20Fugitivo%20(1986%2C%20VHS)%20AKA%20La%20Fugo%20de%20Caro.ia.mp4', idioma: 'LATINO', calidad: 'HD' }
        ]
      },
      {
        slug: 'ctv-mx-lola-la-trailera-2-el-secuestro-de-lola',
        titulo: 'Lola la Trailera 2: El Secuestro de Lola',
        nombre: 'Lola la Trailera 2: El Secuestro de Lola',
        año: '1985',
        anio: '1985',
        fecha_estreno: '1985-08-15',
        duracion: '92',
        calidad: 'HD',
        votos: '8.4',
        isTop: true,
        tipo: 'pelicula',
        mx_cat: 'accion',
        origin_country: 'MX',
        genero: 'Acción, Cine Mexicano, Aventura',
        direccion: 'Raúl Fernández',
        reparto: 'Rosa Gloria Chagoyán, Rolando Fernández, Frank Moro, Isela Vega, Joaquín Cordero',
        sinopsis: 'Secuela del clásico mexicano Lola la Trailera. Los narcotraficantes buscan venganza y tienden una trampa para secuestrar a Lola, desatando una persecución implacable de tráileres y acción explosiva.',
        img_frente: 'https://upload.wikimedia.org/wikipedia/commons/5/54/3_Premier_Lola_La_Trailera.jpeg',
        imagen: 'https://upload.wikimedia.org/wikipedia/commons/5/54/3_Premier_Lola_La_Trailera.jpeg',
        img_fondo: 'https://s2.dmcdn.net/v/YA_sm1g4OriMWoER_/x480',
        servidores: [
          { server_name: 'ARCHIVE MX · DIRECTO MP4', url: 'https://archive.org/download/maten-al-fugitivo-1986-vhs-aka-la-fugo-de-caro/Maten%20al%20Fugitivo%20(1986%2C%20VHS)%20AKA%20La%20Fugo%20de%20Caro.ia.mp4', idioma: 'LATINO', calidad: 'HD' },
          { server_name: 'SERVIDOR CINE MX · COLECCIÓN LOLA', url: 'https://www.dailymotion.com/embed/video/x9hbzjk?autoplay=1', idioma: 'LATINO', calidad: 'HD' }
        ]
      },
      {
        slug: 'ctv-mx-lola-la-trailera-3-el-gran-reto',
        titulo: 'Lola la Trailera 3: El Gran Reto (La Fuga de Caro)',
        nombre: 'Lola la Trailera 3: El Gran Reto (La Fuga de Caro)',
        año: '1986',
        anio: '1986',
        fecha_estreno: '1986-10-12',
        duracion: '93',
        calidad: 'HD',
        votos: '8.5',
        isTop: true,
        tipo: 'pelicula',
        mx_cat: 'accion',
        origin_country: 'MX',
        imdb_id: 'tt0357896',
        genero: 'Acción, Cine Mexicano, Policiaco',
        direccion: 'Raúl Fernández',
        reparto: 'Rosa Gloria Chagoyán, Rolando Fernández, Frank Moro',
        sinopsis: 'Tercera entrega de la saga de acción de Rosa Gloria Chagoyán y Rolando Fernández. El narcotraficante más peligroso del país es perseguido por la policía en una misión de alto riesgo por las carreteras mexicanas.',
        img_frente: 'https://archive.org/services/img/maten-al-fugitivo-1986-vhs-aka-la-fugo-de-caro',
        imagen: 'https://archive.org/services/img/maten-al-fugitivo-1986-vhs-aka-la-fugo-de-caro',
        img_fondo: 'https://archive.org/services/img/maten-al-fugitivo-1986-vhs-aka-la-fugo-de-caro',
        servidores: [
          { server_name: 'ARCHIVE MX · DIRECTO MP4', url: 'https://archive.org/download/maten-al-fugitivo-1986-vhs-aka-la-fugo-de-caro/Maten%20al%20Fugitivo%20(1986%2C%20VHS)%20AKA%20La%20Fugo%20de%20Caro.ia.mp4', idioma: 'LATINO', calidad: 'HD' }
        ]
      },
      {
        slug: 'ctv-mx-la-guerrera-vengadora-1988',
        titulo: 'La Guerrera Vengadora',
        nombre: 'La Guerrera Vengadora',
        año: '1988',
        anio: '1988',
        fecha_estreno: '1988-05-20',
        duracion: '90',
        calidad: 'HD',
        votos: '8.3',
        tipo: 'pelicula',
        mx_cat: 'accion',
        origin_country: 'MX',
        genero: 'Acción, Cine Mexicano',
        direccion: 'Raúl Fernández',
        reparto: 'Rosa Gloria Chagoyán, Rolando Fernández, Joaquín Cordero, Raúl Araiza',
        sinopsis: 'Protagonizada por Rosa Gloria Chagoyán (Lola la Trailera). Una experta motociclista combate a una banda criminal que aterroriza la ciudad.',
        img_frente: 'https://archive.org/services/img/LaGuerreraVengadora',
        imagen: 'https://archive.org/services/img/LaGuerreraVengadora',
        img_fondo: 'https://archive.org/services/img/LaGuerreraVengadora',
        servidores: [
          { server_name: 'ARCHIVE MX · DIRECTO MP4', url: 'https://archive.org/download/LaGuerreraVengadora/La%20Guerrera%20Vengadora.mp4', idioma: 'LATINO', calidad: 'HD' },
          { server_name: 'SERVIDOR CINE MX · HD', url: 'https://www.dailymotion.com/embed/video/x99u3ge?autoplay=1', idioma: 'LATINO', calidad: 'HD' }
        ]
      },
      {
        slug: 'ctv-mx-la-banda-del-carro-rojo-1978',
        titulo: 'La Banda del Carro Rojo',
        nombre: 'La Banda del Carro Rojo',
        año: '1978',
        anio: '1978',
        fecha_estreno: '1978-03-16',
        duracion: '92',
        calidad: 'HD',
        votos: '8.7',
        isTop: true,
        tipo: 'pelicula',
        mx_cat: 'accion',
        origin_country: 'MX',
        genero: 'Acción, Cine Mexicano, Frontera, Drama',
        direccion: 'Rubén Galindo',
        reparto: 'Mario Almada, Fernando Almada, Pedro Infante Jr., Los Tigres del Norte',
        sinopsis: 'Basada en el famoso corrido de Los Tigres del Norte. Dos hermanos entran al contrabando fronterizo a bordo de su legendario carro rojo para salvar a su familia.',
        img_frente: 'https://archive.org/services/img/la-banda-del-carro-rojo-1978-fullscreen',
        imagen: 'https://archive.org/services/img/la-banda-del-carro-rojo-1978-fullscreen',
        img_fondo: 'https://archive.org/services/img/la-banda-del-carro-rojo-1978-fullscreen',
        servidores: [
          { server_name: 'ARCHIVE MX · DIRECTO MP4', url: 'https://archive.org/download/la-banda-del-carro-rojo-1978-fullscreen/la%20banda%20del%20carro%20rojo%201978%20fullscreen.mp4', idioma: 'LATINO', calidad: 'HD' }
        ]
      },
      {
        slug: 'ctv-mx-el-arracadas-1978',
        titulo: 'El Arracadas',
        nombre: 'El Arracadas',
        año: '1978',
        anio: '1978',
        fecha_estreno: '1978-09-21',
        duracion: '95',
        calidad: 'HD',
        votos: '8.6',
        isTop: true,
        tipo: 'pelicula',
        mx_cat: 'accion',
        origin_country: 'MX',
        genero: 'Acción, Ranchera, Cine Mexicano',
        direccion: 'Alberto Mariscal',
        reparto: 'Vicente Fernández, Mario Almada, Fernando Almada, Patricia Rivera',
        sinopsis: 'Mariano Landeros (Vicente Fernández) jura vengar la muerte de su padre cumpliendo la promesa de colocar una arracada de oro en la oreja de cada uno de los asesinos.',
        img_frente: 'https://archive.org/services/img/el-arracadas_202206',
        imagen: 'https://archive.org/services/img/el-arracadas_202206',
        img_fondo: 'https://archive.org/services/img/el-arracadas_202206',
        servidores: [
          { server_name: 'ARCHIVE MX · DIRECTO MP4 HD', url: 'https://archive.org/download/el-arracadas_202206/el%20arracadas.mp4', idioma: 'LATINO', calidad: 'HD' }
        ]
      },
      {
        slug: 'ctv-mx-pistoleros-famosos-1981',
        titulo: 'Pistoleros Famosos',
        nombre: 'Pistoleros Famosos',
        año: '1981',
        anio: '1981',
        fecha_estreno: '1981-05-14',
        duracion: '90',
        calidad: 'HD',
        votos: '8.4',
        tipo: 'pelicula',
        mx_cat: 'accion',
        origin_country: 'MX',
        genero: 'Acción, Western, Cine Mexicano',
        direccion: 'José Loza',
        reparto: 'Mario Almada, Fernando Almada, Álvaro Zermeño, Los Cadetes de Linares',
        sinopsis: 'Clásico del cine de acción norteño protagonizado por los hermanos Mario y Fernando Almada, inspirado en los corridos de pistoleros legendarios.',
        img_frente: 'https://archive.org/services/img/copia-de-pistoleros-famosos-1981-1080p',
        imagen: 'https://archive.org/services/img/copia-de-pistoleros-famosos-1981-1080p',
        img_fondo: 'https://archive.org/services/img/copia-de-pistoleros-famosos-1981-1080p',
        servidores: [
          { server_name: 'ARCHIVE MX · 1080P DIRECTO MP4', url: 'https://archive.org/download/copia-de-pistoleros-famosos-1981-1080p/Copia%20de%20Pistoleros%20Famosos%20(1981)%201080p.mp4', idioma: 'LATINO', calidad: 'FHD' }
        ]
      },
      {
        slug: 'ctv-mx-tierra-de-sangre-1992',
        titulo: 'Tierra de Sangre: El Corrido de los Pérez',
        nombre: 'Tierra de Sangre: El Corrido de los Pérez',
        año: '1992',
        anio: '1992',
        fecha_estreno: '1992-04-10',
        duracion: '90',
        calidad: 'HD',
        votos: '8.1',
        tipo: 'pelicula',
        mx_cat: 'accion',
        origin_country: 'MX',
        genero: 'Acción, Cine Mexicano',
        direccion: 'José Loza',
        reparto: 'Mario Almada, Eleazar García Jr., Alfredo Gutiérrez',
        sinopsis: 'Una disputa de honor y tierras desata un enfrentamiento armado en el norte de México.',
        img_frente: 'https://archive.org/services/img/copia-de-tierra-de-sangre-el-corrido-de-los-perez-1993-1080p',
        imagen: 'https://archive.org/services/img/copia-de-tierra-de-sangre-el-corrido-de-los-perez-1993-1080p',
        img_fondo: 'https://archive.org/services/img/copia-de-tierra-de-sangre-el-corrido-de-los-perez-1993-1080p',
        servidores: [
          { server_name: 'ARCHIVE MX · 1080P DIRECTO MP4', url: 'https://archive.org/download/copia-de-tierra-de-sangre-el-corrido-de-los-perez-1993-1080p/Copia%20de%20Tierra%20de%20Sangre%20(El%20Corrido%20de%20los%20P%C3%A9rez)%20(1993)%201080p.mp4', idioma: 'LATINO', calidad: 'FHD' }
        ]
      },
      {
        slug: 'ctv-mx-las-pobres-ilegales-1982',
        titulo: 'Las Pobres Ilegales',
        nombre: 'Las Pobres Ilegales',
        año: '1982',
        anio: '1982',
        fecha_estreno: '1982-06-18',
        duracion: '88',
        calidad: 'HD',
        votos: '8.0',
        tipo: 'pelicula',
        mx_cat: 'accion',
        origin_country: 'MX',
        genero: 'Drama, Acción, Cine Mexicano',
        direccion: 'Alberto Mariscal',
        reparto: 'Mario Almada, Carmen Cardenal, Ana Luisa Peluffo',
        sinopsis: 'Un grupo de mujeres mexicanas cruza la frontera en busca de un futuro mejor, enfrentando peligros y abusos en el camino.',
        img_frente: 'https://archive.org/services/img/l-4s-pobres-ilegales-1982-1080p',
        imagen: 'https://archive.org/services/img/l-4s-pobres-ilegales-1982-1080p',
        img_fondo: 'https://archive.org/services/img/l-4s-pobres-ilegales-1982-1080p',
        servidores: [
          { server_name: 'ARCHIVE MX · 1080P DIRECTO MP4', url: 'https://archive.org/download/l-4s-pobres-ilegales-1982-1080p/L4s%20Pobres%20ilegales%20(1982)%201080p.mp4', idioma: 'LATINO', calidad: 'FHD' }
        ]
      },
      {
        slug: 'ctv-mx-en-defensa-propia-almada',
        titulo: 'En Defensa Propia',
        nombre: 'En Defensa Propia',
        año: '1990',
        anio: '1990',
        fecha_estreno: '1990-01-01',
        duracion: '93',
        calidad: 'HD',
        votos: '8.2',
        tipo: 'pelicula',
        mx_cat: 'accion',
        origin_country: 'MX',
        genero: 'Acción, Cine Mexicano',
        direccion: 'Cine Mexicano',
        reparto: 'Mario Almada',
        sinopsis: 'Un hombre pacífico se ve obligado a tomar las armas en defensa propia para proteger a su familia de una banda criminal.',
        img_frente: 'https://s1.dmcdn.net/v/XoLu01dynMfywRO3e/x480',
        imagen: 'https://s1.dmcdn.net/v/XoLu01dynMfywRO3e/x480',
        img_fondo: 'https://s1.dmcdn.net/v/XoLu01dynMfywRO3e/x480',
        servidores: [
          { server_name: 'SERVIDOR CINE MX · DIRECTO HD', url: 'https://www.dailymotion.com/embed/video/x9dhgcg?autoplay=1', idioma: 'LATINO', calidad: 'HD' }
        ]
      },
      {
        slug: 'ctv-mx-treinta-segundos-para-morir',
        titulo: 'Treinta Segundos Para Morir',
        nombre: 'Treinta Segundos Para Morir',
        año: '1989',
        anio: '1989',
        fecha_estreno: '1989-01-01',
        duracion: '94',
        calidad: 'HD',
        votos: '8.3',
        tipo: 'pelicula',
        mx_cat: 'accion',
        origin_country: 'MX',
        genero: 'Acción, Cine Mexicano',
        direccion: 'Cine Mexicano',
        reparto: 'Mario Almada, Fernando Almada',
        sinopsis: 'Acción explosiva con los hermanos Mario y Fernando Almada enfrentándose al crimen organizado.',
        img_frente: 'https://s2.dmcdn.net/v/f-JKA1g_5EOg9eiIR/x480',
        imagen: 'https://s2.dmcdn.net/v/f-JKA1g_5EOg9eiIR/x480',
        img_fondo: 'https://s2.dmcdn.net/v/f-JKA1g_5EOg9eiIR/x480',
        servidores: [
          { server_name: 'SERVIDOR CINE MX · DIRECTO HD', url: 'https://www.dailymotion.com/embed/video/xbn9ekq?autoplay=1', idioma: 'LATINO', calidad: 'HD' }
        ]
      },
      {
        slug: 'ctv-mx-contrabando-humano-almada',
        titulo: 'Contrabando Humano',
        nombre: 'Contrabando Humano',
        año: '1988',
        anio: '1988',
        fecha_estreno: '1988-01-01',
        duracion: '90',
        calidad: 'HD',
        votos: '8.1',
        tipo: 'pelicula',
        mx_cat: 'accion',
        origin_country: 'MX',
        genero: 'Acción, Frontera, Cine Mexicano',
        direccion: 'Cine Mexicano',
        reparto: 'Mario Almada, Fernando Almada, Chelo',
        sinopsis: 'Drama y acción en la frontera norte con Mario y Fernando Almada luchando contra traficantes de personas.',
        img_frente: 'https://s2.dmcdn.net/v/gCD2E1gyV-P-XvcwO/x480',
        imagen: 'https://s2.dmcdn.net/v/gCD2E1gyV-P-XvcwO/x480',
        img_fondo: 'https://s2.dmcdn.net/v/gCD2E1gyV-P-XvcwO/x480',
        servidores: [
          { server_name: 'SERVIDOR CINE MX · DIRECTO HD', url: 'https://www.dailymotion.com/embed/video/xbpfij2?autoplay=1', idioma: 'LATINO', calidad: 'HD' }
        ]
      },
      {
        slug: 'ctv-mx-lo-negro-del-negro-durazo-1983',
        titulo: 'Lo Negro del Negro Durazo',
        nombre: 'Lo Negro del Negro Durazo',
        año: '1983',
        anio: '1983',
        fecha_estreno: '1983-01-01',
        duracion: '95',
        calidad: 'HD',
        votos: '8.0',
        tipo: 'pelicula',
        mx_cat: 'accion',
        origin_country: 'MX',
        genero: 'Crimen, Biografía, Cine Mexicano',
        direccion: 'Benjamín Escamilla',
        reparto: 'Humberto Elizondo, Ivonne Govea',
        sinopsis: 'Basada en el famoso libro sobre la corrupción policial en la Ciudad de México durante los años 70 y 80.',
        img_frente: 'https://archive.org/services/img/LoNegroDelNegroDurazo1983CineMexicano',
        imagen: 'https://archive.org/services/img/LoNegroDelNegroDurazo1983CineMexicano',
        img_fondo: 'https://archive.org/services/img/LoNegroDelNegroDurazo1983CineMexicano',
        servidores: [
          { server_name: 'ARCHIVE MX · DIRECTO MP4', url: 'https://archive.org/download/LoNegroDelNegroDurazo1983CineMexicano/Lo%20Negro%20Del%20Negro%20Durazo%201983%20-Cine%20Mexicano.mp4', idioma: 'LATINO', calidad: 'HD' }
        ]
      },
      {
        slug: 'ctv-mx-el-barrendero-1982-cantinflas',
        titulo: 'El Barrendero (Cantinflas)',
        nombre: 'El Barrendero (Cantinflas)',
        año: '1982',
        anio: '1982',
        fecha_estreno: '1982-08-05',
        duracion: '98',
        calidad: 'HD',
        votos: '8.9',
        isTop: true,
        tipo: 'pelicula',
        mx_cat: 'comedia',
        origin_country: 'MX',
        genero: 'Comedia, Cine Mexicano, Familia',
        direccion: 'Miguel M. Delgado',
        reparto: 'Mario Moreno «Cantinflas», María Sorté, Úrsula Prats, Roxana Chávez',
        sinopsis: 'Napoleón (Cantinflas) es un humilde y alegre barrendero público que se convierte en el único testigo del robo de un valioso cuadro y debe cuidar a un bebé abandonado en la basura.',
        img_frente: 'https://archive.org/services/img/1982-el-barrendero',
        imagen: 'https://archive.org/services/img/1982-el-barrendero',
        img_fondo: 'https://archive.org/services/img/1982-el-barrendero',
        servidores: [
          { server_name: 'ARCHIVE MX · DIRECTO MP4', url: 'https://archive.org/download/1982-el-barrendero/(1982)%20El%20Barrendero.mp4', idioma: 'LATINO', calidad: 'HD' }
        ]
      },
      {
        slug: 'ctv-mx-el-profe-1971-cantinflas',
        titulo: 'El Profe (Cantinflas)',
        nombre: 'El Profe (Cantinflas)',
        año: '1971',
        anio: '1971',
        fecha_estreno: '1971-07-15',
        duracion: '115',
        calidad: 'HD',
        votos: '8.8',
        isTop: true,
        tipo: 'pelicula',
        mx_cat: 'comedia',
        origin_country: 'MX',
        genero: 'Comedia, Cine Mexicano, Familia',
        direccion: 'Miguel M. Delgado',
        reparto: 'Mario Moreno «Cantinflas», Marga López, Arturo de Córdova, Ramón Valdés',
        sinopsis: 'Sócrates García (Cantinflas) es enviado como maestro rural al pueblo de El Romeral, donde deberá enfrentarse al cacique local para defender la escuela de los niños.',
        img_frente: 'https://archive.org/services/img/cantinflas-el-profe-1971',
        imagen: 'https://archive.org/services/img/cantinflas-el-profe-1971',
        img_fondo: 'https://archive.org/services/img/cantinflas-el-profe-1971',
        servidores: [
          { server_name: 'ARCHIVE MX · DIRECTO MP4', url: 'https://archive.org/download/cantinflas-el-profe-1971/Cantinflas%20El%20profe%20(1971).mp4', idioma: 'LATINO', calidad: 'HD' }
        ]
      },
      {
        slug: 'ctv-mx-el-padrecito-1964-cantinflas',
        titulo: 'El Padrecito (Cantinflas)',
        nombre: 'El Padrecito (Cantinflas)',
        año: '1964',
        anio: '1964',
        fecha_estreno: '1964-09-03',
        duracion: '126',
        calidad: 'HD',
        votos: '8.9',
        isTop: true,
        tipo: 'pelicula',
        mx_cat: 'comedia',
        origin_country: 'MX',
        genero: 'Comedia, Cine Mexicano',
        direccion: 'Miguel M. Delgado',
        reparto: 'Mario Moreno «Cantinflas», Ángel Garasa, Rosa María Vázquez',
        sinopsis: 'El joven padre Sebastián (Cantinflas) llega a una parroquia de pueblo con métodos poco convencionales y mucho ingenio para ayudar a los habitantes.',
        img_frente: 'https://archive.org/services/img/ElPadrecito_201806',
        imagen: 'https://archive.org/services/img/ElPadrecito_201806',
        img_fondo: 'https://archive.org/services/img/ElPadrecito_201806',
        servidores: [
          { server_name: 'ARCHIVE MX · DIRECTO MP4', url: 'https://archive.org/download/ElPadrecito_201806/El%20Padrecito.mp4', idioma: 'LATINO', calidad: 'HD' }
        ]
      },
      {
        slug: 'ctv-mx-sube-y-baja-1959-cantinflas',
        titulo: 'Sube y Baja (Cantinflas)',
        nombre: 'Sube y Baja (Cantinflas)',
        año: '1959',
        anio: '1959',
        fecha_estreno: '1959-01-01',
        duracion: '105',
        calidad: 'HD',
        votos: '8.7',
        tipo: 'pelicula',
        mx_cat: 'comedia',
        origin_country: 'MX',
        genero: 'Comedia, Cine Mexicano',
        direccion: 'Miguel M. Delgado',
        reparto: 'Mario Moreno «Cantinflas», Teresa Velázquez, Joaquín García «Borolas»',
        sinopsis: 'Cantinflas trabaja como ascensorista en una gran tienda departamental y por accidente es confundido con un famoso deportista internacional en Acapulco.',
        img_frente: 'https://archive.org/services/img/CantinflasSubeYBaja',
        imagen: 'https://archive.org/services/img/CantinflasSubeYBaja',
        img_fondo: 'https://archive.org/services/img/CantinflasSubeYBaja',
        servidores: [
          { server_name: 'ARCHIVE MX · DIRECTO MP4', url: 'https://archive.org/download/CantinflasSubeYBaja/Cantinflas%20sube%20y%20baja.mp4', idioma: 'LATINO', calidad: 'HD' }
        ]
      },
      {
        slug: 'ctv-mx-caballero-a-la-medida-cantinflas',
        titulo: 'Caballero a la Medida (Cantinflas)',
        nombre: 'Caballero a la Medida (Cantinflas)',
        año: '1954',
        anio: '1954',
        fecha_estreno: '1954-04-17',
        duracion: '100',
        calidad: 'HD',
        votos: '8.6',
        tipo: 'pelicula',
        mx_cat: 'comedia',
        origin_country: 'MX',
        genero: 'Comedia, Cine Mexicano',
        direccion: 'Miguel M. Delgado',
        reparto: 'Mario Moreno «Cantinflas», Martha Valdés, Ángel Garasa',
        sinopsis: 'Un humilde modelo de sastrería vive cómicas aventuras al vestir un elegante frac mientras ayuda a una obra de caridad.',
        img_frente: 'https://archive.org/services/img/Cantinflas.Por.Mis.Pistolas.1968.completa',
        imagen: 'https://archive.org/services/img/Cantinflas.Por.Mis.Pistolas.1968.completa',
        img_fondo: 'https://archive.org/services/img/Cantinflas.Por.Mis.Pistolas.1968.completa',
        servidores: [
          { server_name: 'ARCHIVE MX · DIRECTO MP4', url: 'https://archive.org/download/Cantinflas.Por.Mis.Pistolas.1968.completa/CANTINFLAS.CABALLERO.A.LA.MEDIDA.mp4', idioma: 'LATINO', calidad: 'HD' }
        ]
      },
      {
        slug: 'ctv-mx-la-india-maria-la-presidenta-municipal',
        titulo: 'La India María: La Presidenta Municipal',
        nombre: 'La India María: La Presidenta Municipal',
        año: '1975',
        anio: '1975',
        fecha_estreno: '1975-05-01',
        duracion: '92',
        calidad: 'HD',
        votos: '8.7',
        isTop: true,
        tipo: 'pelicula',
        mx_cat: 'comedia',
        origin_country: 'MX',
        genero: 'Comedia, Cine Mexicano, Familia',
        direccion: 'Fernando Cortés',
        reparto: 'María Elena Velasco «La India María», Adalberto Martínez «Resortes», Pancho Córdova',
        sinopsis: 'María Nicolasa gana por accidente las elecciones de su pueblo y se convierte en Presidenta Municipal, enfrentando con humor e ingenio a los políticos corruptos.',
        img_frente: 'https://archive.org/services/img/LaIndiaMariaLaPresidentaMunicipal',
        imagen: 'https://archive.org/services/img/LaIndiaMariaLaPresidentaMunicipal',
        img_fondo: 'https://archive.org/services/img/LaIndiaMariaLaPresidentaMunicipal',
        servidores: [
          { server_name: 'ARCHIVE MX · DIRECTO MP4', url: 'https://archive.org/download/LaIndiaMariaLaPresidentaMunicipal/La%20India%20Maria%20La%20Presidenta%20Municipal.mp4', idioma: 'LATINO', calidad: 'HD' }
        ]
      },
      {
        slug: 'ctv-mx-nosotros-los-pobres-1948',
        titulo: 'Nosotros los Pobres (Pedro Infante)',
        nombre: 'Nosotros los Pobres (Pedro Infante)',
        año: '1948',
        anio: '1948',
        fecha_estreno: '1948-03-25',
        duracion: '128',
        calidad: 'HD',
        votos: '9.2',
        isTop: true,
        tipo: 'pelicula',
        mx_cat: 'oro',
        origin_country: 'MX',
        genero: 'Drama, Romance, Época de Oro, Cine Mexicano',
        direccion: 'Ismael Rodríguez',
        reparto: 'Pedro Infante, Blanca Estela Pavón, Evita Muñoz «Chachita», Carmen Montejo',
        sinopsis: 'Obra maestra de la Época de Oro del cine mexicano. Pepe el Toro (Pedro Infante), un humilde carpintero de barrio, lucha contra la injusticia para sacar adelante a su hija Chachita junto a su amada Celia «La Chorreada».',
        img_frente: 'https://archive.org/services/img/NosotrosLosPobres',
        imagen: 'https://archive.org/services/img/NosotrosLosPobres',
        img_fondo: 'https://archive.org/services/img/NosotrosLosPobres',
        servidores: [
          { server_name: 'ARCHIVE MX · DIRECTO MP4', url: 'https://archive.org/download/NosotrosLosPobres/Nosotros%20los%20pobres.mp4', idioma: 'LATINO', calidad: 'HD' }
        ]
      },
      {
        slug: 'ctv-mx-los-tres-huastecos-1948',
        titulo: 'Los Tres Huastecos (Pedro Infante)',
        nombre: 'Los Tres Huastecos (Pedro Infante)',
        año: '1948',
        anio: '1948',
        fecha_estreno: '1948-08-05',
        duracion: '120',
        calidad: 'HD',
        votos: '9.0',
        isTop: true,
        tipo: 'pelicula',
        mx_cat: 'oro',
        origin_country: 'MX',
        genero: 'Comedia, Drama, Época de Oro, Cine Mexicano',
        direccion: 'Ismael Rodríguez',
        reparto: 'Pedro Infante, Blanca Estela Pavón, María Eugenia Llamas «La Tucita», Fernando Soto «Mantequilla»',
        sinopsis: 'Pedro Infante interpreta simultáneamente a tres hermanos trillizos criados por separado en tres pueblos de la Huasteca: un cura, un capitán del ejército y un bandido.',
        img_frente: 'https://archive.org/services/img/LosTresHuastecos1948',
        imagen: 'https://archive.org/services/img/LosTresHuastecos1948',
        img_fondo: 'https://archive.org/services/img/LosTresHuastecos1948',
        servidores: [
          { server_name: 'ARCHIVE MX · DIRECTO MP4', url: 'https://archive.org/download/LosTresHuastecos1948/Los%20Tres%20Huastecos%20-%201948.m4v', idioma: 'LATINO', calidad: 'HD' }
        ]
      },
      {
        slug: 'ctv-mx-los-tres-garcia-1947',
        titulo: 'Los Tres García (Pedro Infante)',
        nombre: 'Los Tres García (Pedro Infante)',
        año: '1947',
        anio: '1947',
        fecha_estreno: '1947-08-13',
        duracion: '118',
        calidad: 'HD',
        votos: '9.0',
        tipo: 'pelicula',
        mx_cat: 'oro',
        origin_country: 'MX',
        genero: 'Comedia, Ranchera, Época de Oro, Cine Mexicano',
        direccion: 'Ismael Rodríguez',
        reparto: 'Pedro Infante, Sara García, Abel Salazar, Víctor Manuel Mendoza, Marga López',
        sinopsis: 'Tres primos pendencieros que llevan el mismo nombre son mantenidos a raya por su enérgica abuela Doña Luisa (Sara García), hasta que llega su prima Lupita y los tres se enamoran de ella.',
        img_frente: 'https://archive.org/services/img/LosTresGarciaPEDROINFANTE',
        imagen: 'https://archive.org/services/img/LosTresGarciaPEDROINFANTE',
        img_fondo: 'https://archive.org/services/img/LosTresGarciaPEDROINFANTE',
        servidores: [
          { server_name: 'ARCHIVE MX · DIRECTO MP4', url: 'https://archive.org/download/LosTresGarciaPEDROINFANTE/Los%20Tres%20Garcia%20-%20PEDRO%20INFANTE.mp4', idioma: 'LATINO', calidad: 'HD' }
        ]
      },
      {
        slug: 'ctv-mx-tizoc-1957',
        titulo: 'Tizoc: Amor Indio (Pedro Infante y María Félix)',
        nombre: 'Tizoc: Amor Indio (Pedro Infante y María Félix)',
        año: '1957',
        anio: '1957',
        fecha_estreno: '1957-10-23',
        duracion: '109',
        calidad: 'HD',
        votos: '9.1',
        isTop: true,
        tipo: 'pelicula',
        mx_cat: 'oro',
        origin_country: 'MX',
        genero: 'Drama, Romance, Época de Oro, Cine Mexicano',
        direccion: 'Ismael Rodríguez',
        reparto: 'Pedro Infante, María Félix, Andrés Soler, Julio Aldama',
        sinopsis: 'Ganadora del Globo de Oro y el Oso de Plata en Berlín. El indígena Tizoc (Pedro Infante) entrega su corazón puro a una mujer criolla de la ciudad (María Félix). Versión remasterizada en HD.',
        img_frente: 'https://archive.org/services/img/tizoc-pelicula-remasterizada-en-hd.-pedro-infante-maria-felix',
        imagen: 'https://archive.org/services/img/tizoc-pelicula-remasterizada-en-hd.-pedro-infante-maria-felix',
        img_fondo: 'https://archive.org/services/img/tizoc-pelicula-remasterizada-en-hd.-pedro-infante-maria-felix',
        servidores: [
          { server_name: 'ARCHIVE MX · REMASTERIZADA HD MP4', url: 'https://archive.org/download/tizoc-pelicula-remasterizada-en-hd.-pedro-infante-maria-felix/Tizoc%20Pelicula%20Remasterizada%20En%20HD.%20Pedro%20Infante%2C%20Maria%20Felix.mp4', idioma: 'LATINO', calidad: 'HD' }
        ]
      },
      {
        slug: 'ctv-mx-el-mil-amores-1954',
        titulo: 'El Mil Amores (Pedro Infante)',
        nombre: 'El Mil Amores (Pedro Infante)',
        año: '1954',
        anio: '1954',
        fecha_estreno: '1954-07-14',
        duracion: '101',
        calidad: 'HD',
        votos: '8.9',
        tipo: 'pelicula',
        mx_cat: 'oro',
        origin_country: 'MX',
        genero: 'Comedia, Ranchera, Época de Oro, Cine Mexicano',
        direccion: 'Rogelio A. González',
        reparto: 'Pedro Infante, Rosita Quintana, Joaquín Pardavé',
        sinopsis: 'Bibiano Villarreal (Pedro Infante), un carismático ranchero mujeriego, finge ser el padre respetable de una joven estudiante para ayudarla ante la directora de su internado.',
        img_frente: 'https://s2.dmcdn.net/v/WEO7Y1g41eDdAKNtE/x480',
        imagen: 'https://s2.dmcdn.net/v/WEO7Y1g41eDdAKNtE/x480',
        img_fondo: 'https://s2.dmcdn.net/v/WEO7Y1g41eDdAKNtE/x480',
        servidores: [
          { server_name: 'SERVIDOR CINE MX · DIRECTO HD', url: 'https://www.dailymotion.com/embed/video/x8xvs9u?autoplay=1', idioma: 'LATINO', calidad: 'HD' }
        ]
      },
      {
        slug: 'ctv-mx-macario-1960',
        titulo: 'Macario',
        nombre: 'Macario',
        año: '1960',
        anio: '1960',
        fecha_estreno: '1960-06-09',
        duracion: '91',
        calidad: 'HD',
        votos: '9.3',
        isTop: true,
        tipo: 'pelicula',
        mx_cat: 'oro',
        origin_country: 'MX',
        genero: 'Drama, Fantasía, Época de Oro, Cine Mexicano',
        direccion: 'Roberto Gavaldón',
        reparto: 'Ignacio López Tarso, Pina Pellicer, Enrique Lucero, Mario Alberto Rodríguez',
        sinopsis: 'Primera película mexicana nominada al Óscar. El humilde leñador Macario sueña con comer un guajolote entero él solo en Día de Muertos, y en el bosque se le aparecen el Diablo, Dios y la Muerte.',
        img_frente: 'https://archive.org/services/img/tecnotv_201709',
        imagen: 'https://archive.org/services/img/tecnotv_201709',
        img_fondo: 'https://archive.org/services/img/tecnotv_201709',
        servidores: [
          { server_name: 'ARCHIVE MX · DIRECTO MP4', url: 'https://archive.org/download/tecnotv_201709/Macario.mp4', idioma: 'LATINO', calidad: 'HD' }
        ]
      },
      {
        slug: 'ctv-mx-la-ley-del-monte-1976',
        titulo: 'La Ley del Monte (Vicente Fernández)',
        nombre: 'La Ley del Monte (Vicente Fernández)',
        año: '1976',
        anio: '1976',
        fecha_estreno: '1976-12-23',
        duracion: '110',
        calidad: 'HD',
        votos: '8.8',
        isTop: true,
        tipo: 'pelicula',
        mx_cat: 'oro',
        origin_country: 'MX',
        genero: 'Drama, Romance, Ranchera, Cine Mexicano',
        direccion: 'Alberto Mariscal',
        reparto: 'Vicente Fernández, Patricia Aspíllaga, Narciso Busquets, Felipe Arriaga',
        sinopsis: 'Maclovio (Vicente Fernández) regresa a su pueblo durante la Revolución Mexicana tras grabar su amor en la penca de un maguey con Soledad, hija de hacendados.',
        img_frente: 'https://archive.org/services/img/videoplayback_20211216_2303',
        imagen: 'https://archive.org/services/img/videoplayback_20211216_2303',
        img_fondo: 'https://archive.org/services/img/videoplayback_20211216_2303',
        servidores: [
          { server_name: 'ARCHIVE MX · DIRECTO MP4', url: 'https://archive.org/download/videoplayback_20211216_2303/videoplayback.mp4', idioma: 'LATINO', calidad: 'HD' }
        ]
      },
      {
        slug: 'ctv-mx-el-tahur-1979',
        titulo: 'El Tahúr (Vicente Fernández)',
        nombre: 'El Tahúr (Vicente Fernández)',
        año: '1979',
        anio: '1979',
        fecha_estreno: '1979-11-22',
        duracion: '102',
        calidad: 'HD',
        votos: '8.6',
        tipo: 'pelicula',
        mx_cat: 'oro',
        origin_country: 'MX',
        genero: 'Drama, Ranchera, Cine Mexicano',
        direccion: 'Rogelio A. González',
        reparto: 'Vicente Fernández, Amparo Muñoz, Jorge Rivero, Lalo «El Mimo»',
        sinopsis: 'Martín Estrada (Vicente Fernández), rechazado por la familia del amor de su vida por su pobreza, se convierte en un rico y temido jugador de cartas profesional.',
        img_frente: 'https://archive.org/services/img/2954-el-tahur-1979-dvdrip-lat-mx-v.mkv',
        imagen: 'https://archive.org/services/img/2954-el-tahur-1979-dvdrip-lat-mx-v.mkv',
        img_fondo: 'https://archive.org/services/img/2954-el-tahur-1979-dvdrip-lat-mx-v.mkv',
        servidores: [
          { server_name: 'ARCHIVE MX · DIRECTO MP4', url: 'https://archive.org/download/2954-el-tahur-1979-dvdrip-lat-mx-v.mkv/2954-El_Tahur_(1979)_DVDRip_Lat_mx_v.mkv.mp4', idioma: 'LATINO', calidad: 'HD' }
        ]
      },
      {
        slug: 'ctv-mx-picardia-mexicana-1978',
        titulo: 'Picardía Mexicana (Vicente Fernández)',
        nombre: 'Picardía Mexicana (Vicente Fernández)',
        año: '1978',
        anio: '1978',
        fecha_estreno: '1978-08-31',
        duracion: '98',
        calidad: 'HD',
        votos: '8.5',
        tipo: 'pelicula',
        mx_cat: 'comedia',
        origin_country: 'MX',
        genero: 'Comedia, Musical, Cine Mexicano',
        direccion: 'Abel Salazar',
        reparto: 'Vicente Fernández, Jacqueline Andere, Adalberto Martínez «Resortes», Héctor Suárez',
        sinopsis: 'Un simpático trailero y mecánico llamado «El Pewee» (Vicente Fernández) vive divertidas aventuras llenas de música y dichos populares en la Ciudad de México.',
        img_frente: 'https://archive.org/services/img/2960-picardia-mexicana-tvrip-1978-lat-mx-v.mkv',
        imagen: 'https://archive.org/services/img/2960-picardia-mexicana-tvrip-1978-lat-mx-v.mkv',
        img_fondo: 'https://archive.org/services/img/2960-picardia-mexicana-tvrip-1978-lat-mx-v.mkv',
        servidores: [
          { server_name: 'ARCHIVE MX · DIRECTO MP4', url: 'https://archive.org/download/2960-picardia-mexicana-tvrip-1978-lat-mx-v.mkv/2960-Picardia_Mexicana_TVRip_(1978)_Lat_mx_v.mkv.mp4', idioma: 'LATINO', calidad: 'HD' }
        ]
      },
      {
        slug: 'ctv-mx-nosotros-los-nobles-2013',
        titulo: 'Nosotros los Nobles',
        nombre: 'Nosotros los Nobles',
        año: '2013',
        anio: '2013',
        fecha_estreno: '2013-03-28',
        duracion: '108',
        calidad: 'HD',
        votos: '8.7',
        isTop: true,
        tipo: 'pelicula',
        mx_cat: 'moderno',
        origin_country: 'MX',
        genero: 'Comedia, Cine Mexicano',
        direccion: 'Gary Alazraki',
        reparto: 'Gonzalo Vega, Luis Gerardo Méndez, Karla Souza, Juan Pablo Gil',
        sinopsis: 'El empresario Germán Noble finge la quiebra y el embargo de todos sus bienes para darles una lección de vida a sus tres hijos malcriados y obligarlos a trabajar por primera vez.',
        img_frente: 'https://archive.org/services/img/NosotrosLosNobles2013',
        imagen: 'https://archive.org/services/img/NosotrosLosNobles2013',
        img_fondo: 'https://archive.org/services/img/NosotrosLosNobles2013',
        servidores: [
          { server_name: 'ARCHIVE MX · DIRECTO MP4 HD', url: 'https://archive.org/download/NosotrosLosNobles2013/Nosotros%20los%20Nobles%20(2013).mp4', idioma: 'LATINO', calidad: 'HD' }
        ]
      },
      {
        slug: 'ctv-mx-amar-te-duele-2002',
        titulo: 'Amar te Duele',
        nombre: 'Amar te Duele',
        año: '2002',
        anio: '2002',
        fecha_estreno: '2002-11-08',
        duracion: '104',
        calidad: 'HD',
        votos: '8.6',
        isTop: true,
        tipo: 'pelicula',
        mx_cat: 'moderno',
        origin_country: 'MX',
        genero: 'Romance, Drama, Cine Mexicano',
        direccion: 'Fernando Sariñana',
        reparto: 'Martha Higareda, Luis Fernando Peña, Ximena Sariñana, Alfonso Herrera',
        sinopsis: 'Renata, una joven de clase alta, y Ulises, un muchacho de barrio humilde, se enamoran profundamente en la Ciudad de México desafiando los prejuicios sociales.',
        img_frente: 'https://archive.org/services/img/amar-te-duele-2002-1080p',
        imagen: 'https://archive.org/services/img/amar-te-duele-2002-1080p',
        img_fondo: 'https://archive.org/services/img/amar-te-duele-2002-1080p',
        servidores: [
          { server_name: 'ARCHIVE MX · 1080P DIRECTO MP4', url: 'https://archive.org/download/amar-te-duele-2002-1080p/amar%20te%20duele%20(2002)%201080p.mp4', idioma: 'LATINO', calidad: 'FHD' }
        ]
      },
      {
        slug: 'ctv-mx-serie-el-chavo-del-8',
        titulo: 'El Chavo del 8 (Colección Clásica)',
        nombre: 'El Chavo del 8 (Colección Clásica)',
        año: '1973',
        anio: '1973',
        fecha_estreno: '1973-02-26',
        temporadas: 1,
        temp: 1,
        calidad: 'HD',
        votos: '9.5',
        isTop: true,
        tipo: 'serie',
        mx_cat: 'series',
        archive_id: 'chavodel-8-original-hasta-45',
        origin_country: 'MX',
        genero: 'Comedia, Familia, Series Mexicanas',
        reparto: 'Roberto Gómez Bolaños «Chespirito», Ramón Valdés, Carlos Villagrán, María Antonieta de las Nieves, Florinda Meza, Rubén Aguirre',
        sinopsis: 'Las inolvidables aventuras de El Chavo, Don Ramón, Quico, La Chilindrina, Doña Florinda y el Profesor Jirafales en la vecindad más famosa de México y Latinoamérica.',
        img_frente: 'https://archive.org/services/img/chavodel-8-original-hasta-45',
        imagen: 'https://archive.org/services/img/chavodel-8-original-hasta-45',
        img_fondo: 'https://archive.org/services/img/chavodel-8-original-hasta-45'
      },
      {
        slug: 'ctv-mx-serie-la-familia-p-luche',
        titulo: 'La Familia P. Luche',
        nombre: 'La Familia P. Luche',
        año: '2002',
        anio: '2002',
        fecha_estreno: '2002-08-07',
        temporadas: 1,
        temp: 1,
        calidad: 'HD',
        votos: '9.1',
        isTop: true,
        tipo: 'serie',
        mx_cat: 'series',
        archive_id: 'la-familia-p.-luche-2002-s-01',
        origin_country: 'MX',
        genero: 'Comedia, Series Mexicanas',
        reparto: 'Eugenio Derbez, Consuelo Duval, Regina Blandón, Luis Manuel Ávila, Miguel Perez, Bárbara Torres',
        sinopsis: 'Ludovico, Federica, Bibi, Ludoviquito, Junior y Excelsa viven situaciones disparatadas en Ciudad Peluche.',
        img_frente: 'https://archive.org/services/img/la-familia-p.-luche-2002-s-01',
        imagen: 'https://archive.org/services/img/la-familia-p.-luche-2002-s-01',
        img_fondo: 'https://archive.org/services/img/la-familia-p.-luche-2002-s-01'
      },
      {
        slug: 'ctv-mx-serie-el-chapulin-colorado',
        titulo: 'El Chapulín Colorado y Clásicos Chespirito',
        nombre: 'El Chapulín Colorado y Clásicos Chespirito',
        año: '1973',
        anio: '1973',
        fecha_estreno: '1973-02-28',
        temporadas: 1,
        temp: 1,
        calidad: 'HD',
        votos: '9.3',
        isTop: true,
        tipo: 'serie',
        mx_cat: 'series',
        archive_id: 'chvochplin-vhsrips',
        origin_country: 'MX',
        genero: 'Comedia, Aventura, Series Mexicanas',
        reparto: 'Roberto Gómez Bolaños «Chespirito», Ramón Valdés, Carlos Villagrán, Florinda Meza',
        sinopsis: '«¡No contaban con mi astucia!» El superhéroe más noble y divertido de México acude al llamado de quienes necesitan ayuda con su Chipote Chillón y sus Pastillas de Chiquitolina.',
        img_frente: 'https://archive.org/services/img/chvochplin-vhsrips',
        imagen: 'https://archive.org/services/img/chvochplin-vhsrips',
        img_fondo: 'https://archive.org/services/img/chvochplin-vhsrips'
      },
      {
        slug: 'ctv-mx-serie-el-chavo-animado',
        titulo: 'El Chavo Animado',
        nombre: 'El Chavo Animado',
        año: '2006',
        anio: '2006',
        fecha_estreno: '2006-10-21',
        temporadas: 1,
        temp: 1,
        calidad: 'HD',
        votos: '8.7',
        tipo: 'serie',
        mx_cat: 'series',
        archive_id: 'el-chavo-animado-temporada-1-completa-dvd',
        origin_country: 'MX',
        genero: 'Animación, Comedia, Familia, Series Mexicanas',
        reparto: 'Jesús Guzmán, Sebastián Llapur, Mario Castañeda',
        sinopsis: 'Versión animada de las aventuras del Chavo del 8 y los niños de la vecindad.',
        img_frente: 'https://archive.org/services/img/el-chavo-animado-temporada-1-completa-dvd',
        imagen: 'https://archive.org/services/img/el-chavo-animado-temporada-1-completa-dvd',
        img_fondo: 'https://archive.org/services/img/el-chavo-animado-temporada-1-completa-dvd'
      },
      {
        slug: 'ctv-mx-serie-cantinflas-show',
        titulo: 'Cantinflas Show (Cantinflas y sus Amigos)',
        nombre: 'Cantinflas Show (Cantinflas y sus Amigos)',
        año: '1972',
        anio: '1972',
        fecha_estreno: '1972-01-01',
        temporadas: 1,
        temp: 1,
        calidad: 'HD',
        votos: '8.8',
        tipo: 'serie',
        mx_cat: 'series',
        archive_id: 'cantinflasshow',
        origin_country: 'MX',
        genero: 'Animación, Comedia, Historia, Series Mexicanas',
        reparto: 'Mario Moreno «Cantinflas»',
        sinopsis: 'Serie animada educativa y cómica creada y narrada por Mario Moreno «Cantinflas», viajando por la historia, la ciencia y el mundo.',
        img_frente: 'https://archive.org/services/img/cantinflasshow',
        imagen: 'https://archive.org/services/img/cantinflasshow',
        img_fondo: 'https://archive.org/services/img/cantinflasshow'
      }
    ];
    window.CTV_MX_CATALOG = CTV_MX_CATALOG;

    function saveCatalogItem(it) {
      if (!it || !it.slug) return;
      var prev = window.__ctvCatalog[it.slug] || {};
      var merged = Object.assign({}, prev, it);
      if (!merged.TMDbId && merged.id && String(merged.id).length >= 3) {
        merged.TMDbId = merged.id;
      }
      window.__ctvCatalog[it.slug] = merged;
    }

    CTV_MX_CATALOG.forEach(saveCatalogItem);

    async function ctvFetchPjBypass(targetUrl) {
      // 1. Desktop proxy (nunca confundir con localhost de Capacitor en Android/iOS)
      if (ctvIsDesktopProxyAvailable()) {
        for (var dAttempt = 0; dAttempt < 3; dAttempt++) {
          try {
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

    function ctvSearchMexicanCatalog(query, catFilter, kindFilter) {
      var q = ctvNormText(query || '').trim();
      var words = q ? q.split(/\s+/).filter(Boolean) : [];
      return CTV_MX_CATALOG.filter(function (item) {
        if (kindFilter && item.tipo !== kindFilter) return false;
        if (catFilter && catFilter !== 'all') {
          if (catFilter === 'series_comedia' || catFilter === 'series') {
            if (item.tipo !== 'serie') return false;
          } else if (item.mx_cat !== catFilter) {
            return false;
          }
        }
        if (!words.length) return true;
        var hay = ctvNormText([item.titulo, item.nombre, item.reparto, item.direccion, item.genero, item.sinopsis, item.año].join(' '));
        return words.every(function (w) { return hay.indexOf(w) >= 0; });
      });
    }

    function ctvCleanDmTitle(rawTitle) {
      return String(rawTitle || 'Película Mexicana')
        .replace(/&#039;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
        .replace(/\b(?:pelicula|película|mexicana|completa|en\s+español|hd|1080p|720p|dvdrip|tvrip)\b/gi, '')
        .replace(/[-|/\\]+/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim() || String(rawTitle || 'Película Mexicana').trim();
    }

    async function ctvDynamicSearchMexican(query, isMxOnly) {
      var q = String(query || '').trim();
      if (!q || q.length < 2) return [];
      var results = [];
      var seenSlugs = new Set();

      try {
        var dmQuery = isMxOnly && ctvNormText(q).indexOf('mexican') < 0 ? (q + ' pelicula mexicana') : q;
        var dmApi = 'https://api.dailymotion.com/videos?search=' + encodeURIComponent(dmQuery) + '&fields=id,title,duration,thumbnail_480_url,description&limit=12';
        var dmResp = await _nativeFetch(dmApi);
        if (dmResp.ok) {
          var dmJson = await dmResp.json();
          var dmList = (dmJson && Array.isArray(dmJson.list)) ? dmJson.list : [];
          dmList.forEach(function (v) {
            if (!v || !v.id || (v.duration || 0) < 1800) return;
            var slug = 'ctv-mx-dm-' + v.id;
            if (seenSlugs.has(slug)) return;
            seenSlugs.add(slug);
            var cleanTitle = ctvCleanDmTitle(v.title);
            var yearM = String(v.title || '').match(/\b(19[3-9]\d|20[0-2]\d)\b/);
            var yr = yearM ? yearM[1] : '1985';
            var item = {
              slug: slug,
              titulo: cleanTitle,
              titulo_principal: cleanTitle,
              nombre: cleanTitle,
              año: yr,
              anio: yr,
              fecha_estreno: yr + '-01-01',
              duracion: String(Math.round((v.duration || 5400) / 60)),
              calidad: 'HD',
              votos: '8.2',
              tipo: 'pelicula',
              mx_cat: 'all',
              origin_country: 'MX',
              genero: 'Cine Mexicano',
              direccion: 'Cine Mexicano',
              reparto: 'Cine Mexicano',
              sinopsis: String(v.description || cleanTitle).replace(/<[^>]+>/g, ' ').trim() || ('Película del catálogo de Cine Mexicano: ' + cleanTitle),
              img_frente: v.thumbnail_480_url || '',
              imagen: v.thumbnail_480_url || '',
              img_fondo: v.thumbnail_480_url || '',
              servidores: [
                { server_name: 'SERVIDOR CINE MX · DIRECTO HD', url: 'https://www.dailymotion.com/embed/video/' + v.id + '?autoplay=1', idioma: 'LATINO', calidad: 'HD' }
              ]
            };
            saveCatalogItem(item);
            results.push(item);
          });
        }
      } catch (e) {}

      try {
        var iaQuery = '(' + q + ') AND mediatype:(movies)';
        var iaApi = 'https://archive.org/advancedsearch.php?q=' + encodeURIComponent(iaQuery) + '&fl[]=identifier,title,year,description&sort[]=downloads+desc&rows=10&page=1&output=json';
        var iaResp = await _nativeFetch(iaApi);
        if (iaResp.ok) {
          var iaJson = await iaResp.json();
          var docs = (iaJson && iaJson.response && Array.isArray(iaJson.response.docs)) ? iaJson.response.docs : [];
          docs.forEach(function (d) {
            if (!d || !d.identifier || !d.title) return;
            if (/^(?:KDTV|KSTS|WFDC|WUVP|WMAR|WHUT|GALA|GLVSN)_/i.test(d.identifier)) return;
            var slug = 'ctv-mx-ia-' + d.identifier;
            if (seenSlugs.has(slug)) return;
            seenSlugs.add(slug);
            var yr = String(d.year || '').slice(0, 4) || '1980';
            var thumb = 'https://archive.org/services/img/' + encodeURIComponent(d.identifier);
            var desc = Array.isArray(d.description) ? d.description.join(' ') : String(d.description || d.title);
            var item = {
              slug: slug,
              titulo: String(d.title).trim(),
              titulo_principal: String(d.title).trim(),
              nombre: String(d.title).trim(),
              año: yr,
              anio: yr,
              fecha_estreno: yr + '-01-01',
              duracion: '95',
              calidad: 'HD',
              votos: '8.3',
              tipo: 'pelicula',
              mx_cat: 'all',
              origin_country: 'MX',
              genero: 'Cine Mexicano',
              direccion: 'Cine Mexicano',
              reparto: 'Cine Mexicano',
              sinopsis: desc.replace(/<[^>]+>/g, ' ').slice(0, 420),
              img_frente: thumb,
              imagen: thumb,
              img_fondo: thumb,
              servidores: [
                { server_name: 'ARCHIVE MX · DIRECTO MP4', url: 'https://archive.org/details/' + encodeURIComponent(d.identifier), idioma: 'LATINO', calidad: 'HD' }
              ]
            };
            saveCatalogItem(item);
            results.push(item);
          });
        }
      } catch (e) {}

      return results;
    }

    async function ctvGetMxItemDetail(slug) {
      if (!slug) return null;
      if (window.__ctvCatalog && window.__ctvCatalog[slug] && (window.__ctvCatalog[slug].servidores || window.__ctvCatalog[slug].archive_id)) {
        return window.__ctvCatalog[slug];
      }
      var found = CTV_MX_CATALOG.find(function (x) { return x.slug === slug; });
      if (found) {
        saveCatalogItem(found);
        return found;
      }
      if (slug.indexOf('ctv-mx-dm-') === 0) {
        var dmId = slug.slice('ctv-mx-dm-'.length);
        var favM = ctvReadFavList('pj2_favs_movies').find(function (x) { return x && x.slug === slug; }) || {};
        var title = favM.title || 'Película Mexicana';
        var poster = favM.poster || '';
        var dur = '95';
        try {
          var r = await _nativeFetch('https://api.dailymotion.com/video/' + encodeURIComponent(dmId) + '?fields=id,title,duration,thumbnail_480_url,description');
          if (r.ok) {
            var v = await r.json();
            if (v && v.title) title = ctvCleanDmTitle(v.title);
            if (v && v.thumbnail_480_url) poster = v.thumbnail_480_url;
            if (v && v.duration) dur = String(Math.round(v.duration / 60));
          }
        } catch (e) {}
        var dmItem = {
          slug: slug,
          titulo: title,
          nombre: title,
          año: favM.year || '1985',
          duracion: dur,
          calidad: 'HD',
          votos: favM.rating || '8.3',
          tipo: 'pelicula',
          origin_country: 'MX',
          genero: 'Cine Mexicano',
          sinopsis: 'Película completa del servidor de Cine Mexicano: ' + title,
          img_frente: poster,
          imagen: poster,
          img_fondo: poster,
          servidores: [
            { server_name: 'SERVIDOR CINE MX · DIRECTO HD', url: 'https://www.dailymotion.com/embed/video/' + dmId + '?autoplay=1', idioma: 'LATINO', calidad: 'HD' }
          ]
        };
        saveCatalogItem(dmItem);
        return dmItem;
      }
      if (slug.indexOf('ctv-mx-ia-') === 0) {
        var iaId = slug.slice('ctv-mx-ia-'.length);
        var favIa = ctvReadFavList('pj2_favs_movies').find(function (x) { return x && x.slug === slug; }) || {};
        var iaThumb = 'https://archive.org/services/img/' + encodeURIComponent(iaId);
        var iaItem = {
          slug: slug,
          titulo: favIa.title || iaId,
          nombre: favIa.title || iaId,
          año: favIa.year || '1980',
          duracion: '95',
          calidad: 'HD',
          votos: favIa.rating || '8.3',
          tipo: 'pelicula',
          origin_country: 'MX',
          genero: 'Cine Mexicano',
          sinopsis: 'Película completa del archivo de Cine Mexicano.',
          img_frente: favIa.poster || iaThumb,
          imagen: favIa.poster || iaThumb,
          img_fondo: favIa.poster || iaThumb,
          servidores: [
            { server_name: 'ARCHIVE MX · DIRECTO MP4', url: 'https://archive.org/details/' + encodeURIComponent(iaId), idioma: 'LATINO', calidad: 'HD' }
          ]
        };
        saveCatalogItem(iaItem);
        return iaItem;
      }
      return null;
    }

    async function ctvGetMxSerieEpisodes(slug) {
      var serie = await ctvGetMxItemDetail(slug);
      var archiveId = serie && serie.archive_id;
      if (!archiveId) {
        if (serie && Array.isArray(serie.servidores) && serie.servidores.length) {
          return [{
            enum: 1,
            e: 1,
            titulo: serie.titulo || serie.nombre || 'Película Completa',
            url: serie.servidores[0].url,
            servidores: serie.servidores
          }];
        }
        return [{ enum: 1, e: 1, titulo: 'Capítulo 1', url: '' }];
      }
      if (window.__ctvMxArchiveEpCache[archiveId]) {
        return window.__ctvMxArchiveEpCache[archiveId];
      }
      try {
        var r = await _nativeFetch('https://archive.org/metadata/' + encodeURIComponent(archiveId));
        if (r.ok) {
          var j = await r.json();
          var files = (j && Array.isArray(j.files)) ? j.files : [];
          var mp4s = files.filter(function (f) {
            return f && f.name && /\.(mp4|m4v)$/i.test(f.name) && !/ia_thumb/i.test(f.name) && !/\.ia\.mp4$/i.test(f.name);
          });
          if (!mp4s.length) {
            mp4s = files.filter(function (f) {
              return f && f.name && /\.(mp4|m4v)$/i.test(f.name) && !/ia_thumb/i.test(f.name);
            });
          }
          var eps = mp4s.slice(0, 80).map(function (f, idx) {
            var rawName = f.name.replace(/\.(mp4|m4v)$/i, '').replace(/[_-]+/g, ' ').trim();
            return {
              enum: idx + 1,
              e: idx + 1,
              titulo: rawName || ('Capítulo ' + (idx + 1)),
              url: 'https://archive.org/download/' + encodeURIComponent(archiveId) + '/' + encodeURIComponent(f.name).replace(/%2F/g, '/')
            };
          });
          if (eps.length) {
            window.__ctvMxArchiveEpCache[archiveId] = eps;
            return eps;
          }
        }
      } catch (e) {}
      return [{ enum: 1, e: 1, titulo: 'Capítulo 1', url: 'https://archive.org/details/' + encodeURIComponent(archiveId) }];
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

    window.fetch = async function (resource, init) {
      var url = typeof resource === 'string' ? resource : (resource && resource.url) || '';
      if (url.indexOf('pelisjuanita.com') < 0) {
        return _nativeFetch.apply(this, arguments);
      }

      if (url.indexOf('/app/buscar.php') >= 0) {
        var qMatch = url.match(/[?&]q=([^&]+)/);
        var qStr = qMatch ? decodeURIComponent(qMatch[1]) : '';
        var pMatch = url.match(/[?&]pagina=([0-9]+)/);
        var pageNum = pMatch ? (parseInt(pMatch[1], 10) || 1) : 1;
        var mxHits = pageNum === 1 ? ctvSearchMexicanCatalog(qStr, null, null) : [];
        var isMxKeywords = /lola|trailera|chagoyan|almada|cantinflas|infante|vicente|india\s+maria|chavo|chapulin|luche|macario|tizoc|arracadas|huastecos|mexican/i.test(qStr);
        var isMxActive = Boolean(window.__ctvMxFilterMode);

        var pjResults = [];
        if (!isMxActive) {
          try {
            var bResp = await _nativeFetch.apply(this, arguments);
            if (bResp.ok) {
              var bJson = await bResp.json();
              pjResults = Array.isArray(bJson.datos) ? bJson.datos : (Array.isArray(bJson) ? bJson : []);
            }
          } catch (e) {
            var bypSearch = await ctvFetchPjBypass(url);
            if (bypSearch) {
              pjResults = Array.isArray(bypSearch.datos) ? bypSearch.datos : (Array.isArray(bypSearch) ? bypSearch : []);
            }
          }
        }

        var dynMx = [];
        if (pageNum === 1 && (isMxActive || isMxKeywords || mxHits.length > 0 || pjResults.length < 3)) {
          dynMx = await ctvDynamicSearchMexican(qStr, isMxActive || isMxKeywords);
        }

        var combined = [];
        var seen = new Set();
        mxHits.concat(dynMx).concat(pjResults).forEach(function (it) {
          if (!it || !it.slug || seen.has(it.slug)) return;
          seen.add(it.slug);
          saveCatalogItem(it);
          combined.push(it);
        });
        setTimeout(ctvUpdateFavButtonsUI, 120);
        return jsonResponse({
          status: 'ok',
          pagina_actual: pageNum,
          total_paginas: combined.length >= 25 ? pageNum + 1 : pageNum,
          datos: combined
        });
      }

      if ((url.indexOf('/app/movies.php') >= 0 || url.indexOf('/app/series.php') >= 0) && url.indexOf('slug=') < 0) {
        var isSeriesEndpoint = url.indexOf('/app/series.php') >= 0;
        var hasMxParam = url.indexOf('mx_server=') >= 0 || url.indexOf('pais=mx') >= 0;
        var pgMatch = url.match(/[?&]pagina=([0-9]+)/);
        var pg = pgMatch ? (parseInt(pgMatch[1], 10) || 1) : 1;

        if (!hasMxParam && window.__ctvMxFilterMode && url.indexOf('orden=') >= 0) {
          window.__ctvMxFilterMode = null;
        }

        if (hasMxParam) {
          var mxServerMatch = url.match(/[?&]mx_server=([^&]+)/);
          var rawModeVal = mxServerMatch ? decodeURIComponent(mxServerMatch[1]) : '';
          var mode = window.__ctvMxFilterMode || {};
          var cat = mode.cat || (rawModeVal && rawModeVal.indexOf('q:') !== 0 ? rawModeVal : (isSeriesEndpoint ? 'series' : 'all'));
          var customQ = mode.q || (rawModeVal.indexOf('q:') === 0 ? rawModeVal.slice(2) : '');

          var kindFilter = null;
          if (cat === 'series' || cat === 'series_comedia') kindFilter = 'serie';
          else if (!isSeriesEndpoint && cat !== 'all') kindFilter = 'pelicula';

          var curatedList = pg === 1 ? ctvSearchMexicanCatalog(customQ, cat, kindFilter) : [];
          var dynList = [];
          if (pg === 1 && customQ) {
            dynList = await ctvDynamicSearchMexican(customQ, true);
          }

          var pjMxList = [];
          if (!customQ && (cat === 'all' || cat === 'moderno' || url.indexOf('pais=mx') >= 0)) {
            var pjMxUrl = (isSeriesEndpoint ? 'https://pelisjuanita.com/tv/app/series.php' : 'https://pelisjuanita.com/tv/app/movies.php') + '?pais=mx&pagina=' + pg;
            try {
              var rPjMx = await _nativeFetch(pjMxUrl, { headers: { Accept: 'application/json' } });
              if (rPjMx.ok) {
                var jPjMx = await rPjMx.json();
                pjMxList = Array.isArray(jPjMx.datos) ? jPjMx.datos : (Array.isArray(jPjMx) ? jPjMx : []);
              }
            } catch (e) {
              var bPjMx = await ctvFetchPjBypass(pjMxUrl);
              if (bPjMx) {
                pjMxList = Array.isArray(bPjMx.datos) ? bPjMx.datos : (Array.isArray(bPjMx) ? bPjMx : []);
              }
            }
          }

          var outList = [];
          var seenMx = new Set();
          curatedList.concat(dynList).concat(pjMxList).forEach(function (it) {
            if (!it || !it.slug || seenMx.has(it.slug)) return;
            seenMx.add(it.slug);
            saveCatalogItem(it);
            outList.push(it);
          });

          setTimeout(ctvUpdateFavButtonsUI, 120);
          return jsonResponse({
            status: 'ok',
            pagina_actual: pg,
            total_paginas: pjMxList.length >= 20 ? pg + 1 : pg,
            datos: outList
          });
        }
      }

      // 1. Listados de catálogo (home, movies, series, buscar): NUNCA inyectar cabeceras prohibidas por CORS
      var isCatalogList = url.indexOf('/app/movies.php') >= 0 || url.indexOf('/app/series.php') >= 0 || url.indexOf('/app/home.php') >= 0 || url.indexOf('/app/buscar.php') >= 0;
      if (isCatalogList && url.indexOf('slug=') < 0) {
        try {
          var resp = await _nativeFetch.apply(this, arguments);
          var clone = resp.clone();
          clone.json().then(function (j) {
            if (!j) return;
            var items = Array.isArray(j.datos) ? j.datos : (Array.isArray(j) ? j : []);
            if (Array.isArray(j.sections)) {
              j.sections.forEach(function (sec) {
                if (Array.isArray(sec.data)) items = items.concat(sec.data);
              });
            }
            items.forEach(saveCatalogItem);
            setTimeout(ctvUpdateFavButtonsUI, 120);
          }).catch(function () {});
          return resp;
        } catch (e) {
          var bypList = await ctvFetchPjBypass(url);
          if (bypList) {
            var bItems = Array.isArray(bypList.datos) ? bypList.datos : (Array.isArray(bypList) ? bypList : []);
            bItems.forEach(saveCatalogItem);
            setTimeout(ctvUpdateFavButtonsUI, 120);
            return jsonResponse(bypList);
          }
          throw e;
        }
      }

      // 2. Detalle de película (movies.php?slug=...)
      if (url.indexOf('/app/movies.php?') >= 0 && url.indexOf('slug=') >= 0) {
        var slugMatch = url.match(/[?&]slug=([^&]+)/);
        var mSlug = slugMatch ? decodeURIComponent(slugMatch[1]) : '';

        if (mSlug.indexOf('ctv-mx-serie-') === 0) {
          if (typeof window.__ctvOpenSerie === 'function') {
            setTimeout(function () { window.__ctvOpenSerie(mSlug); }, 10);
            return new Promise(function () {});
          }
          // Compatibilidad total OTA en APKs existentes: mostrar capítulos reproducibles directamente como servidores
          var mxSerieAsMovie = await ctvGetMxItemDetail(mSlug);
          if (mxSerieAsMovie) {
            var epsAsServers = await ctvGetMxSerieEpisodes(mSlug);
            var outSerie = Object.assign({}, mxSerieAsMovie, {
              servidores: epsAsServers.slice(0, 40).map(function (ep, idx) {
                var epLabel = String(idx + 1).padStart(2, '0');
                return {
                  server_name: 'CINE MX · CAP ' + epLabel + ' — ' + String(ep.titulo || ('Capítulo ' + (idx + 1))).slice(0, 34),
                  url: ep.url,
                  idioma: 'LATINO',
                  calidad: 'HD'
                };
              })
            });
            ctvSetCurrentFavContext(outSerie, mSlug, 'serie');
            return jsonResponse({ status: 'ok', datos: outSerie });
          }
        }

        if (mSlug.indexOf('ctv-mx-') === 0) {
          var mxMovie = await ctvGetMxItemDetail(mSlug);
          if (mxMovie) {
            ctvSetCurrentFavContext(mxMovie, mSlug, 'movie');
            return jsonResponse({ status: 'ok', datos: mxMovie });
          }
        }

        var mCacheKey = 'm:' + mSlug;
        if (mSlug && window.__ctvDetailCache[mCacheKey]) {
          var cMov = window.__ctvDetailCache[mCacheKey].datos;
          ctvSetCurrentFavContext(cMov, mSlug, 'movie');
          return jsonResponse(window.__ctvDetailCache[mCacheKey]);
        }

        try {
          var mResp = await _nativeFetch.apply(this, arguments);
          if (mResp.status === 200) {
            var mClone = mResp.clone();
            var mJson = await mClone.json().catch(function () { return null; });
            if (mJson && mJson.status !== 'error' && mJson.datos) {
              ctvSetCurrentFavContext(mJson.datos, mSlug, 'movie');
              saveCatalogItem(mJson.datos);
              if (mSlug && mJson.datos.servidores) window.__ctvDetailCache[mCacheKey] = mJson;
              return jsonResponse(mJson);
            }
          }
        } catch (e) {}

        var mByp = await ctvFetchPjBypass(url);
        if (mByp && mByp.status !== 'error' && mByp.datos) {
          ctvSetCurrentFavContext(mByp.datos, mSlug, 'movie');
          saveCatalogItem(mByp.datos);
          if (mSlug && mByp.datos.servidores) window.__ctvDetailCache[mCacheKey] = mByp;
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

        if (sSlug.indexOf('ctv-mx-') === 0) {
          var mxSerie = await ctvGetMxItemDetail(sSlug);
          if (mxSerie) {
            ctvSetCurrentFavContext(mxSerie, sSlug, 'serie');
            return jsonResponse({ status: 'ok', datos: mxSerie });
          }
        }

        var sCacheKey = 's:' + sSlug;
        if (sSlug && window.__ctvDetailCache[sCacheKey]) {
          var cSerObj = window.__ctvDetailCache[sCacheKey].datos || window.__ctvDetailCache[sCacheKey].serie || window.__ctvDetailCache[sCacheKey].episodio;
          ctvSetCurrentFavContext(cSerObj, sSlug, 'serie');
          return jsonResponse(window.__ctvDetailCache[sCacheKey]);
        }

        try {
          var sResp = await _nativeFetch.apply(this, arguments);
          if (sResp.status === 200) {
            var sClone = sResp.clone();
            var sJson = await sClone.json().catch(function () { return null; });
            if (sJson && sJson.status !== 'error' && (sJson.datos || sJson.serie || sJson.episodio)) {
              var sObj = sJson.datos || sJson.serie || sJson.episodio;
              ctvSetCurrentFavContext(sObj, sSlug, 'serie');
              saveCatalogItem(sObj);
              if (sSlug) window.__ctvDetailCache[sCacheKey] = sJson;
              return jsonResponse(sJson);
            }
          }
        } catch (e) {}

        var sByp = await ctvFetchPjBypass(url);
        if (sByp && sByp.status !== 'error' && (sByp.datos || sByp.serie || sByp.episodio)) {
          var sObj2 = sByp.datos || sByp.serie || sByp.episodio;
          ctvSetCurrentFavContext(sObj2, sSlug, 'serie');
          saveCatalogItem(sObj2);
          if (sSlug) window.__ctvDetailCache[sCacheKey] = sByp;
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
        var tSlugM = url.match(/[?&]slug=([^&]+)/);
        var tSlug = tSlugM ? decodeURIComponent(tSlugM[1]) : '';
        if (tSlug.indexOf('ctv-mx-') === 0) {
          var mxEps = await ctvGetMxSerieEpisodes(tSlug);
          return jsonResponse({ status: 'ok', episodios: mxEps });
        }

        try {
          var tResp = await _nativeFetch.apply(this, arguments);
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
        var epSlugM = url.match(/[?&]slug=([^&]+)/);
        var epSlug = epSlugM ? decodeURIComponent(epSlugM[1]) : '';
        var epNumM = url.match(/[?&]e=([0-9]+)/);
        var epNum = epNumM ? (parseInt(epNumM[1], 10) || 1) : 1;

        if (epSlug.indexOf('ctv-mx-') === 0) {
          var mxEpList = await ctvGetMxSerieEpisodes(epSlug);
          var chosenEp = mxEpList[epNum - 1] || mxEpList[0];
          var epServers = (chosenEp && Array.isArray(chosenEp.servidores) && chosenEp.servidores.length)
            ? chosenEp.servidores.map(function (sv) {
                return Object.assign({ audio: sv.idioma || 'LATINO', quality: sv.calidad || 'HD' }, sv);
              })
            : (chosenEp && chosenEp.url ? [
                {
                  server_name: 'SERVIDOR CINE MX · DIRECTO MP4',
                  url: chosenEp.url,
                  audio: 'LATINO',
                  idioma: 'LATINO',
                  quality: 'HD',
                  calidad: 'HD'
                }
              ] : []);
          return jsonResponse({ status: 'ok', servidores: epServers });
        }

        var epCacheKey = 'ep:' + url.split('?')[1];
        if (window.__ctvDetailCache[epCacheKey]) {
          return jsonResponse(window.__ctvDetailCache[epCacheKey]);
        }

        try {
          var epResp = await _nativeFetch.apply(this, arguments);
          if (epResp.status === 200) {
            var epClone = epResp.clone();
            var epJson = await epClone.json().catch(function () { return null; });
            if (epJson && epJson.status !== 'error' && epJson.servidores) {
              window.__ctvDetailCache[epCacheKey] = epJson;
              return epResp;
            }
          }
        } catch (e) {}

        var epByp = await ctvFetchPjBypass(url);
        if (epByp && epByp.status !== 'error' && epByp.servidores) {
          window.__ctvDetailCache[epCacheKey] = epByp;
          return jsonResponse(epByp);
        }

        return jsonResponse({ status: 'ok', servidores: [] });
      }

      return _nativeFetch.apply(this, arguments);
    };
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
    if (s && s._isBackupExtra) return s._extraRank || 65;
    var lang = ((s && (s.idioma || s.audio)) || '').toUpperCase();
    var name = ((s && (s.server_name || s.ServerName || s['server-name'])) || '').toUpperCase();
    var u = ((s && (s.url || s.link)) || '').toLowerCase();

    // 1. Audio Latino al frente (servidores oficiales de PelisJuanita en Latino)
    if (lang.indexOf('LATIN') >= 0) {
      if (name.indexOf('PELISJUANITA') >= 0 || name.indexOf('DIRECTO') >= 0 || name.indexOf('PELISPLAYER') >= 0 || name.indexOf('SERIESPLAYER') >= 0 || name.indexOf('CINE MX') >= 0 || name.indexOf('ARCHIVE MX') >= 0) return 125;
      if (name.indexOf('VIMEUS') >= 0 || u.indexOf('vimeus') >= 0) return 122;
      if (u.indexOf('voe.sx') >= 0) return 118;
      if (u.indexOf('vibuxer') >= 0 || u.indexOf('hglink') >= 0 || u.indexOf('streamwish') >= 0) return 117;
      if (u.indexOf('lulustream') >= 0 || u.indexOf('lulust') >= 0) return 116;
      if (u.indexOf('morencius') >= 0) return 115;
      if (u.indexOf('vidara') >= 0 || u.indexOf('mixdrop') >= 0 || u.indexOf('bysesukior') >= 0 || u.indexOf('savefiles') >= 0) return 114;
      return 110;
    }
    // 2. Audio Castellano / Español
    if (lang.indexOf('ESPA') >= 0 || lang.indexOf('CAST') >= 0) {
      if (name.indexOf('PELISJUANITA') >= 0 || name.indexOf('DIRECTO') >= 0 || name.indexOf('PELISPLAYER') >= 0 || name.indexOf('SERIESPLAYER') >= 0) return 99;
      if (name.indexOf('VIMEUS') >= 0 || u.indexOf('vimeus') >= 0) return 98;
      if (u.indexOf('voe.sx') >= 0) return 96;
      if (u.indexOf('vibuxer') >= 0 || u.indexOf('hglink') >= 0 || u.indexOf('streamwish') >= 0) return 95;
      if (u.indexOf('lulustream') >= 0 || u.indexOf('lulust') >= 0) return 94;
      return 90;
    }
    // 3. Servidores oficiales subtitulados de PelisJuanita
    if (name.indexOf('PELISJUANITA') >= 0 || name.indexOf('DIRECTO') >= 0 || name.indexOf('PELISPLAYER') >= 0 || name.indexOf('SERIESPLAYER') >= 0) return 88;
    return 82;
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

  function revokeStreamBlob() {
    if (activeStreamBlobUrl) {
      try { URL.revokeObjectURL(activeStreamBlobUrl); } catch (e) {}
      activeStreamBlobUrl = null;
    }
  }

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

  window.ctvOnPlayerClose = function () {
    window.__ctvPlaySessionId = (window.__ctvPlaySessionId || 0) + 1;
    cleanupSubs();
    revokeStreamBlob();
    var pfClose = document.getElementById('player-frame');
    if (pfClose) pfClose.removeAttribute('sandbox');
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

    // 2. Android / iOS Capacitor nativePromise('CapacitorHttp', 'request', ...)
    try {
      if (window.Capacitor && typeof window.Capacitor.nativePromise === 'function') {
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
          headers: headers
        };
        if (body) {
          reqPayload.data = contentType.indexOf('json') >= 0 ? JSON.parse(body) : body;
        }
        var capRes = await window.Capacitor.nativePromise('CapacitorHttp', 'request', reqPayload);
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
      .replace(/<script[^>]*src=["'][^"']*(?:phruk\.org|flawlessimmunizeguy|llvpn\.com|ads-twitter|ima3\.js|pop\.js|histats|aclib|adcash|exoclick|juicyads|propeller|clickadu|popads|popmyads|trafficjunky|tsyndicate|bidgear|onmarshtompor|rtmark|yllix|stripchat|livejasmin|chaturbate|bongacams)[^"']*["'][^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?(?:flawlessimmunizeguy|f98a024e|c5022bca5c8bac1451cf|phruk\.org|llvpn\.com|openLoginTab)[\s\S]*?<\/script>/gi, '')
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

      if (target.indexOf('tv-90.com') >= 0) {
        var drmRes = await ctvHttpRequest(target, { referer: 'https://tvf90.com/' });
        if (drmRes && drmRes.body) {
          var xorMatch = drmRes.body.match(/var\s+_p\s*=\s*["']([^"']+)["']\s*,\s*_k\s*=\s*([0-9]+)/);
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
                  tracks: []
                };
              }
            } catch (e) {}
          }
        }
        return { url: target, type: 'iframe', tracks: [] };
      }

      var target5 = target.replace(/\/(?:[0-9]+|canal|hd|plus[0-9]*|sd|fhd|ver|embed)\.php\?/i, '/5.php?');
      if (target5 === target && target.indexOf('tvf90.com/') >= 0 && target.indexOf('.php?stream=') >= 0) {
        target5 = target.replace(/\/[a-z0-9_-]+\.php\?stream=/i, '/5.php?stream=');
      }
      var pageRes = await ctvHttpRequest(target5, { referer: 'https://tvf90.com/' });
      if (!pageRes.body) return null;
      var html = pageRes.body.replace(/\\\//g, '/');

      if (html.indexOf('.m3u8') < 0) {
        var innerIframe = html.match(/<iframe[^>]+src=["']([^"']*\/5\.php\?[^"']+)["']/i);
        if (innerIframe && innerIframe[1]) {
          var innerUrl = new URL(innerIframe[1], target5).toString();
          var innerRes = await ctvHttpRequest(innerUrl, { referer: target5 });
          if (innerRes && innerRes.body) {
            target5 = innerUrl;
            html = innerRes.body.replace(/\\\//g, '/');
          }
        }
      }

      var pbMatch = html.match(/playbackURL\s*=\s*['"](https?:\/\/[^'"]+\.m3u8[^'"]*)['"]/i);
      if (pbMatch) return { url: pbMatch[1], type: 'hls', tracks: [] };
      var srcMatch = html.match(/["']src["']\s*:\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i);
      if (srcMatch) return { url: srcMatch[1], type: 'hls', tracks: [] };
      var m3u8Match = html.match(/https?:\/\/[^\s"'<>\\]+\.m3u8[^\s"'<>\\]*/i);
      if (m3u8Match) return { url: m3u8Match[0], type: 'hls', tracks: [] };

      if (html.indexOf('<html') >= 0 && html.indexOf('pelotalibre.uno') < 0) {
        return { url: target5, type: 'srcdoc', html: sanitizeEmbedHtml(pageRes.body, target5), tracks: [] };
      }
      return { url: target5, type: 'iframe', tracks: [] };
    } catch (e) {
      return null;
    }
  }

  async function extractArchiveOrg(rawUrl) {
    try {
      var parsed = new URL(rawUrl);
      if (parsed.pathname.indexOf('/download/') === 0 && /\.(mp4|m4v|webm|mkv)(\?|$)/i.test(parsed.pathname)) {
        return { url: rawUrl, type: 'mp4', tracks: [] };
      }
      var parts = parsed.pathname.split('/').filter(Boolean);
      var iaId = (parts[0] === 'details' || parts[0] === 'embed' || parts[0] === 'metadata') ? parts[1] : parts[0];
      if (!iaId) return null;
      var r = await fetch('https://archive.org/metadata/' + encodeURIComponent(iaId));
      if (!r.ok) return null;
      var j = await r.json();
      var files = (j && Array.isArray(j.files)) ? j.files : [];
      var mp4 = files.find(function (f) {
        return f && f.name && /\.(mp4|m4v)$/i.test(f.name) && !/ia_thumb/i.test(f.name) && !/\.ia\.mp4$/i.test(f.name);
      }) || files.find(function (f) {
        return f && f.name && /\.(mp4|m4v)$/i.test(f.name) && !/ia_thumb/i.test(f.name);
      });
      if (mp4 && mp4.name) {
        var directUrl = 'https://archive.org/download/' + encodeURIComponent(iaId) + '/' + encodeURIComponent(mp4.name).replace(/%2F/g, '/');
        return { url: directUrl, type: 'mp4', tracks: [] };
      }
    } catch (e) {}
    return null;
  }

  async function extractDailymotion(rawUrl) {
    try {
      var dmMatch = rawUrl.match(/(?:\/video\/|[?&]video=)([a-zA-Z0-9]+)/i);
      if (!dmMatch || !dmMatch[1]) return null;
      var dmId = dmMatch[1];
      var metaRes = await ctvHttpRequest('https://www.dailymotion.com/player/metadata/video/' + encodeURIComponent(dmId), {
        referer: 'https://www.dailymotion.com/'
      });
      if (!metaRes || !metaRes.body) return null;
      var metaJson = JSON.parse(metaRes.body);
      var autoList = metaJson && metaJson.qualities && metaJson.qualities.auto;
      if (!Array.isArray(autoList) || !autoList[0] || !autoList[0].url) return null;

      var masterRes = await ctvHttpRequest(autoList[0].url, {
        referer: 'https://www.dailymotion.com/',
        cookie: metaRes.cookies || ''
      });
      if (!masterRes || !masterRes.body || masterRes.body.indexOf('#EXTM3U') < 0) return null;

      var variantMatches = masterRes.body.match(/https:\/\/[^\s#]+\.m3u8/g);
      if (!variantMatches || !variantMatches.length) return null;
      var bestVariantUrl = variantMatches[variantMatches.length - 1];

      var varRes = await ctvHttpRequest(bestVariantUrl, { referer: 'https://www.dailymotion.com/' });
      if (varRes && varRes.body && varRes.body.indexOf('#EXTM3U') >= 0) {
        var isCapNativeDm = Boolean(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform());
        var capSrv = (window.Capacitor && typeof window.Capacitor.getServerUrl === 'function')
          ? window.Capacitor.getServerUrl()
          : (isCapNativeDm ? location.origin : '');
        var useCapInterceptor = Boolean(isCapNativeDm && capSrv && (window.CapacitorWebFetch || capSrv.indexOf('localhost') >= 0));
        var lines = varRes.body.split(/\r?\n/);
        var rewritten = lines.map(function (line) {
          var trimmed = line.trim();
          if (!trimmed || trimmed.charAt(0) === '#') return line;
          try {
            var absSeg = new URL(trimmed, bestVariantUrl).toString();
            if (useCapInterceptor) {
              return capSrv + '/_capacitor_http_interceptor_?u=' + encodeURIComponent(absSeg);
            }
            return absSeg;
          } catch (e) {
            return line;
          }
        }).join('\n');

        revokeStreamBlob();
        var blob = new Blob([rewritten], { type: 'application/vnd.apple.mpegurl' });
        activeStreamBlobUrl = URL.createObjectURL(blob);
        return { url: activeStreamBlobUrl, type: 'hls', tracks: [] };
      }
    } catch (e) {}
    return null;
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
      if (host.indexOf('tvf90.com') >= 0 || host.indexOf('tv-90.com') >= 0 || rawUrl.indexOf('eventos.html?r=') >= 0) {
        var tvfRes = await extractTvf90(rawUrl);
        if (tvfRes) return tvfRes;
      }

      if (host.indexOf('archive.org') >= 0) {
        var iaRes = await extractArchiveOrg(rawUrl);
        if (iaRes) return iaRes;
      }

      if (host.indexOf('dailymotion.com') >= 0 || host.indexOf('dai.ly') >= 0) {
        var dmRes = await extractDailymotion(rawUrl);
        if (dmRes) return dmRes;
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

      var m3u8Match = unpacked.match(/(?:https?:)?\/\/[^\s"'<>\\]+\.m3u8[^\s"'<>\\]*/i);
      if (m3u8Match) {
        var streamUrl = m3u8Match[0];
        if (streamUrl.indexOf('//') === 0) streamUrl = 'https:' + streamUrl;
        return { url: streamUrl, type: 'hls', tracks: tracks };
      }

      // MixDrop / MP4 directo
      var mp4Match = unpacked.match(/(?:https?:)?\/\/[^\s"'<>\\]+\.mp4\?[^\s"'<>\\]*/i);
      if (mp4Match && mp4Match[0].indexOf('bigbuckbunny') < 0) {
        var mp4Url = mp4Match[0];
        if (mp4Url.indexOf('//') === 0) mp4Url = 'https:' + mp4Url;
        return { url: mp4Url, type: 'mp4', tracks: tracks };
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
      setTimeout(function () {
        applySubtitleSelection(defaultIdx);
      }, 400);
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
      'tvf90', 'tv-90', 'ftlly', 'streamtp', 'pelotalibre', 'dailymotion', 'dmcdn', 'archive.org'
    ];
    var isElectron = Boolean(window.DesktopBridge || /Electron/i.test(navigator.userAgent || '') || window.ctvIsDesktopProxyAvailable());
    var needsNoSandbox = isElectron || antiSandboxDomains.some(function (d) { return u.indexOf(d) !== -1; });
    if (needsNoSandbox) {
      iframeEl.removeAttribute('sandbox');
    } else {
      iframeEl.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-presentation');
    }
  }

  function openInCleanIframe(rawUrl, title) {
    cleanupSubs();
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
    if (typeof window.ctvUpdateFavButtonsUI === 'function') {
      window.ctvUpdateFavButtonsUI();
    }
    var f = document.getElementById('player-frame');
    if (f) {
      ctvConfigureIframeSandbox(f, rawUrl, false);
      f.removeAttribute('referrerpolicy');
      try { f.removeAttribute('srcdoc'); } catch (e) {}
      f.classList.remove('hidden');
      f.src = rawUrl;
      f.focus();
    }
  }

  window.ctvPlaySmartEmbed = function (url, title, serverName, slug, resumeKey) {
    window.__ctvPlaySessionId = (window.__ctvPlaySessionId || 0) + 1;
    var currentPlaySession = window.__ctvPlaySessionId;

    var rawUrl = String(url || '');
    if (!rawUrl || rawUrl.indexOf('youtube.com/embed') >= 0) return false;

    var pFrameInit = document.getElementById('player-frame');
    if (pFrameInit) {
      ctvConfigureIframeSandbox(pFrameInit, rawUrl, false);
      pFrameInit.removeAttribute('referrerpolicy');
    }

    if (!isExtractableServer(rawUrl)) {
      openInCleanIframe(rawUrl, title);
      return true;
    }

    // Abrir modal en estado de carga limpia y extraer el stream directo sin anuncios
    if (typeof window.__ctvOpenModal === 'function') {
      window.__ctvOpenModal(title + ' · Conectando…');
    }
    if (typeof window.ctvUpdateFavButtonsUI === 'function') {
      window.ctvUpdateFavButtonsUI();
    }

    var didFallback = false;
    function fallbackToIframe() {
      if (window.__ctvPlaySessionId !== currentPlaySession) return;
      if (didFallback) return;
      didFallback = true;
      var modal = document.getElementById('player-modal');
      if (!modal || modal.classList.contains('hidden')) return;
      var fbUrl = rawUrl;
      if (fbUrl.indexOf('tvf90.com/') >= 0 && fbUrl.indexOf('.php?stream=') >= 0) {
        fbUrl = fbUrl.replace(/\/[a-z0-9_-]+\.php\?stream=/i, '/5.php?stream=');
      }
      openInCleanIframe(fbUrl, title);
    }

    var timeoutId = setTimeout(function () {
      if (window.__ctvPlaySessionId !== currentPlaySession) return;
      fallbackToIframe();
    }, 10000);

    extractDirectStream(rawUrl)
      .then(function (res) {
        clearTimeout(timeoutId);
        if (window.__ctvPlaySessionId !== currentPlaySession) return;
        if (didFallback) return;
        var modal = document.getElementById('player-modal');
        if (!modal || modal.classList.contains('hidden')) return;

        if (res && res.type === 'dash' && res.url) {
          if (window.AndroidBridge && typeof window.AndroidBridge.playChannelFull === 'function') {
            if (typeof window.__ctvClosePlayer === 'function') window.__ctvClosePlayer();
            window.AndroidBridge.playChannelFull(title || 'Agenda Deportiva', res.url, '', res.keyId || '', res.key || '', 'agenda-deportiva');
            return;
          }
          if (typeof window.__ctvPlayDash === 'function') {
            try {
              window.__ctvPlayDash(res.url, res.keyId || '', res.key || '', title || 'Agenda Deportiva');
              if (typeof window.ctvUpdateFavButtonsUI === 'function') window.ctvUpdateFavButtonsUI();
              return;
            } catch (e) {}
          }
          openInCleanIframe(rawUrl, title);
          return;
        }

        if (res && res.type === 'iframe' && res.url) {
          openInCleanIframe(res.url, title);
          return;
        }

        if (res && res.type === 'hls' && res.url) {
          if (typeof window.__ctvPlayHls === 'function') {
            window.__ctvPlayHls(res.url, title, fallbackToIframe);
            if (typeof window.ctvUpdateFavButtonsUI === 'function') window.ctvUpdateFavButtonsUI();
            var vHls = document.getElementById('player-video');
            if (vHls) {
              var started = false;
              var stallTimer = null;
              var onPlaying = function () {
                started = true;
                if (stallTimer) { clearTimeout(stallTimer); stallTimer = null; }
                vHls.removeEventListener('playing', onPlaying);
                vHls.removeEventListener('loadeddata', onPlaying);
              };
              vHls.addEventListener('playing', onPlaying);
              vHls.addEventListener('loadeddata', onPlaying);
              vHls.onerror = function () {
                vHls.onerror = null;
                if (window.__ctvPlaySessionId !== currentPlaySession) return;
                if (stallTimer) { clearTimeout(stallTimer); stallTimer = null; }
                fallbackToIframe();
              };
              stallTimer = setTimeout(function () {
                if (window.__ctvPlaySessionId !== currentPlaySession) return;
                if (!started && !didFallback && vHls.readyState === 0 && !modal.classList.contains('hidden')) {
                  fallbackToIframe();
                }
              }, 8000);
            }
            attachSubtitlesToVideo(res.tracks || []);
            return;
          }
        }

        if (res && res.type === 'mp4' && res.url) {
          if (typeof window.__ctvOpenModal === 'function') window.__ctvOpenModal(title);
          if (typeof window.ctvUpdateFavButtonsUI === 'function') window.ctvUpdateFavButtonsUI();
          var v = document.getElementById('player-video');
          if (v) {
            v.classList.remove('hidden');
            v.onerror = function () {
              v.onerror = null;
              if (window.__ctvPlaySessionId !== currentPlaySession) return;
              fallbackToIframe();
            };
            v.src = res.url;
            v.play().catch(function () {});
            v.focus();
            attachSubtitlesToVideo(res.tracks || []);
            return;
          }
        }

        if (res && res.type === 'srcdoc' && res.html) {
          if (typeof window.__ctvOpenModal === 'function') window.__ctvOpenModal(title);
          if (typeof window.ctvUpdateFavButtonsUI === 'function') window.ctvUpdateFavButtonsUI();
          var f = document.getElementById('player-frame');
          if (f) {
            ctvConfigureIframeSandbox(f, '', true);
            f.removeAttribute('referrerpolicy');
            f.classList.remove('hidden');
            f.srcdoc = res.html;
            f.focus();
            return;
          }
        }

        fallbackToIframe();
      })
      .catch(function () {
        clearTimeout(timeoutId);
        if (window.__ctvPlaySessionId !== currentPlaySession) return;
        fallbackToIframe();
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
        if (!window.ctvIsDesktopProxyAvailable()) {
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
    if (pFrame) {
      if (pFrame.classList.contains('hidden')) pFrame.removeAttribute('sandbox');
      pFrame.removeAttribute('referrerpolicy');
    }

    // Navegación con control remoto D-Pad para el reproductor en Smart TV
    if (window.__ctvDpadKeyHandler) {
      window.removeEventListener('keydown', window.__ctvDpadKeyHandler, true);
    }
    window.__ctvDpadKeyHandler = function (e) {
      var subsModal = document.getElementById('ctv-subs-modal');
      if (subsModal) {
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
        if (e.key === 'Escape' || e.key === 'Backspace' || e.key === 'GoBack') {
          e.preventDefault();
          e.stopPropagation();
          if (e.stopImmediatePropagation) e.stopImmediatePropagation();
          subsModal.remove();
          var ps = document.getElementById('player-subs');
          if (ps && !ps.classList.contains('hidden')) ps.focus();
          return;
        }
        return;
      }

      var pModal = document.getElementById('player-modal');
      if (!pModal || pModal.classList.contains('hidden')) return;

      var pBar = document.getElementById('player-bar');
      var v = document.getElementById('player-video');
      var f = document.getElementById('player-frame');
      var isVideoActive = v && !v.classList.contains('hidden');
      var active = document.activeElement;
      var inBar = pBar && pBar.contains(active);

      if (e.key === 'MediaPlayPause' || e.keyCode === 85 || e.keyCode === 179) {
        if (isVideoActive) {
          e.preventDefault();
          if (e.stopImmediatePropagation) e.stopImmediatePropagation();
          if (v.paused) v.play().catch(function () {});
          else v.pause();
        }
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
        if ((e.key === 'Enter' || e.key === ' ' || e.keyCode === 23) && (active === v || active === document.body || active === pModal)) {
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
        e.preventDefault();
        e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        if (typeof window.ctvToggleFavoriteItem === 'function') {
          window.ctvToggleFavoriteItem(window.__ctvCurrentItem);
        }
        return;
      }

      var menuBtn = t.closest('.menu-item[data-section]');
      if (menuBtn) {
        window.__ctvMxFilterMode = null;
      }

      var barPill = t.closest('#filter-bar .pill');
      if (barPill && barPill.id !== 'ctv-quick-mx-pill' && barPill.getAttribute('title') !== 'Filtros' && barPill.textContent.indexOf('⛛') < 0) {
        window.__ctvMxFilterMode = null;
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
          if (ev.key && ev.key.toLowerCase() === 'f' && !ev.repeat) {
            var it = ctvGuessCardItem(card) || item;
            if (it && it.slug && typeof window.ctvToggleFavoriteItem === 'function') {
              ev.preventDefault();
              ev.stopPropagation();
              window.ctvToggleFavoriteItem(it);
            }
          } else if (ev.key === 'Enter' && !ev.repeat && !keyTimer) {
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
          if (ev.key === 'Enter') {
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

    function ctvApplyMexicanFilter(cat, query, label) {
      window.__ctvMxFilterMode = {
        cat: cat || 'all',
        q: query || '',
        label: label || '🇲🇽 Cine Mexicano'
      };
      var modal = document.getElementById('filter-modal');
      if (modal) {
        var opts = modal.querySelectorAll('.filter-opt');
        var mxNativeBtn = null;
        for (var i = 0; i < opts.length; i++) {
          var sp = opts[i].querySelector('span');
          if (sp && sp.textContent.trim() === 'México' && !opts[i].hasAttribute('data-ctv-mx')) {
            mxNativeBtn = opts[i];
            break;
          }
        }
        if (mxNativeBtn) {
          mxNativeBtn.click();
          setTimeout(function () {
            var secTitle = document.getElementById('section-title');
            var activeSec = document.querySelector('.menu-item.active');
            var prefix = (activeSec && activeSec.getAttribute('data-section') === 'series') ? 'Series · ' : 'Películas · ';
            if (secTitle) secTitle.textContent = prefix + window.__ctvMxFilterMode.label;
            var fBar = document.getElementById('filter-bar');
            if (fBar) {
              var pills = fBar.querySelectorAll('.pill');
              pills.forEach(function (p) {
                if (p.textContent.indexOf('⛛') >= 0) {
                  p.textContent = '⛛ ' + window.__ctvMxFilterMode.label + ' ✕';
                }
              });
            }
          }, 50);
          return;
        }
      }
      var fBarBtn = document.querySelector('#filter-bar .pill[title="Filtros"]');
      if (fBarBtn) {
        fBarBtn.click();
        setTimeout(function () {
          ctvApplyMexicanFilter(cat, query, label);
        }, 20);
      }
    }
    window.ctvApplyMexicanFilter = ctvApplyMexicanFilter;

    function ctvInjectMexicanSectionInFilterModal(modal) {
      if (!modal) return;
      var sectionsEl = modal.querySelector('#filter-sections');
      if (!sectionsEl || sectionsEl.querySelector('#ctv-mx-filter-sec')) return;

      var clearBtn = modal.querySelector('#filter-clear');
      if (clearBtn && !clearBtn.__ctvMxBound) {
        clearBtn.__ctvMxBound = true;
        clearBtn.addEventListener('click', function () {
          window.__ctvMxFilterMode = null;
        }, true);
      }

      var wrap = document.createElement('div');
      wrap.id = 'ctv-mx-filter-sec';
      wrap.style.cssText = 'margin-bottom:18px;padding:14px;border-radius:14px;background:linear-gradient(135deg,rgba(0,104,71,.22),rgba(206,17,38,.18));border:1px solid rgba(255,255,255,.14)';

      var title = document.createElement('h3');
      title.className = 'filter-sec-title';
      title.style.marginTop = '0';
      title.innerHTML = '🇲🇽 Cine y Series Mexicanas <small style="font-weight:400;opacity:.8;font-size:.8rem">· Servidor Independiente</small>';
      wrap.appendChild(title);

      var searchRow = document.createElement('div');
      searchRow.style.cssText = 'display:flex;gap:8px;margin:8px 0 12px;flex-wrap:wrap';
      searchRow.innerHTML =
        '<input id="ctv-mx-search-input" class="focusable" type="text" placeholder="🔍 Buscar película o serie mexicana (ej. Lola la trailera, Cantinflas, Almada)..." style="flex:1 1 220px;padding:9px 13px;border-radius:10px;border:1px solid rgba(255,255,255,.2);background:rgba(0,0,0,.45);color:#fff;font-size:.9rem;outline:none" tabindex="0" />' +
        '<button id="ctv-mx-search-btn" class="btn focusable" tabindex="0" style="background:#006847;color:#fff;font-weight:700;border:1px solid rgba(255,255,255,.25);padding:9px 16px;border-radius:10px">🇲🇽 Buscar MX</button>';
      wrap.appendChild(searchRow);

      var activeMode = window.__ctvMxFilterMode || {};
      var sInput = searchRow.querySelector('#ctv-mx-search-input');
      var sBtn = searchRow.querySelector('#ctv-mx-search-btn');
      if (sInput && activeMode.q) sInput.value = activeMode.q;

      function triggerMxCustomSearch() {
        var val = sInput ? sInput.value.trim() : '';
        if (!val) {
          ctvApplyMexicanFilter('all', '', '🇲🇽 Todo Cine y Series MX');
          return;
        }
        ctvApplyMexicanFilter('all', val, '🇲🇽 MX: "' + val + '"');
      }
      if (sBtn) sBtn.onclick = triggerMxCustomSearch;
      if (sInput) {
        sInput.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter') {
            ev.preventDefault();
            ev.stopPropagation();
            triggerMxCustomSearch();
          }
        });
      }

      var grid = document.createElement('div');
      grid.className = 'filter-grid';
      var mxCats = [
        { label: 'Todo Cine y Series MX', value: 'all', tag: 'MX', img: 'https://flagcdn.com/w40/mx.png' },
        { label: 'Acción y Traileros (Lola la Trailera, Almada)', value: 'accion', tag: 'HOT', img: 'https://flagcdn.com/w40/mx.png' },
        { label: 'Comedia Mexicana (Cantinflas, India María)', value: 'comedia', tag: 'MX', img: 'https://flagcdn.com/w40/mx.png' },
        { label: 'Época de Oro (Pedro Infante, María Félix)', value: 'oro', tag: 'CLÁSICO', img: 'https://flagcdn.com/w40/mx.png' },
        { label: 'Cine Mexicano Moderno', value: 'moderno', tag: 'HD', img: 'https://flagcdn.com/w40/mx.png' },
        { label: 'Series Mexicanas (El Chavo, P. Luche)', value: 'series', tag: 'SERIES', img: 'https://flagcdn.com/w40/mx.png' }
      ];

      mxCats.forEach(function (c) {
        var btn = document.createElement('button');
        btn.className = 'filter-opt focusable' + (activeMode.cat === c.value && !activeMode.q ? ' active' : '');
        btn.tabIndex = 0;
        btn.setAttribute('data-ctv-mx', c.value);
        btn.innerHTML =
          '<img loading="lazy" src="' + c.img + '" alt="MX" onerror="this.remove()"/>' +
          '<span>' + c.label + '</span>' +
          (c.tag ? '<em class="tag-new">' + c.tag + '</em>' : '');
        btn.onclick = function () {
          ctvApplyMexicanFilter(c.value, '', '🇲🇽 ' + c.label);
        };
        grid.appendChild(btn);
      });

      wrap.appendChild(grid);
      sectionsEl.insertBefore(wrap, sectionsEl.firstChild);
    }

    function ctvInjectQuickMxPillInFilterBar() {
      var fBar = document.getElementById('filter-bar');
      if (!fBar || fBar.classList.contains('hidden')) return;
      var activeSec = document.querySelector('.menu-item.active');
      var secName = activeSec ? activeSec.getAttribute('data-section') : '';
      if (secName !== 'movies' && secName !== 'series') return;
      if (fBar.querySelector('#ctv-quick-mx-pill')) return;

      var filterBtn = fBar.querySelector('.pill[title="Filtros"]');
      if (!filterBtn) return;

      var mxPill = document.createElement('button');
      mxPill.id = 'ctv-quick-mx-pill';
      var isMxOn = Boolean(window.__ctvMxFilterMode);
      mxPill.className = 'pill focusable' + (isMxOn ? ' active' : '');
      mxPill.tabIndex = 0;
      mxPill.textContent = secName === 'series' ? '🇲🇽 Series y Cine MX' : '🇲🇽 Cine y Series MX';
      mxPill.onclick = function () {
        if (window.__ctvMxFilterMode) {
          window.__ctvMxFilterMode = null;
          var firstPill = fBar.querySelector('.pill');
          if (firstPill && firstPill !== mxPill) firstPill.click();
          return;
        }
        ctvApplyMexicanFilter(secName === 'series' ? 'series' : 'all', '', secName === 'series' ? '🇲🇽 Series Mexicanas' : '🇲🇽 Cine y Series MX');
      };
      fBar.insertBefore(mxPill, filterBtn);
    }

    if (window.__ctvDomEnhancerObserver) {
      window.__ctvDomEnhancerObserver.disconnect();
    }
    var ctvEnhancerTimer = null;
    function ctvRunDomEnhancersSafe() {
      ctvEnhancerTimer = null;
      if (window.__ctvDomEnhancerObserver) {
        try { window.__ctvDomEnhancerObserver.disconnect(); } catch (e) {}
      }
      try {
        var fModal = document.getElementById('filter-modal');
        if (fModal) ctvInjectMexicanSectionInFilterModal(fModal);
        ctvInjectQuickMxPillInFilterBar();
        var contentEl = document.getElementById('content');
        if (contentEl) ctvBindMovieCardsInContainer(contentEl);
        var detailBody = document.getElementById('detail-body');
        if (detailBody && detailBody.querySelector('#detail-fav') && typeof window.ctvUpdateFavButtonsUI === 'function') {
          window.ctvUpdateFavButtonsUI();
        }
      } catch (e) {
      } finally {
        if (window.__ctvDomEnhancerObserver && document.body) {
          try { window.__ctvDomEnhancerObserver.observe(document.body, { childList: true, subtree: true }); } catch (e) {}
        }
      }
    }
    window.__ctvDomEnhancerObserver = new MutationObserver(function () {
      if (ctvEnhancerTimer) return;
      ctvEnhancerTimer = setTimeout(ctvRunDomEnhancersSafe, 80);
    });
    if (document.body) {
      window.__ctvDomEnhancerObserver.observe(document.body, { childList: true, subtree: true });
    }

    setTimeout(ctvRunDomEnhancersSafe, 100);
  } catch (e) {}

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

  // 1. Ejecutar caché OTA instantáneamente al arrancar (ignorando 1.6.0-ota.9 por seguridad)
  var cached = '';
  try {
    cached = localStorage.getItem(OTA_CACHE_KEY) || '';
    if (cached && cached.indexOf("'1.6.0-ota.9'") < 0 && cached.indexOf('"1.6.0-ota.9"') < 0) {
      runOtaCode(cached);
    }
  } catch (e) {}

  // 2. Comprobar y descargar última versión OTA desde GitHub en segundo plano y aplicarla en caliente
  fetch(OTA_SCRIPT_URL + '?t=' + Date.now(), { cache: 'no-store' })
    .then(function (r) { return r.ok ? r.text() : ''; })
    .then(function (remoteCode) {
      if (!remoteCode || remoteCode.indexOf('CTV_OTA_VERSION') < 0) return;
      var savedCode = cached;
      try {
        savedCode = localStorage.getItem(OTA_CACHE_KEY) || cached;
      } catch (e) {}
      if (remoteCode !== savedCode || window.__ctvOtaExecuted !== remoteCode) {
        try {
          localStorage.setItem(OTA_CACHE_KEY, remoteCode);
        } catch (e) {}
        runOtaCode(remoteCode);
      }
    })
    .catch(function () {});
})();
