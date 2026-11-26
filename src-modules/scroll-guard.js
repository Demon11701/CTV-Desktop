/**
 * CTV Android WebView Scroll, Focus & Back-Gesture Guard (Single Source of Truth)
 * Prevents Chromium Android WebView ScrollNode / hit-test tree freezes, touch-focus
 * tug-of-war, orphaned fullscreen/orientation locks, and unwrapped handleAppBack calls.
 */
(function () {
  var SCROLL_GUARD_CSS = [
    '.content{overflow-y:auto!important;overflow-x:hidden!important;-webkit-overflow-scrolling:touch!important;touch-action:pan-y!important;overscroll-behavior-y:contain}',
    '.detail-scroll,#detail-body{flex:1 1 auto!important;min-height:0!important;overflow-y:auto!important;overflow-x:hidden!important;-webkit-overflow-scrolling:touch!important;touch-action:pan-y!important;overscroll-behavior-y:contain}',
    '.carousel,.filter-bar,.season-strip,.season-tabs{overflow-y:hidden!important;touch-action:pan-x pan-y}',
    '.player.hidden,.detail-full.hidden,.modal.hidden,.filter-modal.hidden,#rotate-warning.hidden,#ctv-player-wake-zone.hidden{display:none!important;pointer-events:none!important;visibility:hidden!important}'
  ].join('\n');

  var PLAYER_FLOATING_OVERLAY_IDS = [
    'ctv-agenda-status',
    'ctv-failover-pill',
    'ctv-resume-prompt',
    'ctv-player-loader',
    'ctv-quality-modal',
    'ctv-imgmode-modal',
    'ctv-subs-modal'
  ];

  var BLOCKING_MODAL_IDS = [
    'player-modal',
    'server-modal',
    'update-modal',
    'filter-modal',
    'adult-modal'
  ];

  function unrefTimer(t) {
    if (t && typeof t.unref === 'function') {
      try { t.unref(); } catch (e) {}
    }
    return t;
  }

  function isElementModalOpen(el) {
    if (!el) return false;
    if (el.isConnected === false) return false;
    if (el.classList && typeof el.classList.contains === 'function' && el.classList.contains('hidden')) return false;
    if (el.style && el.style.display === 'none') return false;
    return true;
  }

  function hasAnyBlockingModalOpen(doc) {
    if (!doc || typeof doc.getElementById !== 'function') return false;
    for (var i = 0; i < BLOCKING_MODAL_IDS.length; i++) {
      if (isElementModalOpen(doc.getElementById(BLOCKING_MODAL_IDS[i]))) {
        return true;
      }
    }
    return false;
  }

  function isInsideHiddenAncestor(el) {
    if (!el) return false;
    if (el.classList && typeof el.classList.contains === 'function' && el.classList.contains('hidden')) return true;
    if (typeof el.closest === 'function' && el.closest('.hidden')) return true;
    var cur = el.parentNode;
    while (cur && cur.nodeType === 1) {
      if (cur.classList && typeof cur.classList.contains === 'function' && cur.classList.contains('hidden')) return true;
      cur = cur.parentNode;
    }
    return false;
  }

  function isCardElement(el) {
    if (!el) return false;
    if (el.classList && typeof el.classList.contains === 'function' && el.classList.contains('card')) return true;
    if (typeof el.closest === 'function' && el.closest('.card')) return true;
    return false;
  }

  function ensureScrollGuardStyles(docRef) {
    var doc = docRef || (typeof document !== 'undefined' ? document : null);
    if (!doc || !doc.head || typeof doc.createElement !== 'function') return null;
    try {
      var st = typeof doc.getElementById === 'function' ? doc.getElementById('ctv-scroll-guard-style') : null;
      if (!st) {
        st = doc.createElement('style');
        st.id = 'ctv-scroll-guard-style';
        st.textContent = SCROLL_GUARD_CSS;
        doc.head.appendChild(st);
      } else if (st.textContent !== SCROLL_GUARD_CSS) {
        st.textContent = SCROLL_GUARD_CSS;
      }
      return st;
    } catch (e) {
      return null;
    }
  }

  function syncPlayerWakeZoneVisibility(docRef) {
    var doc = docRef || (typeof document !== 'undefined' ? document : null);
    if (!doc || typeof doc.getElementById !== 'function') return;
    try {
      var pModal = doc.getElementById('player-modal');
      var wz = doc.getElementById('ctv-player-wake-zone');
      if (!wz) return;
      if (isElementModalOpen(pModal)) {
        if (wz.classList) wz.classList.remove('hidden');
        if (wz.style) {
          wz.style.display = 'block';
          wz.style.pointerEvents = 'auto';
        }
      } else {
        if (wz.classList) wz.classList.add('hidden');
        if (wz.style) {
          wz.style.display = 'none';
          wz.style.pointerEvents = 'none';
        }
      }
    } catch (e) {}
  }

  function safeExitFullscreenAndUnlockOrientation(win, doc) {
    if (win) {
      win.__ctvIsFullscreen = false;
    }
    if (doc) {
      try {
        var fsEl = doc.fullscreenElement || doc.webkitFullscreenElement;
        if (fsEl) {
          if (typeof doc.exitFullscreen === 'function') {
            var p = doc.exitFullscreen();
            if (p && typeof p.catch === 'function') p.catch(function () {});
          } else if (typeof doc.webkitExitFullscreen === 'function') {
            doc.webkitExitFullscreen();
          }
        }
      } catch (e) {}
    }
    if (win) {
      try {
        var scr = win.screen || (typeof screen !== 'undefined' ? screen : null);
        if (scr && scr.orientation && typeof scr.orientation.unlock === 'function') {
          var u = scr.orientation.unlock();
          if (u && typeof u.catch === 'function') u.catch(function () {});
        }
      } catch (e) {}
    }
  }

  function neutralizeClosedPlayerArtifacts(doc) {
    if (!doc || typeof doc.getElementById !== 'function') return;

    try {
      var wz = doc.getElementById('ctv-player-wake-zone');
      if (wz) {
        if (wz.classList) wz.classList.add('hidden');
        if (wz.style) {
          wz.style.display = 'none';
          wz.style.pointerEvents = 'none';
        }
      }
    } catch (e) {}

    for (var i = 0; i < PLAYER_FLOATING_OVERLAY_IDS.length; i++) {
      try {
        var ov = doc.getElementById(PLAYER_FLOATING_OVERLAY_IDS[i]);
        if (ov) {
          if (ov.style) {
            ov.style.display = 'none';
            ov.style.pointerEvents = 'none';
          }
          if (typeof ov.remove === 'function') ov.remove();
          else if (ov.parentNode) ov.parentNode.removeChild(ov);
        }
      } catch (e) {}
    }

    try {
      var pf = doc.getElementById('player-frame');
      if (pf) {
        try { if (typeof pf.blur === 'function') pf.blur(); } catch (e) {}
        if (pf.classList) pf.classList.add('hidden');
        try { if (typeof pf.removeAttribute === 'function') pf.removeAttribute('sandbox'); } catch (e) {}
        try {
          if (pf.hasAttribute && pf.hasAttribute('srcdoc')) pf.removeAttribute('srcdoc');
        } catch (e) {}
        var curSrc = (typeof pf.getAttribute === 'function' && pf.getAttribute('src')) || pf.src || '';
        if (curSrc !== 'about:blank') {
          try {
            if (pf.contentWindow && typeof pf.contentWindow.stop === 'function') {
              pf.contentWindow.stop();
            }
          } catch (e) {}
          try { pf.src = 'about:blank'; } catch (e) {}
          try {
            if (typeof pf.getAttribute === 'function' && pf.getAttribute('src') !== 'about:blank' && typeof pf.setAttribute === 'function') {
              pf.setAttribute('src', 'about:blank');
            }
          } catch (e) {}
        }
      }
    } catch (e) {}

    try {
      var pv = doc.getElementById('player-video');
      if (pv) {
        try { if (typeof pv.blur === 'function') pv.blur(); } catch (e) {}
        if (pv.classList) pv.classList.add('hidden');
      }
    } catch (e) {}
  }

  function blurStaleOrTouchCardFocus(win, doc) {
    if (!doc || !doc.activeElement) return;
    var ae = doc.activeElement;
    if (ae === doc.body || ae === doc.documentElement) return;

    var aeId = String(ae.id || '');
    var pModal = typeof doc.getElementById === 'function' ? doc.getElementById('player-modal') : null;
    var isPlayerHidden = !isElementModalOpen(pModal);

    var shouldBlur = false;
    if (isPlayerHidden && (aeId === 'player-frame' || aeId === 'player-video')) {
      shouldBlur = true;
    } else if (isInsideHiddenAncestor(ae)) {
      shouldBlur = true;
    } else if (win && win.__ctvLastInputWasTouch === true && isCardElement(ae)) {
      shouldBlur = true;
    }

    if (shouldBlur) {
      try {
        if (typeof ae.blur === 'function') ae.blur();
      } catch (e) {}
    }
  }

  function clearResidualDetailHistoryState(win) {
    try {
      if (!win || !win.history || !win.history.state || typeof win.history.replaceState !== 'function') return;
      var st = win.history.state;
      if (st && (st.view === 'movie-detail' || st.view === 'serie-detail')) {
        var nextState = Object.assign({}, st);
        delete nextState.view;
        delete nextState.slug;
        win.history.replaceState(nextState, '');
      }
    } catch (e) {}
  }

  function ctvRestoreScrollAndInput(opts, boundWin, boundDoc) {
    opts = opts || {};
    var win = opts.win || boundWin || (typeof window !== 'undefined' ? window : null);
    var doc = opts.doc || boundDoc || (win && win.document) || (typeof document !== 'undefined' ? document : null);
    if (!doc || typeof doc.getElementById !== 'function') return null;

    var pModal = doc.getElementById('player-modal');
    var isPlayerHidden = !isElementModalOpen(pModal);

    if (isPlayerHidden || opts.exitFullscreen) {
      safeExitFullscreenAndUnlockOrientation(win, doc);
    }

    if (isPlayerHidden) {
      neutralizeClosedPlayerArtifacts(doc);
    }

    if (win) {
      win.__ctvSwipeActive = false;
      win.__ctvDragActive = false;
      win.__ctvTouchLocked = false;
    }

    var activeScroller = null;
    if (!hasAnyBlockingModalOpen(doc)) {
      var roots = [doc.documentElement, doc.body];
      for (var ri = 0; ri < roots.length; ri++) {
        var r = roots[ri];
        if (!r) continue;
        if (r.style) {
          r.style.overflow = '';
          r.style.overflowY = '';
          r.style.position = '';
          r.style.touchAction = '';
          r.style.pointerEvents = '';
        }
        try {
          if (typeof r.removeAttribute === 'function') r.removeAttribute('inert');
        } catch (e) {}
      }

      var detailModal = doc.getElementById('detail-modal');
      var isDetailOpen = isElementModalOpen(detailModal);
      activeScroller = isDetailOpen
        ? doc.getElementById('detail-body')
        : doc.getElementById('content');

      if (activeScroller) {
        try {
          if (typeof activeScroller.removeAttribute === 'function') activeScroller.removeAttribute('inert');
        } catch (e) {}
        if (activeScroller.style) {
          var savedTop = Number(activeScroller.scrollTop) || 0;
          activeScroller.style.pointerEvents = 'auto';
          activeScroller.style.touchAction = 'pan-y';
          activeScroller.style.overflowX = 'hidden';
          activeScroller.style.overflowY = 'hidden';
          void activeScroller.offsetHeight;
          activeScroller.style.overflowY = 'auto';
          void activeScroller.offsetHeight;
          if (savedTop > 0 && activeScroller.scrollTop !== savedTop) {
            activeScroller.scrollTop = savedTop;
          }
        }
      }
    }

    blurStaleOrTouchCardFocus(win, doc);

    if (win) {
      var raf = typeof win.requestAnimationFrame === 'function'
        ? win.requestAnimationFrame.bind(win)
        : function (cb) { return unrefTimer(setTimeout(cb, 16)); };
      var caf = typeof win.cancelAnimationFrame === 'function'
        ? win.cancelAnimationFrame.bind(win)
        : clearTimeout;

      if (win.__ctvScrollRestoreRaf) {
        try { caf(win.__ctvScrollRestoreRaf); } catch (e) {}
        win.__ctvScrollRestoreRaf = null;
      }
      if (win.__ctvScrollRestoreRaf2) {
        try { caf(win.__ctvScrollRestoreRaf2); } catch (e) {}
        win.__ctvScrollRestoreRaf2 = null;
      }

      win.__ctvScrollRestoreRaf = raf(function () {
        win.__ctvScrollRestoreRaf = null;
        try {
          blurStaleOrTouchCardFocus(win, doc);
          if (!hasAnyBlockingModalOpen(doc)) {
            var dmNow = doc.getElementById('detail-modal');
            var scrollerNow = isElementModalOpen(dmNow)
              ? doc.getElementById('detail-body')
              : doc.getElementById('content');
            if (scrollerNow) {
              if (scrollerNow.style) {
                scrollerNow.style.pointerEvents = 'auto';
                scrollerNow.style.touchAction = 'pan-y';
                scrollerNow.style.overflowX = 'hidden';
                scrollerNow.style.overflowY = 'auto';
              }
              var curTop = scrollerNow.scrollTop;
              scrollerNow.scrollTop = curTop;
            }
          }
          if (win.__ctvLastInputWasTouch === true) {
            win.__ctvScrollRestoreRaf2 = raf(function () {
              win.__ctvScrollRestoreRaf2 = null;
              try { blurStaleOrTouchCardFocus(win, doc); } catch (e2) {}
            });
          }
        } catch (e) {}
      });
    }

    return activeScroller;
  }

  function ctvHandleBackAction(opts, boundWin, boundDoc) {
    opts = opts || {};
    var win = opts.win || boundWin || (typeof window !== 'undefined' ? window : null);
    var doc = opts.doc || boundDoc || (win && win.document) || (typeof document !== 'undefined' ? document : null);
    if (!doc || typeof doc.getElementById !== 'function') return false;

    // 1. Floating player sub-modals (#ctv-quality-modal, #ctv-imgmode-modal, #ctv-subs-modal)
    var subModal = doc.getElementById('ctv-quality-modal') || doc.getElementById('ctv-imgmode-modal') || doc.getElementById('ctv-subs-modal');
    if (isElementModalOpen(subModal)) {
      var retId = subModal.id === 'ctv-quality-modal'
        ? 'player-quality'
        : (subModal.id === 'ctv-imgmode-modal' ? 'player-imgmode' : 'player-subs');
      if (subModal.style) {
        subModal.style.display = 'none';
        subModal.style.pointerEvents = 'none';
      }
      try {
        if (typeof subModal.remove === 'function') subModal.remove();
        else if (subModal.parentNode) subModal.parentNode.removeChild(subModal);
      } catch (e) {}
      var pModalForSub = doc.getElementById('player-modal');
      if (isElementModalOpen(pModalForSub)) {
        if (!win || win.__ctvLastInputWasTouch !== true) {
          var retBtn = doc.getElementById(retId);
          if (retBtn && (!retBtn.classList || !retBtn.classList.contains('hidden')) && typeof retBtn.focus === 'function') {
            try { retBtn.focus({ preventScroll: true }); } catch (e) { try { retBtn.focus(); } catch (x) {} }
          }
        }
      } else if (win && typeof win.ctvRestoreScrollAndInput === 'function') {
        win.ctvRestoreScrollAndInput();
      }
      return true;
    }

    // 2. #player-modal open -> atomic close + full scroll/fullscreen restore
    var pModal = doc.getElementById('player-modal');
    if (isElementModalOpen(pModal)) {
      safeExitFullscreenAndUnlockOrientation(win, doc);
      if (win && typeof win.ctvForceClosePlayer === 'function') {
        win.ctvForceClosePlayer();
      } else if (pModal.classList) {
        pModal.classList.add('hidden');
      }
      if (win && typeof win.ctvRestoreScrollAndInput === 'function') {
        win.ctvRestoreScrollAndInput({ exitFullscreen: true });
      } else {
        ctvRestoreScrollAndInput({ exitFullscreen: true, win: win, doc: doc });
      }
      return true;
    }

    // 3. #update-modal open
    var updModal = doc.getElementById('update-modal');
    if (isElementModalOpen(updModal)) {
      var laterBtn = doc.getElementById('btn-update-later');
      if (laterBtn && (!laterBtn.style || laterBtn.style.display !== 'none') && typeof laterBtn.click === 'function') {
        try { laterBtn.click(); } catch (e) {}
      }
      if (updModal.classList) updModal.classList.add('hidden');
      if (win && typeof win.ctvRestoreScrollAndInput === 'function') {
        win.ctvRestoreScrollAndInput();
      } else {
        ctvRestoreScrollAndInput({ win: win, doc: doc });
      }
      return true;
    }

    // 4. #server-modal open
    var srvModal = doc.getElementById('server-modal');
    if (isElementModalOpen(srvModal)) {
      var srvClose = doc.getElementById('server-close');
      if (srvClose && typeof srvClose.click === 'function') {
        try { srvClose.click(); } catch (e) {}
      }
      if (srvModal.classList) srvModal.classList.add('hidden');
      if (win && typeof win.ctvRestoreScrollAndInput === 'function') {
        win.ctvRestoreScrollAndInput();
      } else {
        ctvRestoreScrollAndInput({ win: win, doc: doc });
      }
      return true;
    }

    // 5. #filter-modal or #adult-modal open
    var filterModal = doc.getElementById('filter-modal');
    if (isElementModalOpen(filterModal)) {
      var filterClose = doc.getElementById('filter-close') || (typeof filterModal.querySelector === 'function' ? filterModal.querySelector('#filter-close') : null);
      if (filterClose && typeof filterClose.click === 'function') {
        try { filterClose.click(); } catch (e) {}
      }
      if (doc.getElementById('filter-modal')) {
        if (filterModal.style) {
          filterModal.style.display = 'none';
          filterModal.style.pointerEvents = 'none';
        }
        try {
          if (typeof filterModal.remove === 'function') filterModal.remove();
          else if (filterModal.parentNode) filterModal.parentNode.removeChild(filterModal);
        } catch (e) {}
      }
      if (win && typeof win.ctvRestoreScrollAndInput === 'function') {
        win.ctvRestoreScrollAndInput();
      } else {
        ctvRestoreScrollAndInput({ win: win, doc: doc });
      }
      return true;
    }

    var adultModal = doc.getElementById('adult-modal');
    if (isElementModalOpen(adultModal)) {
      var adultCancel = doc.getElementById('adult-cancel') || (typeof adultModal.querySelector === 'function' ? adultModal.querySelector('#adult-cancel') : null);
      if (adultCancel && typeof adultCancel.click === 'function') {
        try { adultCancel.click(); } catch (e) {}
      }
      if (doc.getElementById('adult-modal')) {
        if (adultModal.style) {
          adultModal.style.display = 'none';
          adultModal.style.pointerEvents = 'none';
        }
        try {
          if (typeof adultModal.remove === 'function') adultModal.remove();
          else if (adultModal.parentNode) adultModal.parentNode.removeChild(adultModal);
        } catch (e) {}
      }
      if (win && typeof win.ctvRestoreScrollAndInput === 'function') {
        win.ctvRestoreScrollAndInput();
      } else {
        ctvRestoreScrollAndInput({ win: win, doc: doc });
      }
      return true;
    }

    // 6. Active fullscreen without open player
    var isFs = Boolean(
      doc.fullscreenElement ||
      doc.webkitFullscreenElement ||
      (win && win.__ctvIsFullscreen) ||
      (opts && opts.isFullscreen)
    );
    if (isFs) {
      if (win && typeof win.ctvExitFullscreen === 'function') {
        try { win.ctvExitFullscreen(); } catch (e) {}
      }
      if (win && typeof win.ctvRestoreScrollAndInput === 'function') {
        win.ctvRestoreScrollAndInput({ exitFullscreen: true });
      } else {
        ctvRestoreScrollAndInput({ exitFullscreen: true, win: win, doc: doc });
      }
      return true;
    }

    return false;
  }

  function installLateSafeWrapper(winRef, propName, makeWrapper, origStoreKey) {
    var win = winRef || (typeof window !== 'undefined' ? window : null);
    if (!win || !propName || typeof makeWrapper !== 'function') return;
    var storeKey = origStoreKey || ('__ctvOrig_' + propName);
    try {
      var activeWrapped = undefined;
      var applyWrap = function (fn) {
        if (typeof fn !== 'function') {
          activeWrapped = fn;
          return;
        }
        var base = typeof fn[storeKey] === 'function' ? fn[storeKey] : fn;
        var wrapped = makeWrapper(base);
        if (typeof wrapped === 'function') {
          wrapped.__ctvWrapperTag = true;
          wrapped[storeKey] = base;
        }
        activeWrapped = wrapped;
      };

      var cur = win[propName];
      if (cur !== undefined) {
        applyWrap(cur);
      }

      var desc = Object.getOwnPropertyDescriptor(win, propName);
      if (!desc || desc.configurable !== false) {
        Object.defineProperty(win, propName, {
          configurable: true,
          enumerable: true,
          get: function () {
            return activeWrapped;
          },
          set: function (fn) {
            applyWrap(fn);
          }
        });
      } else if (typeof cur === 'function') {
        win[propName] = activeWrapped;
      }
    } catch (e) {
      try {
        var fallbackCur = win[propName];
        if (typeof fallbackCur === 'function') {
          var fallbackBase = typeof fallbackCur[storeKey] === 'function' ? fallbackCur[storeKey] : fallbackCur;
          var fallbackWrapped = makeWrapper(fallbackBase);
          fallbackWrapped.__ctvWrapperTag = true;
          fallbackWrapped[storeKey] = fallbackBase;
          win[propName] = fallbackWrapped;
        }
      } catch (e2) {}
    }
  }

  function installInputModeTracker(win, doc) {
    if (!win) return;
    if (typeof win.__ctvLastInputWasTouch !== 'boolean') {
      win.__ctvLastInputWasTouch = false;
    }
    try {
      if (win.__ctvTouchInputHandler) {
        if (typeof win.removeEventListener === 'function') win.removeEventListener('touchstart', win.__ctvTouchInputHandler, true);
        if (doc && typeof doc.removeEventListener === 'function') doc.removeEventListener('touchstart', win.__ctvTouchInputHandler, true);
      }
      if (win.__ctvPointerInputHandler) {
        if (typeof win.removeEventListener === 'function') win.removeEventListener('pointerdown', win.__ctvPointerInputHandler, true);
      }
      if (win.__ctvKeyInputHandler) {
        if (typeof win.removeEventListener === 'function') win.removeEventListener('keydown', win.__ctvKeyInputHandler, true);
        if (doc && typeof doc.removeEventListener === 'function') doc.removeEventListener('keydown', win.__ctvKeyInputHandler, true);
      }

      win.__ctvTouchInputHandler = function () {
        win.__ctvLastInputWasTouch = true;
      };
      win.__ctvPointerInputHandler = function (ev) {
        if (ev && ev.pointerType === 'touch') {
          win.__ctvLastInputWasTouch = true;
        }
      };
      win.__ctvKeyInputHandler = function (ev) {
        var kc = (ev && (ev.keyCode || ev.which)) || 0;
        var k = (ev && ev.key) || '';
        if (
          k === 'ArrowUp' ||
          k === 'ArrowDown' ||
          k === 'ArrowLeft' ||
          k === 'ArrowRight' ||
          k === 'Enter' ||
          k === 'NumpadEnter' ||
          k === 'Select' ||
          k === 'Tab' ||
          (kc >= 19 && kc <= 23) ||
          kc === 13 ||
          kc === 66
        ) {
          win.__ctvLastInputWasTouch = false;
        }
      };

      if (typeof win.addEventListener === 'function') {
        win.addEventListener('touchstart', win.__ctvTouchInputHandler, { passive: true, capture: true });
        win.addEventListener('pointerdown', win.__ctvPointerInputHandler, { passive: true, capture: true });
        win.addEventListener('keydown', win.__ctvKeyInputHandler, true);
      } else if (doc && typeof doc.addEventListener === 'function') {
        doc.addEventListener('touchstart', win.__ctvTouchInputHandler, { passive: true, capture: true });
        doc.addEventListener('keydown', win.__ctvKeyInputHandler, true);
      }
    } catch (e) {}
  }

  function installBackWrappersAndListeners(win, doc) {
    if (!win || !doc) return;

    // 1. MainActivity.onBackPressed() in CTV.apk invokes window.handleAppBack()
    installLateSafeWrapper(win, 'handleAppBack', function (origHandleAppBack) {
      return function () {
        if (typeof win.ctvHandleBackAction === 'function' && win.ctvHandleBackAction()) {
          return 'cerrado';
        }
        var detailModal = typeof doc.getElementById === 'function' ? doc.getElementById('detail-modal') : null;
        if (isElementModalOpen(detailModal)) {
          if (win.__ctvRestoreFocusTimer) {
            clearTimeout(win.__ctvRestoreFocusTimer);
            win.__ctvRestoreFocusTimer = null;
          }
          if (typeof origHandleAppBack === 'function') {
            origHandleAppBack.apply(this, arguments);
          } else if (detailModal.classList) {
            detailModal.classList.add('hidden');
          }
          if (isElementModalOpen(detailModal) && detailModal.classList) {
            detailModal.classList.add('hidden');
          }
          clearResidualDetailHistoryState(win);
          if (typeof win.ctvRestoreScrollAndInput === 'function') {
            win.ctvRestoreScrollAndInput();
          }
          return 'cerrado';
        }
        if (typeof origHandleAppBack === 'function') {
          return origHandleAppBack.apply(this, arguments);
        }
        return 'exit';
      };
    }, '__ctvOrigHandleAppBack');

    // 2. Legacy / Escape handler in base bundle invokes window.handleAndroidBackPressed()
    installLateSafeWrapper(win, 'handleAndroidBackPressed', function (origAndroidBack) {
      return function () {
        if (typeof win.ctvHandleBackAction === 'function' && win.ctvHandleBackAction()) {
          return true;
        }
        var detailModal = typeof doc.getElementById === 'function' ? doc.getElementById('detail-modal') : null;
        if (isElementModalOpen(detailModal)) {
          if (win.__ctvRestoreFocusTimer) {
            clearTimeout(win.__ctvRestoreFocusTimer);
            win.__ctvRestoreFocusTimer = null;
          }
          var res = typeof origAndroidBack === 'function' ? origAndroidBack.apply(this, arguments) : true;
          if (isElementModalOpen(detailModal) && detailModal.classList) {
            detailModal.classList.add('hidden');
          }
          clearResidualDetailHistoryState(win);
          if (typeof win.ctvRestoreScrollAndInput === 'function') {
            win.ctvRestoreScrollAndInput();
          }
          return res !== undefined ? res : true;
        }
        if (typeof origAndroidBack === 'function') {
          return origAndroidBack.apply(this, arguments);
        }
        return false;
      };
    }, '__ctvOrigHandleAndroidBackPressed');

    // 3. popstate in CAPTURE phase (true) so it always preempts index-BhZlhT-V.js bubble listener
    try {
      if (win.__ctvPopstateHandler && typeof win.removeEventListener === 'function') {
        try { win.removeEventListener('popstate', win.__ctvPopstateHandler, true); } catch (e) {}
        try { win.removeEventListener('popstate', win.__ctvPopstateHandler, false); } catch (e) {}
      }
      win.__ctvPopstateHandler = function (ev) {
        var handled = typeof win.ctvHandleBackAction === 'function'
          ? win.ctvHandleBackAction({ fromPopstate: true })
          : false;
        if (handled) {
          if (ev && typeof ev.stopImmediatePropagation === 'function') {
            ev.stopImmediatePropagation();
          } else if (ev && typeof ev.stopPropagation === 'function') {
            ev.stopPropagation();
          }
        }
        var t = setTimeout(function () {
          if (typeof win.ctvRestoreScrollAndInput === 'function') {
            win.ctvRestoreScrollAndInput();
          }
        }, 0);
        unrefTimer(t);
      };
      if (typeof win.addEventListener === 'function') {
        win.addEventListener('popstate', win.__ctvPopstateHandler, true);
      }
    } catch (e) {}

    // 4. Cordova / WebView document 'backbutton' in capture phase
    try {
      if (win.__ctvDocBackButtonHandler && typeof doc.removeEventListener === 'function') {
        try { doc.removeEventListener('backbutton', win.__ctvDocBackButtonHandler, true); } catch (e) {}
        try { doc.removeEventListener('backbutton', win.__ctvDocBackButtonHandler, false); } catch (e) {}
      }
      win.__ctvDocBackButtonHandler = function (ev) {
        if (typeof win.ctvHandleBackAction === 'function' && win.ctvHandleBackAction()) {
          if (ev && typeof ev.preventDefault === 'function') ev.preventDefault();
          if (ev && typeof ev.stopImmediatePropagation === 'function') ev.stopImmediatePropagation();
          else if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation();
        }
      };
      if (typeof doc.addEventListener === 'function') {
        doc.addEventListener('backbutton', win.__ctvDocBackButtonHandler, true);
      }
    } catch (e) {}
  }

  function installModalCloseObservers(win, doc) {
    if (!win || !doc || typeof doc.getElementById !== 'function') return;
    var ObserverCtor = win.MutationObserver || (typeof MutationObserver === 'function' ? MutationObserver : null);
    if (typeof ObserverCtor !== 'function') return;

    try {
      if (win.__ctvDetailModalClassObserver) {
        try { win.__ctvDetailModalClassObserver.disconnect(); } catch (e) {}
        win.__ctvDetailModalClassObserver = null;
      }
      var detailModal = doc.getElementById('detail-modal');
      if (detailModal) {
        var prevDetailOpen = isElementModalOpen(detailModal);
        var detailObs = new ObserverCtor(function () {
          var nowDetailOpen = isElementModalOpen(detailModal);
          if (prevDetailOpen && !nowDetailOpen) {
            if (win.__ctvRestoreFocusTimer) {
              clearTimeout(win.__ctvRestoreFocusTimer);
              win.__ctvRestoreFocusTimer = null;
            }
            clearResidualDetailHistoryState(win);
            if (typeof win.ctvRestoreScrollAndInput === 'function') {
              win.ctvRestoreScrollAndInput();
            }
          } else if (!prevDetailOpen && nowDetailOpen) {
            if (typeof win.ctvRestoreScrollAndInput === 'function') {
              win.ctvRestoreScrollAndInput();
            }
          }
          prevDetailOpen = nowDetailOpen;
        });
        detailObs.observe(detailModal, { attributes: true, attributeFilter: ['class'] });
        win.__ctvDetailModalClassObserver = detailObs;
      }
    } catch (e) {}

    try {
      if (win.__ctvServerModalClassObserver) {
        try { win.__ctvServerModalClassObserver.disconnect(); } catch (e) {}
        win.__ctvServerModalClassObserver = null;
      }
      var srvModal = doc.getElementById('server-modal');
      if (srvModal) {
        var prevSrvOpen = isElementModalOpen(srvModal);
        var srvObs = new ObserverCtor(function () {
          var nowSrvOpen = isElementModalOpen(srvModal);
          if (prevSrvOpen && !nowSrvOpen) {
            if (win.__ctvRestoreFocusTimer) {
              clearTimeout(win.__ctvRestoreFocusTimer);
              win.__ctvRestoreFocusTimer = null;
            }
            if (typeof win.ctvRestoreScrollAndInput === 'function') {
              win.ctvRestoreScrollAndInput();
            }
          }
          prevSrvOpen = nowSrvOpen;
        });
        srvObs.observe(srvModal, { attributes: true, attributeFilter: ['class'] });
        win.__ctvServerModalClassObserver = srvObs;
      }
    } catch (e) {}
  }

  function installViewportRecoveryListeners(win, doc) {
    if (!win || !doc) return;
    try {
      var scheduleRecovery = function () {
        if (win.__ctvViewportRecoveryTimer) {
          clearTimeout(win.__ctvViewportRecoveryTimer);
        }
        var t = setTimeout(function () {
          win.__ctvViewportRecoveryTimer = null;
          if (typeof win.ctvRestoreScrollAndInput === 'function') {
            win.ctvRestoreScrollAndInput();
          }
        }, 60);
        unrefTimer(t);
        win.__ctvViewportRecoveryTimer = t;
      };

      if (win.__ctvViewportRecoveryHandler) {
        if (typeof doc.removeEventListener === 'function') {
          try { doc.removeEventListener('fullscreenchange', win.__ctvViewportRecoveryHandler); } catch (e) {}
          try { doc.removeEventListener('webkitfullscreenchange', win.__ctvViewportRecoveryHandler); } catch (e) {}
        }
        if (typeof win.removeEventListener === 'function') {
          try { win.removeEventListener('orientationchange', win.__ctvViewportRecoveryHandler); } catch (e) {}
        }
      }
      if (win.__ctvVisibilityRecoveryHandler && typeof doc.removeEventListener === 'function') {
        try { doc.removeEventListener('visibilitychange', win.__ctvVisibilityRecoveryHandler); } catch (e) {}
      }

      win.__ctvViewportRecoveryHandler = function () {
        scheduleRecovery();
      };
      win.__ctvVisibilityRecoveryHandler = function () {
        if (!doc.hidden) {
          scheduleRecovery();
        }
      };

      if (typeof doc.addEventListener === 'function') {
        doc.addEventListener('fullscreenchange', win.__ctvViewportRecoveryHandler);
        doc.addEventListener('webkitfullscreenchange', win.__ctvViewportRecoveryHandler);
        doc.addEventListener('visibilitychange', win.__ctvVisibilityRecoveryHandler);
      }
      if (typeof win.addEventListener === 'function') {
        win.addEventListener('orientationchange', win.__ctvViewportRecoveryHandler);
      }
    } catch (e) {}
  }

  function initScrollGuard(winRef, docRef) {
    var win = winRef || (typeof window !== 'undefined' ? window : null);
    var doc = docRef || (win && win.document) || (typeof document !== 'undefined' ? document : null);
    if (!win) return null;

    ensureScrollGuardStyles(doc);

    win.ctvSyncPlayerWakeZone = function (customDoc) {
      return syncPlayerWakeZoneVisibility(customDoc || doc);
    };
    win.ctvInstallLateSafeWrapper = function (propName, makeWrapper, origStoreKey) {
      return installLateSafeWrapper(win, propName, makeWrapper, origStoreKey);
    };
    win.ctvRestoreScrollAndInput = function (opts) {
      return ctvRestoreScrollAndInput(opts, win, doc);
    };
    win.ctvHandleBackAction = function (opts) {
      return ctvHandleBackAction(opts, win, doc);
    };
    win.__ctvInitScrollGuard = initScrollGuard;

    installInputModeTracker(win, doc);
    installBackWrappersAndListeners(win, doc);
    installModalCloseObservers(win, doc);
    installViewportRecoveryListeners(win, doc);
    syncPlayerWakeZoneVisibility(doc);

    return {
      ctvRestoreScrollAndInput: win.ctvRestoreScrollAndInput,
      ctvHandleBackAction: win.ctvHandleBackAction,
      installLateSafeWrapper: win.ctvInstallLateSafeWrapper,
      syncPlayerWakeZoneVisibility: win.ctvSyncPlayerWakeZone
    };
  }

  /* @ctv-browser-boot-start */
  if (typeof exports === 'undefined') {
    initScrollGuard(typeof window !== 'undefined' ? window : null, typeof document !== 'undefined' ? document : null);
  }
  /* @ctv-browser-boot-end */

  /* @ctv-node-exports-start */
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      SCROLL_GUARD_CSS: SCROLL_GUARD_CSS,
      PLAYER_FLOATING_OVERLAY_IDS: PLAYER_FLOATING_OVERLAY_IDS,
      BLOCKING_MODAL_IDS: BLOCKING_MODAL_IDS,
      isElementModalOpen: isElementModalOpen,
      hasAnyBlockingModalOpen: hasAnyBlockingModalOpen,
      ensureScrollGuardStyles: ensureScrollGuardStyles,
      syncPlayerWakeZoneVisibility: syncPlayerWakeZoneVisibility,
      safeExitFullscreenAndUnlockOrientation: safeExitFullscreenAndUnlockOrientation,
      neutralizeClosedPlayerArtifacts: neutralizeClosedPlayerArtifacts,
      blurStaleOrTouchCardFocus: blurStaleOrTouchCardFocus,
      clearResidualDetailHistoryState: clearResidualDetailHistoryState,
      ctvRestoreScrollAndInput: ctvRestoreScrollAndInput,
      ctvHandleBackAction: ctvHandleBackAction,
      installLateSafeWrapper: installLateSafeWrapper,
      installInputModeTracker: installInputModeTracker,
      installBackWrappersAndListeners: installBackWrappersAndListeners,
      installModalCloseObservers: installModalCloseObservers,
      installViewportRecoveryListeners: installViewportRecoveryListeners,
      initScrollGuard: initScrollGuard
    };
  }
  /* @ctv-node-exports-end */
})();
