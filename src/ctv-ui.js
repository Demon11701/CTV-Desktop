/* CTV UI: barra superior unificada y portada (hero) estilo Apple TV. Todo en try/catch: si algo falla, la app sigue normal. */
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

/* CTV: navegación con control remoto para el menú horizontal (el original estaba pensado para un menú vertical). */
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

    // Menú: ←/→ entre botones, ↓ al contenido (↑ en la barra inferior del teléfono)
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

    // Búsqueda y campana (en la barra superior): ↓ al contenido, ← de vuelta al menú
    var sb = document.getElementById('sidebar');
    if (sb) sb.addEventListener('keydown', function (e) {
      var t = e.target;
      if (!t || !t.closest || t.closest('.menu')) return;
      if (e.key === 'ArrowDown') { if (toContent()) e.preventDefault(); }
      else if (e.key === 'ArrowLeft' && t.id === 'search-input' && t.selectionStart === 0 && t.selectionEnd === 0) {
        var l = items(); if (focusEl(activeItem() || l[l.length - 1])) e.preventDefault();
      }
    });

    // Portada y primera fila: ↓ de la portada baja a la primera fila; ↑ de la primera fila sube a la portada o al menú
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

/* CTV: Comprobador multiplataforma de actualizaciones desde GitHub Releases (Android/Smart TV, Windows, Linux e iOS SideStore) */
(function () {
  var GITHUB_LATEST_URL = 'https://api.github.com/repos/Demon11701/CTV-Desktop/releases/latest';
  var ALTSTORE_REPO_URL = 'https://raw.githubusercontent.com/Demon11701/CTV-Desktop/main/altstore-repo.json';
  var CURRENT_VERSION = window.CTV_APP_VERSION || '1.5.0';
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
        btnInstall.textContent = '⚡ Descargar APK (' + tag + ')';
      } else if (platform === 'windows') {
        btnInstall.textContent = '⚡ Descargar .EXE (' + tag + ')';
      } else {
        btnInstall.textContent = '⚡ Descargar .AppImage (' + tag + ')';
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
          if (exeUrl) window.open(exeUrl, '_blank');
          return;
        }

        var appImageUrl = findAssetUrl(assets, '.AppImage') || release.html_url;
        if (appImageUrl) window.open(appImageUrl, '_blank');
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
