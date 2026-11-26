/**
 * CTV Icons & Emoji Sanitizer (Single Source of Truth for Web/Desktop & OTA)
 */
(function () {
  var CTV_ICONS = {
    back: '<path d="M15 18l-6-6 6-6"/>',
    play: '<polygon points="7 5 19 12 7 19 7 5" fill="currentColor" stroke="currentColor"/>',
    restart: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><polyline points="3 3 3 8 8 8"/>',
    star: '<polygon points="12 3.2 14.7 8.7 20.8 9.6 16.4 13.9 17.4 20 12 17.1 6.6 20 7.6 13.9 3.2 9.6 9.3 8.7 12 3.2"/>',
    'star-filled': '<polygon points="12 3.2 14.7 8.7 20.8 9.6 16.4 13.9 17.4 20 12 17.1 6.6 20 7.6 13.9 3.2 9.6 9.3 8.7 12 3.2" fill="currentColor"/>',
    quality: '<line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="17" x2="20" y2="17"/><circle cx="9" cy="7" r="2.3" fill="#141821"/><circle cx="15" cy="17" r="2.3" fill="#141821"/>',
    image: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><circle cx="12" cy="12" r="3.5"/><path d="M12 8.5v7"/>',
    subtitles: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M10.5 10.2a2.2 2.2 0 1 0 0 3.6"/><path d="M16.5 10.2a2.2 2.2 0 1 0 0 3.6"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><line x1="16" y1="16" x2="20.5" y2="20.5"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 8-3 8h18s-3-1-3-8"/><path d="M10.3 19.5a2 2 0 0 0 3.4 0"/>',
    check: '<polyline points="5 12.5 9.5 17 19 7.5"/>',
    close: '<line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/>',
    server: '<polygon points="12 3 3 7.5 12 12 21 7.5 12 3"/><polyline points="3 12 12 16.5 21 12"/><polyline points="3 16.5 12 21 21 16.5"/>',
    tv: '<rect x="3" y="6" width="18" height="13" rx="2.5"/><polyline points="8 2.5 12 6 16 2.5"/>',
    film: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><line x1="7.5" y1="4" x2="7.5" y2="20"/><line x1="16.5" y1="4" x2="16.5" y2="20"/><line x1="3" y1="9.5" x2="7.5" y2="9.5"/><line x1="3" y1="14.5" x2="7.5" y2="14.5"/><line x1="16.5" y1="9.5" x2="21" y2="9.5"/><line x1="16.5" y1="14.5" x2="21" y2="14.5"/>',
    series: '<rect x="3" y="7" width="18" height="13" rx="2.5"/><line x1="6.5" y1="3.5" x2="17.5" y2="3.5"/><polygon points="10.5 10.8 15 13.5 10.5 16.2 10.5 10.8" fill="currentColor"/>',
    warning: '<path d="M12 3.5L2.6 19.5a1.5 1.5 0 0 0 1.3 2.3h16.2a1.5 1.5 0 0 0 1.3-2.3L12 3.5z"/><line x1="12" y1="9.5" x2="12" y2="14"/><circle cx="12" cy="17.5" r="0.8" fill="currentColor"/>'
  };

  var EMOJI_STRIP_RE = /(?:[\uD83C-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u27BF]|\uFE0F|\u200D|\u2B50|\u25B6|\u25C0|\u2714|\u2715|\u26A1|\u26DB)+/g;

  function ctvIcon(name, size) {
    var s = size || 16;
    var body = Object.prototype.hasOwnProperty.call(CTV_ICONS, name) ? CTV_ICONS[name] : '';
    return '<svg class="ctv-ic ctv-ic-' + name + '" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + body + '</svg>';
  }

  function stripEmojiText(str, trimTrailing) {
    if (typeof str !== 'string') return '';
    EMOJI_STRIP_RE.lastIndex = 0;
    var cleaned = str.replace(EMOJI_STRIP_RE, '').replace(/\s{2,}/g, ' ');
    return trimTrailing === false ? cleaned.replace(/^\s+/, '') : cleaned.trim();
  }

  function cleanElementTextNodes(el, trimTrailing) {
    if (!el || !el.childNodes) return;
    for (var i = 0; i < el.childNodes.length; i++) {
      var n = el.childNodes[i];
      if (n && n.nodeType === 3 && n.nodeValue) {
        var nextVal = stripEmojiText(n.nodeValue, trimTrailing !== false);
        if (nextVal !== n.nodeValue) n.nodeValue = nextVal;
      }
    }
  }

  function ctvUpgradeStaticChromeIcons(docRef) {
    var doc = docRef || (typeof document !== 'undefined' ? document : null);
    if (!doc) return;
    try {
      var sIcon = doc.querySelector('.search-icon');
      if (sIcon && !sIcon.querySelector('.ctv-ic')) {
        sIcon.innerHTML = ctvIcon('search', 16);
      }
      var sClear = doc.getElementById('search-clear');
      if (sClear && !sClear.querySelector('.ctv-ic')) {
        sClear.innerHTML = ctvIcon('close', 15);
        sClear.setAttribute('aria-label', 'Limpiar búsqueda');
      }
      var dBack = doc.getElementById('detail-topback');
      if (dBack && !dBack.querySelector('.ctv-ic')) {
        dBack.innerHTML = ctvIcon('back', 16) + '<span class="ctv-btn-lbl">Volver</span>';
        dBack.setAttribute('aria-label', 'Volver');
      }
      var pBack = doc.getElementById('player-back');
      if (pBack && !pBack.querySelector('.ctv-ic')) {
        pBack.innerHTML = ctvIcon('back', 16) + '<span class="ctv-btn-lbl">Volver</span>';
        pBack.setAttribute('aria-label', 'Volver');
      }
      var pSubs = doc.getElementById('player-subs');
      if (pSubs && !pSubs.querySelector('.ctv-ic')) {
        pSubs.innerHTML = ctvIcon('subtitles', 16) + '<span class="ctv-btn-lbl">Subtítulos</span>';
        pSubs.setAttribute('aria-label', 'Subtítulos');
      }
      var pFav = doc.getElementById('player-fav');
      if (pFav && !pFav.querySelector('.ctv-ic')) {
        pFav.innerHTML = ctvIcon('star', 16) + '<span class="ctv-btn-lbl">Favorito</span>';
        pFav.setAttribute('aria-label', 'Favorito');
      }
      var srvClose = doc.getElementById('server-close');
      if (srvClose && !srvClose.querySelector('.ctv-ic')) {
        srvClose.innerHTML = ctvIcon('close', 16) + '<span class="ctv-btn-lbl">Cerrar</span>';
        srvClose.setAttribute('aria-label', 'Cerrar');
      }
      var updBtn = doc.getElementById('btn-update-install');
      if (updBtn && !updBtn.querySelector('.ctv-ic')) {
        updBtn.innerHTML = ctvIcon('bell', 16) + '<span>Actualizar ahora</span>';
      }
      var rotIcon = doc.querySelector('.rotate-icon');
      if (rotIcon && !rotIcon.querySelector('.ctv-ic')) {
        rotIcon.innerHTML = ctvIcon('restart', 28);
      }
    } catch (e) {}
  }

  function ctvSanitizeContainerEmojis(root, winRef) {
    if (!root || !root.querySelectorAll) return;
    var win = winRef || (typeof window !== 'undefined' ? window : null);
    try {
      root.querySelectorAll('.badge-top:not([data-ctv-clean])').forEach(function (el) {
        el.textContent = 'TOP';
        el.dataset.ctvClean = '1';
      });

      root.querySelectorAll('.movie-rating:not([data-ctv-clean])').forEach(function (el) {
        var num = (el.textContent || '').replace(/[^\d.]+/g, '').trim();
        if (num) {
          el.innerHTML = ctvIcon('star-filled', 12) + '<span>' + num + '</span>';
        } else {
          el.textContent = '';
        }
        el.dataset.ctvClean = '1';
      });

      root.querySelectorAll('.fav-star:not([data-ctv-clean])').forEach(function (el) {
        el.innerHTML = ctvIcon('star-filled', 13);
        el.dataset.ctvClean = '1';
      });

      root.querySelectorAll('#detail-watch:not([data-ctv-clean])').forEach(function (el) {
        el.innerHTML = ctvIcon('play', 16) + '<span>Ver ahora</span>';
        el.dataset.ctvClean = '1';
      });

      root.querySelectorAll('#detail-trailer:not([data-ctv-clean])').forEach(function (el) {
        el.innerHTML = ctvIcon('film', 16) + '<span>Tráiler</span>';
        el.dataset.ctvClean = '1';
      });

      root.querySelectorAll('#detail-servers button:not([data-ctv-clean]), #serie-servers-wrap .server-list button:not([data-ctv-clean]), #server-list button:not([data-ctv-clean]), .agenda-embeds .pill:not([data-ctv-clean])').forEach(function (el) {
        cleanElementTextNodes(el, true);
        var firstSpan = el.firstElementChild;
        if (firstSpan && firstSpan.tagName === 'SPAN' && !firstSpan.classList.contains('server-lang') && !firstSpan.classList.contains('ctv-srv-badge')) {
          cleanElementTextNodes(firstSpan, true);
          firstSpan.style.display = 'inline-flex';
          firstSpan.style.alignItems = 'center';
          firstSpan.style.gap = '7px';
          if (!firstSpan.querySelector('.ctv-ic')) {
            firstSpan.insertAdjacentHTML('afterbegin', ctvIcon('play', 14));
          }
        } else if (!el.querySelector('.ctv-ic')) {
          el.insertAdjacentHTML('afterbegin', ctvIcon('play', 14));
        }
        el.dataset.ctvClean = '1';
      });
      if (win && typeof win.ctvDecorateServerBadges === 'function') {
        win.ctvDecorateServerBadges(root);
      }

      root.querySelectorAll('.empty > div:first-child:not([data-ctv-clean])').forEach(function (el) {
        if (el.classList.contains('spinner')) return;
        if (el.children && el.children.length > 0 && !el.querySelector('.ctv-ic')) return;
        el.innerHTML = ctvIcon('film', 32);
        el.style.cssText = 'color:var(--ctv-muted);margin-bottom:6px';
        el.dataset.ctvClean = '1';
      });

      root.querySelectorAll('#filter-bar .pill:not([data-ctv-clean]), .fav-row-title:not([data-ctv-clean]), .air-badge:not([data-ctv-clean])').forEach(function (el) {
        var hasEl = Boolean(el.firstElementChild);
        cleanElementTextNodes(el, !hasEl);
        var dot = el.classList.contains('air-badge') ? el.querySelector('.air-dot') : null;
        if (dot) {
          dot.textContent = '';
          dot.style.cssText = 'width:7px;height:7px;border-radius:50%;background:var(--ctv-accent);display:inline-block;flex-shrink:0';
        }
        el.dataset.ctvClean = '1';
      });

      root.querySelectorAll('.ctv-hero-btn:not([data-ctv-clean])').forEach(function (el) {
        el.innerHTML = ctvIcon('play', 16) + '<span>Ver ahora</span>';
        el.dataset.ctvClean = '1';
      });

      root.querySelectorAll('.ctv-hero-kicker').forEach(function (el) {
        var txtVal = el.textContent || '';
        EMOJI_STRIP_RE.lastIndex = 0;
        if (EMOJI_STRIP_RE.test(txtVal)) {
          el.textContent = stripEmojiText(txtVal, true);
        }
      });
    } catch (e) {}
  }

  function initIcons(winRef, docRef) {
    var win = winRef || (typeof window !== 'undefined' ? window : null);
    var doc = docRef || (typeof document !== 'undefined' ? document : null);
    if (win) {
      win.CTV_ICONS = CTV_ICONS;
      win.ctvIcon = ctvIcon;
      win.ctvUpgradeStaticChromeIcons = function (d) { return ctvUpgradeStaticChromeIcons(d || doc); };
      win.ctvSanitizeContainerEmojis = function (r) { return ctvSanitizeContainerEmojis(r, win); };
    }
    if (doc) {
      ctvUpgradeStaticChromeIcons(doc);
      if (doc.readyState === 'loading' && typeof doc.addEventListener === 'function') {
        doc.addEventListener('DOMContentLoaded', function () {
          ctvUpgradeStaticChromeIcons(doc);
        }, { once: true });
      }
    }
  }

  /* @ctv-browser-boot-start */
  if (typeof exports === 'undefined') {
    initIcons(typeof window !== 'undefined' ? window : null, typeof document !== 'undefined' ? document : null);
  }
  /* @ctv-browser-boot-end */

  /* @ctv-node-exports-start */
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      CTV_ICONS: CTV_ICONS,
      EMOJI_STRIP_RE: EMOJI_STRIP_RE,
      ctvIcon: ctvIcon,
      stripEmojiText: stripEmojiText,
      cleanElementTextNodes: cleanElementTextNodes,
      ctvUpgradeStaticChromeIcons: ctvUpgradeStaticChromeIcons,
      ctvSanitizeContainerEmojis: ctvSanitizeContainerEmojis,
      initIcons: initIcons
    };
  }
  /* @ctv-node-exports-end */
})();
