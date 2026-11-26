/**
 * CTV Root Stealth Window & Surgical Overlay Shield (Single Source of Truth)
 */
(function () {
  var ALLOWED_ROOT_OPEN_PREFIXES = [
    'https://github.com/Demon11701/CTV-Desktop/',
    'https://objects.githubusercontent.com/',
    'https://release-assets.githubusercontent.com/',
    'sidestore://'
  ];

  var CTV_ALLOWED_BODY_IDS = {
    app: 1,
    'detail-modal': 1,
    'server-modal': 1,
    'update-modal': 1,
    'player-modal': 1,
    'rotate-warning': 1,
    'ctv-splash': 1,
    'ctv-fav-toast': 1,
    'ctv-update-banner': 1,
    'ctv-resume-prompt': 1,
    'ctv-failover-pill': 1,
    'ctv-player-wake-zone': 1,
    'ctv-quality-modal': 1,
    'ctv-imgmode-modal': 1,
    'ctv-subs-modal': 1,
    'ctv-svg-filters': 1,
    'ctv-agenda-status': 1,
    'ctv-player-loader': 1,
    'filter-modal': 1,
    'adult-modal': 1
  };

  var SKIP_TAGS = {
    SCRIPT: 1,
    STYLE: 1,
    LINK: 1,
    META: 1,
    TITLE: 1,
    NOSCRIPT: 1,
    TEMPLATE: 1,
    SVG: 1
  };

  function isAllowedRootOpenUrl(rawUrl) {
    var uStr = typeof rawUrl === 'string' ? rawUrl.trim() : '';
    if (!uStr) return false;
    return ALLOWED_ROOT_OPEN_PREFIXES.some(function (prefix) {
      return uStr.indexOf(prefix) === 0;
    });
  }

  function createStealthDecoyWindow() {
    return {
      closed: false,
      opener: null,
      focus: function () {},
      blur: function () {},
      close: function () { this.closed = true; },
      postMessage: function () {},
      location: {
        href: 'about:blank',
        replace: function (v) { this.href = String(v || 'about:blank'); },
        assign: function (v) { this.href = String(v || 'about:blank'); }
      }
    };
  }

  function installStealthWindowOpenWrapper(winRef, outcomeRecorder) {
    var win = winRef || (typeof window !== 'undefined' ? window : null);
    if (!win) return null;
    try {
      if (!win.__ctvNativeWindowOpen && typeof win.open === 'function' && !win.open.__ctvStealthOpen) {
        win.__ctvNativeWindowOpen = win.open.bind(win);
      }
      var recordFn = typeof outcomeRecorder === 'function'
        ? outcomeRecorder
        : function (k, o) {
          if (typeof win.ctvRecordServerOutcome === 'function') {
            win.ctvRecordServerOutcome(k, o);
          }
        };
      var stealthWinOpen = function (url, target, features) {
        var uStr = typeof url === 'string' ? url.trim() : '';
        if (isAllowedRootOpenUrl(uStr) && typeof win.__ctvNativeWindowOpen === 'function') {
          return win.__ctvNativeWindowOpen(uStr, target, features);
        }
        var tel = win.__ctvActivePlaybackTelemetry;
        if (tel && tel.serverHostKey) {
          recordFn(tel.serverHostKey, { redirect: true });
        }
        return createStealthDecoyWindow();
      };
      stealthWinOpen.__ctvStealthOpen = true;
      win.open = stealthWinOpen;
      return stealthWinOpen;
    } catch (e) {
      return null;
    }
  }

  function cleanBodyForeignNode(node, docRef, winRef) {
    var doc = docRef || (typeof document !== 'undefined' ? document : null);
    var win = winRef || (typeof window !== 'undefined' ? window : null);
    if (!node || node.nodeType !== 1 || !doc || !doc.body || node.parentNode !== doc.body) return false;
    var nid = String(node.id || '');
    if (nid && (CTV_ALLOWED_BODY_IDS[nid] || nid.indexOf('ctv-') === 0)) return false;
    var tag = String(node.tagName || '').toUpperCase();
    if (SKIP_TAGS[tag]) return false;
    try {
      if (tag === 'INS') {
        node.remove();
        return true;
      }
      var locHost = (doc.location && doc.location.hostname) || (win && win.location && win.location.hostname) || '';
      if (tag === 'A' && (node.target === '_blank' || (node.hostname && locHost && node.hostname !== locHost))) {
        node.remove();
        return true;
      }
      var st = win && win.getComputedStyle ? win.getComputedStyle(node) : null;
      var pos = st ? st.position : String((node.style && node.style.position) || '');
      var z = st ? (parseInt(st.zIndex, 10) || 0) : (parseInt((node.style && node.style.zIndex) || '0', 10) || 0);
      var rect = typeof node.getBoundingClientRect === 'function' ? node.getBoundingClientRect() : { width: 0, height: 0 };
      if (tag === 'IFRAME') {
        var src = String(node.getAttribute('src') || '');
        if ((src && src.indexOf('http') === 0 && src.indexOf('http://127.0.0.1') !== 0) || pos === 'fixed' || (rect.width >= 80 && rect.height >= 80) || z >= 20) {
          node.remove();
          return true;
        }
        return false;
      }
      if ((pos === 'fixed' || pos === 'absolute') && (z >= 20 || (rect.width >= 120 && rect.height >= 120))) {
        node.remove();
        return true;
      }
    } catch (e) {}
    return false;
  }

  function installSurgicalRootOverlayCleaner(winRef, docRef) {
    var win = winRef || (typeof window !== 'undefined' ? window : null);
    var doc = docRef || (typeof document !== 'undefined' ? document : null);
    if (!win || !doc) return;
    try {
      function sweepBodyDirectChildren() {
        if (!doc.body || !doc.body.children) return;
        var kids = Array.prototype.slice.call(doc.body.children);
        for (var i = 0; i < kids.length; i++) {
          cleanBodyForeignNode(kids[i], doc, win);
        }
      }

      if (win.__ctvRootOverlayObserver) {
        try { win.__ctvRootOverlayObserver.disconnect(); } catch (e) {}
        win.__ctvRootOverlayObserver = null;
      }
      var bindBodyObs = function () {
        if (!doc.body) return;
        sweepBodyDirectChildren();
        var ObserverCtor = win.MutationObserver || (typeof MutationObserver === 'function' ? MutationObserver : null);
        if (typeof ObserverCtor === 'function') {
          var obs = new ObserverCtor(function (muts) {
            for (var m = 0; m < muts.length; m++) {
              var added = muts[m].addedNodes;
              if (!added) continue;
              for (var a = 0; a < added.length; a++) {
                cleanBodyForeignNode(added[a], doc, win);
              }
            }
          });
          obs.observe(doc.body, { childList: true });
          win.__ctvRootOverlayObserver = obs;
        }
      };
      if (doc.body) bindBodyObs();
      else if (typeof doc.addEventListener === 'function') {
        doc.addEventListener('DOMContentLoaded', bindBodyObs, { once: true });
      }
    } catch (e) {}
  }

  function initStealth(winRef, docRef) {
    installStealthWindowOpenWrapper(winRef);
    installSurgicalRootOverlayCleaner(winRef, docRef);
  }

  /* @ctv-browser-boot-start */
  if (typeof exports === 'undefined') {
    initStealth(typeof window !== 'undefined' ? window : null, typeof document !== 'undefined' ? document : null);
  }
  /* @ctv-browser-boot-end */

  /* @ctv-node-exports-start */
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      ALLOWED_ROOT_OPEN_PREFIXES: ALLOWED_ROOT_OPEN_PREFIXES,
      CTV_ALLOWED_BODY_IDS: CTV_ALLOWED_BODY_IDS,
      SKIP_TAGS: SKIP_TAGS,
      isAllowedRootOpenUrl: isAllowedRootOpenUrl,
      createStealthDecoyWindow: createStealthDecoyWindow,
      installStealthWindowOpenWrapper: installStealthWindowOpenWrapper,
      cleanBodyForeignNode: cleanBodyForeignNode,
      installSurgicalRootOverlayCleaner: installSurgicalRootOverlayCleaner,
      initStealth: initStealth
    };
  }
  /* @ctv-node-exports-end */
})();
