/**
 * CTV Dynamic HD-First Server Scoring & LRU Telemetry (Single Source of Truth)
 */
(function () {
  var CTV_SERVER_SCORES_KEY = 'ctv_server_scores_v1';
  var CTV_SERVER_SCORES_MAX = 80;
  var CTV_SCORE_HALF_LIFE_MS = 72 * 60 * 60 * 1000;
  var _serverScoresCache = null;

  function resolveStorage(storageOverride) {
    if (storageOverride) return storageOverride;
    if (typeof window !== 'undefined' && window && window.localStorage) return window.localStorage;
    return null;
  }

  function ctvInvalidateServerScoresCache() {
    _serverScoresCache = null;
  }

  function ctvExtractServerHostKey(urlOrLabel) {
    if (typeof urlOrLabel !== 'string') return '';
    var s = urlOrLabel.trim();
    if (!s) return '';
    var low = s.toLowerCase();
    if (
      low === '127.0.0.1' ||
      low === 'localhost' ||
      low === '::1' ||
      low === '[::1]' ||
      low === 'about:blank' ||
      low.indexOf('about:') === 0 ||
      low.indexOf('blob:') === 0 ||
      low.indexOf('data:') === 0 ||
      low.indexOf('javascript:') === 0 ||
      low.indexOf('file:') === 0
    ) {
      return '';
    }
    if (low.indexOf('http://') === 0 || low.indexOf('https://') === 0 || low.indexOf('//') === 0) {
      try {
        var parsed = new URL(low.indexOf('//') === 0 ? ('https:' + s) : s);
        var host = String(parsed.hostname || '').toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
        if (!host || host === '127.0.0.1' || host === 'localhost' || host === '::1' || host === '[::1]' || host === 'about:blank') {
          return '';
        }
        return host.slice(0, 180);
      } catch (e) {
        return '';
      }
    }
    if (!/\s/.test(s) && s.indexOf('.') > 0) {
      var hostPart = s.split('/')[0].split('?')[0].split('#')[0].split(':')[0].toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
      if (!hostPart || hostPart === '127.0.0.1' || hostPart === 'localhost' || hostPart === 'about:blank') {
        return '';
      }
      if (/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(hostPart)) {
        return hostPart.slice(0, 180);
      }
    }
    var slug = low;
    try { slug = slug.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (e) {}
    slug = slug.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
    return slug ? ('srv:' + slug) : '';
  }

  function pruneServerScoresMap(rawMap, maxEntries) {
    if (!rawMap || typeof rawMap !== 'object' || Array.isArray(rawMap)) return {};
    var limit = typeof maxEntries === 'number' && maxEntries > 0 ? maxEntries : CTV_SERVER_SCORES_MAX;
    var clampInt = function (n, maxVal) {
      var v = Math.floor(Number(n) || 0);
      return isFinite(v) ? Math.max(0, Math.min(maxVal, v)) : 0;
    };
    var entries = [];
    Object.keys(rawMap).forEach(function (rawKey) {
      var key = typeof rawKey === 'string' ? rawKey.trim().toLowerCase() : '';
      if (
        !key ||
        key.length > 180 ||
        key === '__proto__' ||
        key === 'constructor' ||
        key === 'prototype' ||
        key === '127.0.0.1' ||
        key === 'localhost' ||
        key === 'about:blank'
      ) {
        return;
      }
      var val = rawMap[rawKey];
      if (!val || typeof val !== 'object' || Array.isArray(val)) return;
      var upd = Number(val.updatedAt);
      if (!isFinite(upd) || upd <= 0) return;
      entries.push([
        key,
        {
          ok: clampInt(val.ok, 100000),
          fail: clampInt(val.fail, 100000),
          timeouts: clampInt(val.timeouts, 100000),
          redirects: clampInt(val.redirects, 100000),
          avgMs: clampInt(val.avgMs, 600000),
          maxH: clampInt(val.maxH, 8640),
          consecFail: clampInt(val.consecFail, 1000),
          updatedAt: upd
        }
      ]);
    });
    entries.sort(function (a, b) { return b[1].updatedAt - a[1].updatedAt; });
    var out = {};
    for (var i = 0; i < entries.length && i < limit; i++) {
      out[entries[i][0]] = entries[i][1];
    }
    return out;
  }

  function readServerScoresCache(storageOverride) {
    if (storageOverride) {
      try {
        var rawCustom = JSON.parse(storageOverride.getItem(CTV_SERVER_SCORES_KEY) || '{}');
        return pruneServerScoresMap(rawCustom);
      } catch (e) {
        return {};
      }
    }
    if (_serverScoresCache) return _serverScoresCache;
    var stor = resolveStorage(null);
    if (!stor) return {};
    try {
      var raw = JSON.parse(stor.getItem(CTV_SERVER_SCORES_KEY) || '{}');
      _serverScoresCache = pruneServerScoresMap(raw);
    } catch (e) {
      _serverScoresCache = {};
    }
    return _serverScoresCache;
  }

  function ctvGetServerScores(storageOverride) {
    var cur = readServerScoresCache(storageOverride);
    var copy = {};
    Object.keys(cur).forEach(function (k) {
      copy[k] = Object.assign({}, cur[k]);
    });
    return copy;
  }

  function flushServerScoresToDisk(useBeacon, winRef, storageOverride) {
    var win = winRef || (typeof window !== 'undefined' ? window : null);
    if (!win) return;
    if (win.__ctvServerScoresFlushTimer) {
      clearTimeout(win.__ctvServerScoresFlushTimer);
      win.__ctvServerScoresFlushTimer = null;
    }
    if (!win.__ctvServerScoresDirty) return;
    win.__ctvServerScoresDirty = false;
    try {
      var snapshot = readServerScoresCache(storageOverride);
      if (typeof win.ctvPersistDesktopState === 'function') {
        win.ctvPersistDesktopState({ serverScores: snapshot }, Boolean(useBeacon));
      }
    } catch (e) {}
  }

  function scheduleServerScoresPersist(winRef, storageOverride) {
    var win = winRef || (typeof window !== 'undefined' ? window : null);
    if (!win) return;
    win.__ctvServerScoresDirty = true;
    if (win.__ctvServerScoresFlushTimer) {
      clearTimeout(win.__ctvServerScoresFlushTimer);
    }
    win.__ctvServerScoresFlushTimer = setTimeout(function () {
      flushServerScoresToDisk(false, win, storageOverride);
    }, 1200);
  }

  function ctvRecordServerOutcome(hostOrUrl, outcome, opts) {
    opts = opts || {};
    var key = ctvExtractServerHostKey(hostOrUrl);
    if (!key) return null;
    outcome = outcome && typeof outcome === 'object' ? outcome : {};
    var stor = resolveStorage(opts.storage);
    var map = Object.assign({}, readServerScoresCache(opts.storage));
    var prev = map[key];
    var now = typeof opts.nowMs === 'number' && isFinite(opts.nowMs) && opts.nowMs > 0 ? opts.nowMs : Date.now();
    var rec = prev
      ? Object.assign({}, prev)
      : { ok: 0, fail: 0, timeouts: 0, redirects: 0, avgMs: 0, maxH: 0, consecFail: 0, updatedAt: now };

    if (outcome.ok === true) {
      rec.ok = Math.min(100000, (rec.ok || 0) + 1);
      rec.consecFail = 0;
      if (typeof outcome.startupMs === 'number' && isFinite(outcome.startupMs) && outcome.startupMs >= 0) {
        var ms = Math.min(600000, Math.round(outcome.startupMs));
        rec.avgMs = (!rec.avgMs || rec.ok <= 1) ? ms : Math.round((rec.avgMs * 0.65) + (ms * 0.35));
      }
    } else if (outcome.ok === false || (outcome.timeout && outcome.ok !== true)) {
      rec.fail = Math.min(100000, (rec.fail || 0) + 1);
      rec.consecFail = Math.min(1000, (rec.consecFail || 0) + 1);
    }

    if (outcome.timeout) {
      var tInc = typeof outcome.timeout === 'number' && outcome.timeout > 0 ? Math.floor(outcome.timeout) : 1;
      rec.timeouts = Math.min(100000, (rec.timeouts || 0) + tInc);
    }
    if (outcome.redirect) {
      var rInc = typeof outcome.redirect === 'number' && outcome.redirect > 0 ? Math.floor(outcome.redirect) : 1;
      rec.redirects = Math.min(100000, (rec.redirects || 0) + rInc);
    }

    var rawH = outcome.height != null ? outcome.height : outcome.maxH;
    var hVal = Math.floor(Number(rawH) || 0);
    if (isFinite(hVal) && hVal > 0 && hVal <= 8640) {
      if (outcome.authoritativeMaxH === true || !rec.maxH || (now - (rec.updatedAt || 0)) > (24 * 60 * 60 * 1000)) {
        rec.maxH = hVal;
      } else {
        rec.maxH = Math.max(rec.maxH || 0, hVal);
      }
    }

    rec.updatedAt = now;
    map[key] = rec;
    var pruned = pruneServerScoresMap(map);
    if (!opts.storage) {
      _serverScoresCache = pruned;
    }
    if (stor) {
      try {
        stor.setItem(CTV_SERVER_SCORES_KEY, JSON.stringify(pruned));
      } catch (e) {}
    }
    if (!opts.skipDiskSchedule) {
      scheduleServerScoresPersist(opts.win, opts.storage);
    }
    return pruned[key] ? Object.assign({}, pruned[key]) : null;
  }

  function computeLabelQualityHintScore(labelHint) {
    var hint = String(labelHint || '').toLowerCase();
    if (!hint) return 0;
    if (/(?:360|hdcam|\bcam\b|\bts\b|screener|telecine)/i.test(hint)) return -12;
    if (/(?:1080|fhd|full\s*hd|4k|2160|uhd)/i.test(hint)) return 12;
    if (/(?:720|\bhd\b)/i.test(hint)) return 6;
    return 0;
  }

  function ctvComputeServerScore(hostOrUrl, labelHint, opts) {
    opts = opts || {};
    var key = ctvExtractServerHostKey(hostOrUrl);
    var map = opts.scoresMap ? pruneServerScoresMap(opts.scoresMap) : readServerScoresCache(opts.storage);
    var rec = key ? map[key] : null;
    var hintText = labelHint || (typeof hostOrUrl === 'string' && !/^https?:\/\//i.test(hostOrUrl) ? hostOrUrl : '');
    var labelScore = computeLabelQualityHintScore(hintText);
    if (!rec) return labelScore;

    var now = typeof opts.nowMs === 'number' && isFinite(opts.nowMs) && opts.nowMs > 0 ? opts.nowMs : Date.now();
    var ageMs = Math.max(0, now - (rec.updatedAt || 0));
    var decay = Math.pow(0.5, ageMs / CTV_SCORE_HALF_LIFE_MS);

    var qualScore = 0;
    var activeLabelScore = 0;
    if (rec.maxH > 0) {
      if (rec.maxH >= 1080) qualScore = 45;
      else if (rec.maxH >= 720) qualScore = 30;
      else if (rec.maxH <= 360) qualScore = -32;
      else if (rec.maxH <= 480) qualScore = -15;
    } else {
      activeLabelScore = labelScore;
    }

    var totalAttempts = (rec.ok || 0) + (rec.fail || 0);
    var rateScore = totalAttempts > 0 ? (-35 + ((rec.ok / totalAttempts) * 60)) : 0;
    var consecPenalty = -18 * Math.min(rec.consecFail || 0, 4);
    var timeoutPenalty = -12 * Math.min(rec.timeouts || 0, 4);
    var redirectPenalty = -10 * Math.min(rec.redirects || 0, 4);
    var latencyScore = 0;
    if (rec.avgMs > 0) {
      if (rec.avgMs <= 2500) latencyScore = 10;
      else if (rec.avgMs >= 8000) latencyScore = -10;
    }

    var histScore = qualScore + rateScore + consecPenalty + timeoutPenalty + redirectPenalty + latencyScore;
    var total = (histScore * decay) + activeLabelScore;
    return Math.round(total * 100) / 100;
  }

  function ctvRankServerCandidates(candidates, opts) {
    opts = opts || {};
    var list = Array.isArray(candidates) ? candidates : [];
    if (!list.length) return [];
    var win = opts.win || (typeof window !== 'undefined' ? window : null);
    var scores = opts.scoresMap ? pruneServerScoresMap(opts.scoresMap) : readServerScoresCache(opts.storage);
    var prefs = opts.userPrefs || (win && typeof win.ctvGetUserPrefs === 'function' ? win.ctvGetUserPrefs() : { preferredServer: '' });
    var prefRaw = opts.ignorePreferred ? '' : String(opts.preferredServer != null ? opts.preferredServer : (prefs.preferredServer || '')).trim();
    var prefUpper = prefRaw.toUpperCase();
    var prefHostKey = prefRaw ? ctvExtractServerHostKey(prefRaw) : '';
    var baseScoreFn = typeof opts.baseScoreFn === 'function' ? opts.baseScoreFn : null;

    var wrapped = list.map(function (cand, idx) {
      var url = String((cand && (cand.url || cand.link)) || '');
      var name = String((cand && (cand.server_name || cand.ServerName || cand['server-name'] || cand.name || cand.nombre || cand.label)) || '');
      var qual = String((cand && (cand.calidad || cand.quality)) || '');
      var hint = (name + ' ' + qual).trim();
      var hostKey = ctvExtractServerHostKey(url || name);
      var rec = hostKey ? scores[hostKey] : null;
      var dynScore = ctvComputeServerScore(url || name, hint, { scoresMap: scores, nowMs: opts.nowMs });
      var baseScore = baseScoreFn ? (Number(baseScoreFn(cand)) || 0) : 0;
      var consecFail = rec ? (rec.consecFail || 0) : 0;
      var matchesPref = Boolean(
        prefUpper &&
        ((name && name.toUpperCase() === prefUpper) || (prefHostKey && hostKey && hostKey === prefHostKey))
      );
      return {
        item: cand,
        idx: idx,
        score: dynScore + baseScore,
        isPreferred: Boolean(matchesPref && consecFail < 3)
      };
    });

    wrapped.sort(function (a, b) {
      if (a.isPreferred !== b.isPreferred) return a.isPreferred ? -1 : 1;
      if (b.score !== a.score) return b.score - a.score;
      return a.idx - b.idx;
    });

    return wrapped.map(function (w) { return w.item; });
  }

  function ctvDecorateServerBadges(root, opts) {
    if (!root || !root.querySelectorAll) return;
    opts = opts || {};
    var win = opts.win || (typeof window !== 'undefined' ? window : null);
    var doc = opts.doc || (typeof document !== 'undefined' ? document : null);
    if (!doc) return;
    try {
      var scores = opts.scoresMap ? pruneServerScoresMap(opts.scoresMap) : readServerScoresCache(opts.storage);
      var activeList = Array.isArray(opts.activeList)
        ? opts.activeList
        : (win && Array.isArray(win.__ctvActiveServerList) ? win.__ctvActiveServerList : []);
      var lists = [];
      if (root.matches && root.matches('.server-list, #detail-servers, #server-list')) {
        lists.push(root);
      }
      root.querySelectorAll('.server-list, #detail-servers, #server-list').forEach(function (el) {
        if (lists.indexOf(el) < 0) lists.push(el);
      });
      lists.forEach(function (listEl) {
        var btns = listEl.querySelectorAll('button');
        for (var i = 0; i < btns.length; i++) {
          var btn = btns[i];
          var firstSpan = btn.firstElementChild;
          var btnName = (firstSpan && !firstSpan.classList.contains('server-lang') && !firstSpan.classList.contains('ctv-srv-badge')
            ? String(firstSpan.textContent || '')
            : String(btn.textContent || '')).replace(/^[\s\u25B6]+/, '').trim();
          var candUrl = btn.getAttribute('data-url') || (btn.dataset ? btn.dataset.serverUrl : '') || '';
          if (!candUrl && activeList.length) {
            var atIdx = activeList[i];
            if (atIdx && (!btnName || String(atIdx.name || '').toLowerCase() === btnName.toLowerCase())) {
              candUrl = atIdx.url || '';
            } else if (btnName) {
              var lowName = btnName.toLowerCase();
              for (var j = 0; j < activeList.length; j++) {
                if (activeList[j] && String(activeList[j].name || '').toLowerCase() === lowName) {
                  candUrl = activeList[j].url || '';
                  break;
                }
              }
            }
          }
          var hostKey = ctvExtractServerHostKey(candUrl || btnName);
          var rec = hostKey ? scores[hostKey] : null;
          if (!rec && btnName) {
            var lblKey = ctvExtractServerHostKey(btnName);
            if (lblKey && scores[lblKey]) rec = scores[lblKey];
          }
          var badge = (rec && rec.maxH >= 720) ? 'HD' : ((rec && rec.maxH > 0 && rec.maxH <= 480) ? 'SD' : '');
          var existingBadge = btn.querySelector('.ctv-srv-badge');
          if (!badge) {
            if (existingBadge && existingBadge.parentNode) existingBadge.remove();
            continue;
          }
          if (existingBadge && existingBadge.getAttribute('data-ctv-badge') === badge) {
            continue;
          }
          if (existingBadge && existingBadge.parentNode) existingBadge.remove();
          var badgeEl = doc.createElement('span');
          badgeEl.className = 'ctv-srv-badge ' + (badge === 'HD' ? 'ctv-srv-hd' : 'ctv-srv-sd');
          badgeEl.setAttribute('data-ctv-badge', badge);
          badgeEl.textContent = badge;
          var hostContainer = btn.querySelector('.server-lang') || btn;
          hostContainer.appendChild(badgeEl);
        }
      });
    } catch (e) {}
  }

  function initScoring(winRef) {
    var win = winRef || (typeof window !== 'undefined' ? window : null);
    if (!win) return;
    win.ctvInvalidateServerScoresCache = ctvInvalidateServerScoresCache;
    win.ctvExtractServerHostKey = ctvExtractServerHostKey;
    win.ctvGetServerScores = function () { return ctvGetServerScores(null); };
    win.ctvRecordServerOutcome = function (h, o) { return ctvRecordServerOutcome(h, o, { win: win }); };
    win.ctvComputeServerScore = function (h, l) { return ctvComputeServerScore(h, l); };
    win.ctvRankServerCandidates = function (c, o) { return ctvRankServerCandidates(c, Object.assign({ win: win }, o || {})); };
    win.ctvDecorateServerBadges = function (r) { return ctvDecorateServerBadges(r, { win: win }); };
    win.__ctvPendingServerScoresFlush = function () { flushServerScoresToDisk(false, win); };
    if (!win.__ctvServerScoresUnloadBound && typeof win.addEventListener === 'function') {
      win.__ctvServerScoresUnloadBound = true;
      win.addEventListener('pagehide', function () { flushServerScoresToDisk(true, win); });
      win.addEventListener('beforeunload', function () { flushServerScoresToDisk(true, win); });
    }
  }

  /* @ctv-browser-boot-start */
  if (typeof exports === 'undefined') {
    initScoring(typeof window !== 'undefined' ? window : null);
  }
  /* @ctv-browser-boot-end */

  /* @ctv-node-exports-start */
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      CTV_SERVER_SCORES_KEY: CTV_SERVER_SCORES_KEY,
      CTV_SERVER_SCORES_MAX: CTV_SERVER_SCORES_MAX,
      CTV_SCORE_HALF_LIFE_MS: CTV_SCORE_HALF_LIFE_MS,
      ctvInvalidateServerScoresCache: ctvInvalidateServerScoresCache,
      ctvExtractServerHostKey: ctvExtractServerHostKey,
      pruneServerScoresMap: pruneServerScoresMap,
      readServerScoresCache: readServerScoresCache,
      ctvGetServerScores: ctvGetServerScores,
      ctvRecordServerOutcome: ctvRecordServerOutcome,
      computeLabelQualityHintScore: computeLabelQualityHintScore,
      ctvComputeServerScore: ctvComputeServerScore,
      ctvRankServerCandidates: ctvRankServerCandidates,
      ctvDecorateServerBadges: ctvDecorateServerBadges,
      initScoring: initScoring
    };
  }
  /* @ctv-node-exports-end */
})();
