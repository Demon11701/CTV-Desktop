/**
 * CTV Smart Embed Player, Iframe Ad-Shield Bypass, Auto-Failover & HD Quality Jump
 * (Single Source of Truth for Web/Desktop & OTA)
 */
(function () {
  function ctvConfigureIframeSandbox(iframeEl) {
    if (!iframeEl) return;
    try { iframeEl.removeAttribute('sandbox'); } catch (e) {}
  }

  function notifyActiveEmbedHost(hostOrUrl, winRef) {
    var win = winRef || (typeof window !== 'undefined' ? window : null);
    try {
      var norm = hostOrUrl && win && typeof win.ctvExtractServerHostKey === 'function'
        ? win.ctvExtractServerHostKey(hostOrUrl)
        : '';
      if (norm && norm.indexOf('srv:') === 0) norm = '';
      if (win) {
        win.__ctvActiveEmbedHost = norm || '';
        if (win.DesktopBridge && typeof win.DesktopBridge.setActiveEmbedHost === 'function') {
          Promise.resolve(win.DesktopBridge.setActiveEmbedHost(norm || '')).catch(function () {});
        }
      }
      return norm || '';
    } catch (e) {
      return '';
    }
  }

  function urlsMatchOriginOrHost(failedUrl, activeUrl) {
    if (!failedUrl || !activeUrl) return false;
    var fStr = String(failedUrl).trim();
    var aStr = String(activeUrl).trim();
    if (!fStr || !aStr || aStr === 'about:blank') return false;
    if (fStr === aStr) return true;
    try {
      var u1 = new URL(fStr);
      var u2 = new URL(aStr);
      if (u1.origin && u2.origin && u1.origin === u2.origin) return true;
      var h1 = (u1.hostname || '').replace(/^www\./i, '').toLowerCase();
      var h2 = (u2.hostname || '').replace(/^www\./i, '').toLowerCase();
      if (h1 && h2 && (h1 === h2 || h1.endsWith('.' + h2) || h2.endsWith('.' + h1))) return true;
    } catch (e) {}
    return false;
  }

  function isAgendaSportsUrl(slugOrType, rawUrl) {
    if (slugOrType === 'agenda-deportiva') return true;
    return /tvf90\.com|tv-90\.com|eventos\.html\?r=|ftlly\.com|streamtp|pelotalibre|la12hd|la14hd|futbollibre|ftvhd\.com|dlhd|daddylive|rojadirecta/i.test(String(rawUrl || ''));
  }

  function resolveAgendaServerList(winRef, rawUrl, title, serverName) {
    var win = winRef || (typeof window !== 'undefined' ? window : null);
    var targetUrl = String(rawUrl || '').trim();
    if (!win || !targetUrl) return [];
    var events = Array.isArray(win.__ctvAgendaEvents) ? win.__ctvAgendaEvents : [];
    var baseTitle = String(title || '').split(' · ')[0].trim().toLowerCase();
    var matchedEvent = null;

    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      if (!ev || !Array.isArray(ev.servers) || !ev.servers.length) continue;
      var hasUrl = ev.servers.some(function (s) { return s && s.url === targetUrl; });
      if (!hasUrl) continue;
      if (baseTitle && ev.title && ev.title.toLowerCase() === baseTitle) {
        matchedEvent = ev;
        break;
      }
      if (!matchedEvent) matchedEvent = ev;
    }

    var rawList = matchedEvent ? matchedEvent.servers : [];
    if (!rawList.length) {
      return [{
        url: targetUrl,
        name: String(serverName || 'Servidor 1'),
        quality: /\b(hd|fhd|1080|720)\b/i.test(String(serverName || '')) ? 'HD' : '',
        baseTitle: String(title || '').split(' · ')[0].trim()
      }];
    }

    var seenUrls = new Set();
    var out = [];
    for (var j = 0; j < rawList.length; j++) {
      var srv = rawList[j];
      if (!srv || !srv.url || seenUrls.has(srv.url)) continue;
      seenUrls.add(srv.url);
      out.push({
        url: srv.url,
        name: String(srv.name || ('Opción ' + (out.length + 1))),
        quality: srv.quality || (/\b(hd|fhd|1080|720)\b/i.test(String(srv.name || '')) ? 'HD' : ''),
        baseTitle: srv.baseTitle || matchedEvent.title || String(title || '').split(' · ')[0].trim()
      });
    }
    return out;
  }

  function selectNextFallbackServer(activeList, triedSet, scorerFns) {
    var list = Array.isArray(activeList) ? activeList : [];
    var untried = [];
    for (var i = 0; i < list.length; i++) {
      var cand = list[i];
      if (cand && cand.url && (!triedSet || !triedSet.has(cand.url))) {
        untried.push(cand);
      }
    }
    if (!untried.length) return null;
    if (scorerFns && typeof scorerFns.rankFn === 'function') {
      var ranked = scorerFns.rankFn(untried, {
        ignorePreferred: true,
        baseScoreFn: typeof scorerFns.baseScoreFn === 'function' ? scorerFns.baseScoreFn : null
      });
      return ranked[0] || null;
    }
    return untried[0] || null;
  }

  function shouldAttemptAdShieldBypassRetry(ctx) {
    if (!ctx || !ctx.embedHost) return false;
    var blockedTotal = Number(ctx.blockedTotal) || 0;
    if (blockedTotal <= 0 || ctx.alreadyBypassed || ctx.retriedInSession) return false;
    return ctx.errReason === 'subframe-net-error' || ctx.errReason === 'iframe-timeout' || ctx.errReason === 'iframe-error';
  }

  function shouldSavePreferredServer(ctx) {
    if (!ctx || ctx.isAgendaSports || !ctx.serverName) return false;
    var maxH = Number(ctx.maxHeight) || 0;
    var isConfirmedLowQuality = maxH > 0 && maxH <= 360 && !ctx.qualityJumpCancelled;
    return !isConfirmedLowQuality;
  }

  function selectQualityAutoJumpCandidate(ctx) {
    if (!ctx) return null;
    var list = Array.isArray(ctx.activeList) ? ctx.activeList : [];
    if (!list.length) return null;
    var tried = ctx.tried;
    var scores = ctx.scoresMap || {};
    var scoringFns = ctx.scoringFns || {};
    var extractKeyFn = typeof scoringFns.extractKey === 'function' ? scoringFns.extractKey : function () { return ''; };
    var computeScoreFn = typeof scoringFns.computeScore === 'function' ? scoringFns.computeScore : function () { return 0; };
    var rankFn = typeof scoringFns.rankCandidates === 'function' ? scoringFns.rankCandidates : null;
    var baseScoreFn = typeof scoringFns.baseScoreFn === 'function' ? scoringFns.baseScoreFn : null;

    var curScore = typeof ctx.curScore === 'number'
      ? ctx.curScore
      : computeScoreFn(ctx.currentRawUrl || ctx.currentServerName, ctx.currentServerName);

    var eligible = list.filter(function (c) {
      if (!c || !c.url || (tried && tried.has(c.url))) return false;
      var ck = extractKeyFn(c.url || c.name);
      var crec = ck ? scores[ck] : null;
      if (crec && crec.maxH > 0 && crec.maxH <= 360) return false;
      if (/\b(?:360p?|cam|hdcam|ts|screener|telecine)\b/i.test(String(c.quality || '') + ' ' + String(c.name || ''))) return false;
      var cScore = computeScoreFn(c.url || c.name, (String(c.name || '') + ' ' + String(c.quality || '')).trim());
      return cScore > curScore;
    });
    if (!eligible.length) return null;
    var ranked = rankFn
      ? rankFn(eligible, { ignorePreferred: true, baseScoreFn: baseScoreFn })
      : eligible;
    return ranked[0] || null;
  }

  function resolveWatchMediaMeta(title, slugOrType, resumeKey, isAgendaSports, serverName, winRef) {
    var win = winRef || (typeof window !== 'undefined' ? window : null);
    if (isAgendaSports || slugOrType === 'agenda-deportiva') return null;
    if (win && win.__ctvCurrentItem && win.__ctvCurrentItem.kind === 'tv') return null;
    var slugFromArg = (slugOrType && typeof slugOrType === 'string' && slugOrType !== 'agenda-deportiva') ? slugOrType.trim() : '';
    var slugFromRk = resumeKey ? String(resumeKey).split('|')[0].trim() : '';
    var slugFromCur = (win && win.__ctvCurrentItem && win.__ctvCurrentItem.slug) ? String(win.__ctvCurrentItem.slug).trim() : '';
    var slug = slugFromArg || slugFromRk || slugFromCur;
    if (!slug) return null;

    var rkStr = String(resumeKey || '');
    var titleStr = String(title || '');
    var epMatch = rkStr.match(/\|(t\d+e\d+)(?:\||$)/i);
    var sNum = 0;
    var eNum = 0;
    var isEp = false;
    if (epMatch) {
      var partsMatch = epMatch[1].match(/^t(\d+)e(\d+)$/i);
      if (partsMatch) {
        sNum = parseInt(partsMatch[1], 10);
        eNum = parseInt(partsMatch[2], 10);
        isEp = true;
      }
    } else {
      var tMatch = titleStr.match(/\bT(\d+)\s*E(\d+)\b/i);
      if (tMatch) {
        sNum = parseInt(tMatch[1], 10);
        eNum = parseInt(tMatch[2], 10);
        isEp = true;
      }
    }

    var mediaKey = isEp ? ('serie:' + slug + ':t' + sNum + 'e' + eNum) : ('movie:' + slug);
    var type = isEp ? 'serie' : 'movie';
    var epLabel = isEp ? ('T' + sNum + 'E' + eNum) : '';

    var curItem = (win && win.__ctvCurrentItem && (!win.__ctvCurrentItem.slug || win.__ctvCurrentItem.slug === slug)) ? win.__ctvCurrentItem : null;
    var catItem = (win && win.__ctvCatalog && win.__ctvCatalog[slug]) || null;

    var cleanTitle = titleStr.replace(/\s*·\s*Conectando…\s*$/i, '').trim();
    if (serverName) {
      var srvSuffix = ' · ' + String(serverName).trim();
      if (cleanTitle.length > srvSuffix.length && cleanTitle.slice(-srvSuffix.length).toLowerCase() === srvSuffix.toLowerCase()) {
        cleanTitle = cleanTitle.slice(0, -srvSuffix.length).trim();
      }
    }
    if (!cleanTitle && curItem && curItem.title) cleanTitle = String(curItem.title).trim();
    if (!cleanTitle && catItem) cleanTitle = String(catItem.titulo || catItem.nombre || catItem.title || '').trim();

    var rawPoster = (curItem && curItem.poster) || (catItem && (catItem.img_frente || catItem.imagen || catItem.poster)) || '';
    var poster = rawPoster && win && typeof win.ctvNormPosterUrl === 'function' ? win.ctvNormPosterUrl(rawPoster) : String(rawPoster || '');

    return {
      mediaKey: mediaKey,
      slug: slug,
      type: type,
      ep: epLabel,
      title: cleanTitle,
      poster: poster
    };
  }

  function initQualityFailover(deps) {
    deps = deps || {};
    var win = deps.win || (typeof window !== 'undefined' ? window : {});
    var doc = deps.doc || (typeof document !== 'undefined' ? document : null);
    var noop = function () {};
    var cleanupActivePlayback = deps.cleanupActivePlayback || noop;
    var cleanupSubs = deps.cleanupSubs || noop;
    var removeAgendaStatusOverlay = deps.removeAgendaStatusOverlay || noop;
    var removeFailoverPill = deps.removeFailoverPill || noop;
    var removeResumePrompt = deps.removeResumePrompt || noop;
    var ctvOpenModalSafe = deps.ctvOpenModalSafe || noop;
    var ensureImageModeButton = deps.ensureImageModeButton || function () { return null; };
    var applyImageMode = deps.applyImageMode || noop;
    var showPlayerLoader = deps.showPlayerLoader || noop;
    var removePlayerLoader = deps.removePlayerLoader || noop;
    var registerPlaybackCleanup = deps.registerPlaybackCleanup || noop;
    var extractDirectStream = deps.extractDirectStream || function () { return Promise.resolve(null); };
    var getActiveHls = deps.getActiveHls || function () { return null; };
    var attachSubtitlesToVideo = deps.attachSubtitlesToVideo || noop;
    var isExtractableServer = deps.isExtractableServer || function () { return false; };

    function iconHtml(name, size) {
      return typeof win.ctvIcon === 'function' ? win.ctvIcon(name, size) : '';
    }

    function findNextFallbackServer(triedSet) {
      var list = Array.isArray(win.__ctvActiveServerList) ? win.__ctvActiveServerList : [];
      return selectNextFallbackServer(list, triedSet, {
        rankFn: typeof win.ctvRankServerCandidates === 'function' ? win.ctvRankServerCandidates : null,
        baseScoreFn: typeof win.ctvServerBaseTierScore === 'function' ? win.ctvServerBaseTierScore : null
      });
    }

    function focusNextServerAfterClose() {
      var currentBtn = win.__ctvLastServerBtn;
      if (typeof win.ctvForceClosePlayer === 'function') win.ctvForceClosePlayer();
      else if (typeof win.__ctvClosePlayer === 'function') win.__ctvClosePlayer();
      setTimeout(function () {
        if (!doc) return;
        try {
          var scope = (currentBtn && currentBtn.closest && currentBtn.closest('.agenda-embeds, #detail-servers, #serie-servers-wrap, .server-list')) ||
            doc.querySelector('#serie-servers-wrap .server-list, #detail-servers, .agenda-embeds');
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

    function ensureNextServerButton() {
      if (!doc) return null;
      var pBar = doc.getElementById('player-bar');
      if (!pBar) return null;
      var btn = doc.getElementById('player-next-srv');
      if (!btn) {
        btn = doc.createElement('button');
        btn.id = 'player-next-srv';
        btn.type = 'button';
        btn.className = 'btn focusable hidden';
        btn.tabIndex = 0;
        btn.title = 'Cambiar al siguiente servidor';
        btn.setAttribute('aria-label', 'Cambiar servidor');
        btn.innerHTML = iconHtml('server', 16) + '<span class="ctv-btn-lbl">Servidor</span>';
        var qBtn = doc.getElementById('player-quality');
        var mBtn = doc.getElementById('player-imgmode');
        var subBtn = doc.getElementById('player-subs');
        var favBtn = doc.getElementById('player-fav');
        var anchor = (qBtn && qBtn.parentNode === pBar && qBtn) ||
          (mBtn && mBtn.parentNode === pBar && mBtn) ||
          (subBtn && subBtn.parentNode === pBar && subBtn) ||
          (favBtn && favBtn.parentNode === pBar && favBtn) ||
          null;
        if (anchor) pBar.insertBefore(btn, anchor);
        else pBar.appendChild(btn);
      }
      return btn;
    }

    function runWithSmartModalGuard(fn) {
      win.__ctvSmartModalGuard = (win.__ctvSmartModalGuard || 0) + 1;
      try {
        return fn();
      } finally {
        win.__ctvSmartModalGuard = Math.max(0, (win.__ctvSmartModalGuard || 1) - 1);
      }
    }

    function openModalWithSmartGuard(title) {
      return runWithSmartModalGuard(function () {
        return ctvOpenModalSafe(title);
      });
    }

    function updateNextServerButton(isAgendaSports, rawUrl, title, slugOrType, resumeKey, failoverState) {
      var btn = ensureNextServerButton();
      if (!btn) return;
      var isLiveTv = Boolean(win.__ctvCurrentItem && win.__ctvCurrentItem.kind === 'tv');
      var list = Array.isArray(win.__ctvActiveServerList) ? win.__ctvActiveServerList : [];
      if (isLiveTv || list.length <= 1) {
        btn.classList.add('hidden');
        btn.onclick = null;
        return;
      }
      btn.classList.remove('hidden');
      btn.onclick = function (e) {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        var srvList = Array.isArray(win.__ctvActiveServerList) ? win.__ctvActiveServerList : [];
        if (srvList.length <= 1) return;
        var nextSrv = failoverState && failoverState.tried ? findNextFallbackServer(failoverState.tried) : null;
        var nextFs = failoverState;
        if (!nextSrv) {
          var curIdx = -1;
          for (var i = 0; i < srvList.length; i++) {
            if (srvList[i] && srvList[i].url === rawUrl) { curIdx = i; break; }
          }
          nextSrv = srvList[(curIdx + 1) % srvList.length];
          if (nextSrv) {
            nextFs = {
              tried: new Set([nextSrv.url]),
              hop: 0,
              playbackSessionId: failoverState ? failoverState.playbackSessionId : undefined,
              qualityJumpCount: failoverState ? (failoverState.qualityJumpCount || 0) : 0,
              qualityJumpCancelled: failoverState ? Boolean(failoverState.qualityJumpCancelled) : false,
              __bypassRetriedHosts: failoverState && failoverState.__bypassRetriedHosts ? failoverState.__bypassRetriedHosts : new Set(),
              originalUrl: failoverState ? failoverState.originalUrl : rawUrl,
              originalTitle: failoverState ? failoverState.originalTitle : String(title || 'Reproduciendo'),
              originalServer: failoverState ? failoverState.originalServer : ''
            };
          }
        } else if (nextFs) {
          nextFs.tried.add(nextSrv.url);
        }
        if (!nextSrv || !nextSrv.url) return;
        var nextTitle = nextSrv.baseTitle
          ? (nextSrv.baseTitle + ' · ' + nextSrv.name)
          : ((title || '').split(' · ')[0] + ' · ' + nextSrv.name);
        if (typeof win.ctvShowToast === 'function') {
          win.ctvShowToast('Cambiando a ' + nextSrv.name);
        }
        removeFailoverPill();
        win.ctvPlaySmartEmbed(nextSrv.url, nextTitle, nextSrv.name, slugOrType, resumeKey, nextFs);
      };
    }

    function showFailoverPill(nextServerName, onCancel) {
      removeFailoverPill();
      if (!doc) return null;
      var modal = doc.getElementById('player-modal');
      if (!modal || modal.classList.contains('hidden')) return null;
      var pill = doc.createElement('div');
      pill.id = 'ctv-failover-pill';
      pill.setAttribute('role', 'status');
      pill.innerHTML =
        iconHtml('server', 16) +
        '<span class="ctv-fp-txt"></span>' +
        '<button type="button" id="ctv-failover-cancel" class="btn focusable" tabindex="0">Cancelar</button>' +
        '<button type="button" id="ctv-failover-back" class="btn ctv-btn-primary focusable" tabindex="0">Volver</button>';
      var txtEl = pill.querySelector('.ctv-fp-txt');
      if (txtEl) txtEl.textContent = 'Cambiando a ' + (nextServerName || 'servidor alternativo') + '...';
      var cancelBtn = pill.querySelector('#ctv-failover-cancel');
      var backBtn = pill.querySelector('#ctv-failover-back');
      if (cancelBtn) {
        cancelBtn.onclick = function (ev) {
          if (ev) { ev.preventDefault(); ev.stopPropagation(); }
          if (typeof onCancel === 'function') onCancel();
        };
      }
      if (backBtn) {
        backBtn.onclick = function (ev) {
          if (ev) { ev.preventDefault(); ev.stopPropagation(); }
          if (typeof win.ctvForceClosePlayer === 'function') win.ctvForceClosePlayer();
        };
      }
      modal.appendChild(pill);
      return pill;
    }

    function openInCleanIframe(rawUrl, title, onErrorCb, sessionId, keepFailoverPill, opts) {
      opts = opts || {};
      var activeSid = typeof sessionId === 'number' ? sessionId : (win.__ctvPlaySessionId || 0);
      if (typeof sessionId === 'number' && win.__ctvPlaySessionId !== activeSid) return;
      cleanupActivePlayback();
      cleanupSubs();
      removeAgendaStatusOverlay();
      if (!keepFailoverPill) removeFailoverPill();
      openModalWithSmartGuard(title);
      var mBtnIf = ensureImageModeButton();
      if (mBtnIf) {
        applyImageMode(null, false);
        mBtnIf.classList.remove('hidden');
      }
      if (typeof win.ctvUpdateFavButtonsUI === 'function') {
        win.ctvUpdateFavButtonsUI();
      }
      showPlayerLoader('Cargando servidor…');
      var embedHost = notifyActiveEmbedHost(rawUrl, win);
      if (win.__ctvActivePlaybackTelemetry) {
        win.__ctvActivePlaybackTelemetry.embedHost = embedHost;
      }
      var attemptStartAt = Date.now();
      var f = doc ? doc.getElementById('player-frame') : null;
      if (f) {
        ctvConfigureIframeSandbox(f);
        f.removeAttribute('referrerpolicy');
        try { f.removeAttribute('srcdoc'); } catch (e) {}
        f.classList.remove('hidden');
        var loaderDone = false;
        var errorFired = false;
        var iframeLoadWatchdog = null;
        var iframeStableTimer = null;
        var doneLoader = function () {
          if (loaderDone) return;
          loaderDone = true;
          removePlayerLoader();
        };
        var triggerIframeErr = function (errReason, errPayload) {
          if (errorFired || win.__ctvPlaySessionId !== activeSid) return;
          errorFired = true;
          if (iframeLoadWatchdog) { clearTimeout(iframeLoadWatchdog); iframeLoadWatchdog = null; }
          if (iframeStableTimer) { clearTimeout(iframeStableTimer); iframeStableTimer = null; }
          win.__ctvActiveSubframeErrorCb = null;
          doneLoader();
          var tel = win.__ctvActivePlaybackTelemetry;
          var blockedTotal = Math.max((tel && tel.blockedCount) || 0, Number(errPayload && errPayload.blockedCount) || 0);
          if (!(win.__ctvAdShieldBypassHosts instanceof Set)) {
            win.__ctvAdShieldBypassHosts = new Set(Array.isArray(win.__ctvAdShieldBypassHosts) ? win.__ctvAdShieldBypassHosts : []);
          }
          var fs = opts.failoverState || win.__ctvActiveFailoverState;
          if (fs && !fs.__bypassRetriedHosts) fs.__bypassRetriedHosts = new Set();
          var alreadyBypassed = Boolean(embedHost && win.__ctvAdShieldBypassHosts.has(embedHost));
          var retriedInSession = Boolean(embedHost && fs && fs.__bypassRetriedHosts && fs.__bypassRetriedHosts.has(embedHost));
          if (shouldAttemptAdShieldBypassRetry({
            embedHost: embedHost,
            blockedTotal: blockedTotal,
            alreadyBypassed: alreadyBypassed,
            retriedInSession: retriedInSession,
            errReason: errReason
          })) {
            win.__ctvAdShieldBypassHosts.add(embedHost);
            if (fs && fs.__bypassRetriedHosts) fs.__bypassRetriedHosts.add(embedHost);
            if (tel) tel.blockedCount = 0;
            var bypassCall = (win.DesktopBridge && typeof win.DesktopBridge.bypassAdShieldForHost === 'function')
              ? Promise.resolve(win.DesktopBridge.bypassAdShieldForHost(embedHost))
              : Promise.resolve();
            bypassCall.catch(function () {}).then(function () {
              if (win.__ctvPlaySessionId !== activeSid || (fs && fs.cancelled)) return;
              openInCleanIframe(rawUrl, title, onErrorCb, activeSid, keepFailoverPill, opts);
            });
            return;
          }
          if (typeof onErrorCb === 'function') onErrorCb(errReason || 'iframe-error');
        };
        var onLoad = function () {
          if (iframeLoadWatchdog) { clearTimeout(iframeLoadWatchdog); iframeLoadWatchdog = null; }
          doneLoader();
          if (!errorFired && win.__ctvPlaySessionId === activeSid) {
            removeFailoverPill();
            var loadMs = Math.max(0, Date.now() - attemptStartAt);
            if (iframeStableTimer) clearTimeout(iframeStableTimer);
            iframeStableTimer = setTimeout(function () {
              iframeStableTimer = null;
              if (!errorFired && win.__ctvPlaySessionId === activeSid && typeof opts.onSuccessCb === 'function') {
                opts.onSuccessCb(loadMs);
              }
            }, 1800);
          }
        };
        var onErr = function () {
          triggerIframeErr('iframe-error', null);
        };
        f.addEventListener('load', onLoad, { once: true });
        f.addEventListener('error', onErr, { once: true });
        var safeHideTimer = setTimeout(doneLoader, 5000);
        iframeLoadWatchdog = setTimeout(function () {
          triggerIframeErr('iframe-timeout', null);
        }, 12500);
        win.__ctvActiveSubframeErrorCb = function (payload) {
          var failedUrl = payload && payload.url ? String(payload.url) : '';
          if (urlsMatchOriginOrHost(failedUrl, rawUrl)) {
            triggerIframeErr('subframe-net-error', payload || null);
          }
        };
        registerPlaybackCleanup(function () {
          clearTimeout(safeHideTimer);
          if (iframeLoadWatchdog) { clearTimeout(iframeLoadWatchdog); iframeLoadWatchdog = null; }
          if (iframeStableTimer) { clearTimeout(iframeStableTimer); iframeStableTimer = null; }
          win.__ctvActiveSubframeErrorCb = null;
          try { f.removeEventListener('load', onLoad); } catch (e) {}
          try { f.removeEventListener('error', onErr); } catch (e) {}
        });
        f.src = rawUrl;
        var backBtn = doc ? doc.getElementById('player-back') : null;
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
      removeFailoverPill();
      if (!doc) return;
      var modal = doc.getElementById('player-modal');
      if (!modal) return;
      openModalWithSmartGuard(title || 'Reproducción');
      var pf = doc.getElementById('player-frame');
      var pv = doc.getElementById('player-video');
      if (pf) { pf.classList.add('hidden'); pf.src = 'about:blank'; }
      if (pv) { try { pv.pause(); } catch (e) {} pv.classList.add('hidden'); }

      var isSports = opts.isSports !== false;
      var headingIcon = opts.iconHtml || iconHtml(isSports ? 'tv' : 'warning', 34);
      var heading = opts.heading || (isSports ? 'Servidor sin señal en este momento' : 'No se pudo cargar este servidor');
      var backLabel = opts.backLabel || 'Volver';
      var showSwitch = opts.showSwitch !== false;

      var box = doc.createElement('div');
      box.id = 'ctv-agenda-status';
      box.style.cssText = 'position:absolute;inset:0;z-index:15;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:24px;text-align:center;background:radial-gradient(circle at center,#141821 0%,#0B0D12 100%);color:var(--ctv-text)';
      box.innerHTML =
        '<div style="color:var(--ctv-muted)">' + headingIcon + '</div>' +
        '<h3 style="font-size:1.2rem;font-weight:800;max-width:460px;margin:0">' + heading + '</h3>' +
        '<p style="font-size:.92rem;color:var(--ctv-muted);max-width:460px;line-height:1.45;margin:0">' + (subtitle || 'El servidor está saturado o no respondió a tiempo. Puedes reintentar o elegir otro servidor.') + '</p>' +
        '<div class="ctv-as-actions" style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center;margin-top:6px">' +
        '<button id="ctv-agenda-retry" class="btn ctv-btn-primary focusable" tabindex="0" style="font-weight:700;padding:10px 20px">' + iconHtml('restart', 16) + '<span>Reintentar</span></button>' +
        (showSwitch ? '<button id="ctv-agenda-switch" class="btn focusable" tabindex="0" style="padding:10px 20px">' + iconHtml('server', 16) + '<span>Cambiar servidor</span></button>' : '') +
        '<button id="ctv-agenda-back" class="btn focusable" tabindex="0" style="padding:10px 20px">' + iconHtml('back', 16) + '<span>' + backLabel + '</span></button>' +
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
          if (typeof win.ctvForceClosePlayer === 'function') win.ctvForceClosePlayer();
          else if (typeof win.__ctvClosePlayer === 'function') win.__ctvClosePlayer();
        };
      }
      if (typeof win.ctvRevealPlayerBar === 'function') {
        win.ctvRevealPlayerBar();
      }
      setTimeout(function () {
        if (retryBtn && retryBtn.focus) retryBtn.focus();
      }, 40);
    }

    function showResumePrompt(videoEl, mediaMeta, saved, sessionAtBind, failoverState) {
      removeResumePrompt();
      if (!doc || win.__ctvPlaySessionId !== sessionAtBind) return;
      var modal = doc.getElementById('player-modal');
      if (!modal || modal.classList.contains('hidden')) return;
      var label = typeof win.ctvFormatWatchTime === 'function' ? win.ctvFormatWatchTime(saved.t) : (Math.floor(saved.t) + 's');

      var prompt = doc.createElement('div');
      prompt.id = 'ctv-resume-prompt';

      var txt = doc.createElement('span');
      txt.style.cssText = 'font-weight:600;color:var(--ctv-text)';
      var epLabel = (mediaMeta && mediaMeta.ep) || saved.ep || '';
      txt.textContent = 'Continuar' + (epLabel ? (' ' + epLabel) : '') + ' en ' + label;

      var yesBtn = doc.createElement('button');
      yesBtn.id = 'ctv-resume-yes';
      yesBtn.type = 'button';
      yesBtn.className = 'btn ctv-btn-primary focusable';
      yesBtn.tabIndex = 0;
      yesBtn.innerHTML = iconHtml('play', 14) + '<span>Reanudar</span>';

      var noBtn = doc.createElement('button');
      noBtn.id = 'ctv-resume-no';
      noBtn.type = 'button';
      noBtn.className = 'btn focusable';
      noBtn.tabIndex = 0;
      noBtn.innerHTML = '<span>Desde el inicio</span>';

      yesBtn.onclick = function (ev) {
        if (ev) ev.stopPropagation();
        if (failoverState) failoverState.__resumePromptHandled = true;
        removeResumePrompt();
        try {
          videoEl.currentTime = saved.t;
          videoEl.play().catch(function () {});
        } catch (e) {}
        if (typeof win.ctvShowToast === 'function') {
          win.ctvShowToast('Reanudado en ' + label);
        }
        try { videoEl.focus(); } catch (e) {}
      };

      noBtn.onclick = function (ev) {
        if (ev) ev.stopPropagation();
        if (failoverState) failoverState.__resumePromptHandled = true;
        removeResumePrompt();
        if (typeof win.ctvRemoveWatchProgressEntry === 'function') {
          win.ctvRemoveWatchProgressEntry(mediaMeta.mediaKey);
        }
        if (typeof win.ctvUpdateFavButtonsUI === 'function') {
          win.ctvUpdateFavButtonsUI();
        }
        try {
          videoEl.currentTime = 0;
          videoEl.play().catch(function () {});
        } catch (e) {}
        try { videoEl.focus(); } catch (e) {}
      };

      prompt.appendChild(txt);
      prompt.appendChild(yesBtn);
      prompt.appendChild(noBtn);
      modal.appendChild(prompt);

      if (!doc.getElementById('ctv-quality-modal') && !doc.getElementById('ctv-subs-modal') && !doc.getElementById('ctv-imgmode-modal')) {
        setTimeout(function () {
          try {
            if (prompt.isConnected && !doc.getElementById('ctv-quality-modal') && !doc.getElementById('ctv-subs-modal') && !doc.getElementById('ctv-imgmode-modal')) {
              yesBtn.focus({ preventScroll: true });
            }
          } catch (e) { try { yesBtn.focus(); } catch (x) {} }
        }, 60);
      }

      win.__ctvResumePromptTimer = setTimeout(function () {
        if (failoverState) failoverState.__resumePromptHandled = true;
        var hadFocus = doc && prompt.contains(doc.activeElement);
        removeResumePrompt();
        if (hadFocus && videoEl && videoEl.isConnected) {
          try { videoEl.focus({ preventScroll: true }); } catch (e) {}
        }
      }, 8500);
    }

    function bindWatchProgressTracker(videoEl, mediaMeta, failoverState) {
      if (!videoEl || !mediaMeta || !mediaMeta.mediaKey) return;
      var sessionAtBind = win.__ctvPlaySessionId;
      var lastSavedTs = 0;
      var lastKnownTime = 0;
      var lastKnownDuration = 0;
      var promptShown = false;
      var cleaned = false;

      function updateKnownPosition() {
        var curT = Number(videoEl.currentTime);
        var curD = Number(videoEl.duration);
        if (isFinite(curD) && curD >= 60 && isFinite(curT) && curT >= 0) {
          lastKnownTime = curT;
          lastKnownDuration = curD;
        }
      }

      function flushProgress(forceImmediate) {
        if (cleaned) return;
        updateKnownPosition();
        var t = lastKnownTime;
        var d = lastKnownDuration;
        if (!isFinite(d) || d < 60 || !isFinite(t)) return;
        var ratio = t / d;
        if (ratio >= 0.93) {
          var curMap = typeof win.ctvGetWatchProgressMap === 'function' ? win.ctvGetWatchProgressMap() : {};
          if (curMap && curMap[mediaMeta.mediaKey]) {
            if (typeof win.ctvRemoveWatchProgressEntry === 'function') {
              win.ctvRemoveWatchProgressEntry(mediaMeta.mediaKey);
            }
            if (typeof win.ctvUpdateFavButtonsUI === 'function') {
              win.ctvUpdateFavButtonsUI();
            }
          }
          return;
        }
        if (t >= 15) {
          var now = Date.now();
          if (!forceImmediate && (now - lastSavedTs) < 12000) return;
          lastSavedTs = now;
          if (typeof win.ctvSaveWatchProgressEntry === 'function') {
            win.ctvSaveWatchProgressEntry(mediaMeta.mediaKey, {
              t: t,
              d: d,
              title: mediaMeta.title,
              poster: mediaMeta.poster,
              type: mediaMeta.type,
              slug: mediaMeta.slug,
              ep: mediaMeta.ep,
              updatedAt: now
            });
          }
          if (typeof win.ctvUpdateFavButtonsUI === 'function') {
            win.ctvUpdateFavButtonsUI();
          }
        }
      }

      function maybeShowResumePrompt() {
        if (promptShown || cleaned || win.__ctvPlaySessionId !== sessionAtBind) return;
        if (failoverState && failoverState.__resumePromptHandled) return;
        var d = Number(videoEl.duration);
        if (!isFinite(d) || d < 60) return;
        promptShown = true;
        var map = typeof win.ctvGetWatchProgressMap === 'function' ? win.ctvGetWatchProgressMap() : {};
        var saved = map[mediaMeta.mediaKey];
        if (!saved || typeof saved.t !== 'number' || saved.t < 15) return;
        if (saved.d && (saved.t / saved.d) >= 0.93) return;
        if ((saved.t / d) >= 0.93) return;
        showResumePrompt(videoEl, mediaMeta, saved, sessionAtBind, failoverState);
      }

      var onMetaOrPlay = function () {
        updateKnownPosition();
        maybeShowResumePrompt();
      };
      var onTimeUpdate = function () { flushProgress(false); };
      var onPause = function () { flushProgress(true); };
      var onEnded = function () {
        updateKnownPosition();
        if (lastKnownDuration >= 60) lastKnownTime = lastKnownDuration;
        flushProgress(true);
      };
      var onPageLeave = function () { flushProgress(true); };

      videoEl.addEventListener('loadedmetadata', onMetaOrPlay);
      videoEl.addEventListener('playing', onMetaOrPlay);
      videoEl.addEventListener('timeupdate', onTimeUpdate);
      videoEl.addEventListener('pause', onPause);
      videoEl.addEventListener('ended', onEnded);
      if (typeof win.addEventListener === 'function') {
        win.addEventListener('pagehide', onPageLeave);
        win.addEventListener('beforeunload', onPageLeave);
      }

      if (videoEl.readyState >= 1) onMetaOrPlay();

      registerPlaybackCleanup(function () {
        flushProgress(true);
        cleaned = true;
        removeResumePrompt();
        try { videoEl.removeEventListener('loadedmetadata', onMetaOrPlay); } catch (e) {}
        try { videoEl.removeEventListener('playing', onMetaOrPlay); } catch (e) {}
        try { videoEl.removeEventListener('timeupdate', onTimeUpdate); } catch (e) {}
        try { videoEl.removeEventListener('pause', onPause); } catch (e) {}
        try { videoEl.removeEventListener('ended', onEnded); } catch (e) {}
        if (typeof win.removeEventListener === 'function') {
          try { win.removeEventListener('pagehide', onPageLeave); } catch (e) {}
          try { win.removeEventListener('beforeunload', onPageLeave); } catch (e) {}
        }
      });
    }

    function attachVideoPlaybackGuards(videoEl, opts) {
      var started = false;
      var stallTimer = null;
      var isDesktop = typeof win.ctvIsDesktopProxyAvailable === 'function' ? win.ctvIsDesktopProxyAvailable() : false;
      var stallMs = isDesktop ? 9500 : 13000;
      var clearStall = function () {
        if (stallTimer) { clearTimeout(stallTimer); stallTimer = null; }
      };
      var onPlaying = function () {
        started = true;
        clearStall();
        try { videoEl.removeEventListener('playing', onPlaying); } catch (e) {}
        try { videoEl.removeEventListener('loadeddata', onPlaying); } catch (e) {}
        try { videoEl.removeEventListener('timeupdate', onTimeUpdate); } catch (e) {}
        try { videoEl.removeEventListener('seeking', onUserInteract); } catch (e) {}
        try { videoEl.removeEventListener('pause', onUserInteract); } catch (e) {}
        try { videoEl.removeEventListener('pointerdown', onUserInteract); } catch (e) {}
        if (typeof opts.onSuccess === 'function') opts.onSuccess();
      };
      var onTimeUpdate = function () {
        if ((videoEl.currentTime || 0) > 0) onPlaying();
      };
      var onUserInteract = function () {
        clearStall();
      };
      videoEl.addEventListener('playing', onPlaying);
      videoEl.addEventListener('loadeddata', onPlaying);
      videoEl.addEventListener('timeupdate', onTimeUpdate);
      videoEl.addEventListener('seeking', onUserInteract);
      videoEl.addEventListener('pause', onUserInteract);
      videoEl.addEventListener('pointerdown', onUserInteract, { passive: true });
      videoEl.onerror = function () {
        videoEl.onerror = null;
        if (win.__ctvPlaySessionId !== opts.sessionId) return;
        clearStall();
        if (typeof opts.onError === 'function') opts.onError();
      };
      stallTimer = setTimeout(function () {
        if (win.__ctvPlaySessionId !== opts.sessionId) return;
        if (!started && !opts.isFallbackDone() && videoEl.readyState < 2 && opts.modal && !opts.modal.classList.contains('hidden')) {
          if (typeof opts.onStall === 'function') opts.onStall();
        }
      }, stallMs);
      registerPlaybackCleanup(function () {
        clearStall();
        try { videoEl.removeEventListener('playing', onPlaying); } catch (e) {}
        try { videoEl.removeEventListener('loadeddata', onPlaying); } catch (e) {}
        try { videoEl.removeEventListener('timeupdate', onTimeUpdate); } catch (e) {}
        try { videoEl.removeEventListener('seeking', onUserInteract); } catch (e) {}
        try { videoEl.removeEventListener('pause', onUserInteract); } catch (e) {}
        try { videoEl.removeEventListener('pointerdown', onUserInteract); } catch (e) {}
      });
    }

    function showQualityAutoFailoverPill(detectedH, onJumpNow, onKeep) {
      removeFailoverPill();
      if (!doc) return null;
      var modal = doc.getElementById('player-modal');
      if (!modal || modal.classList.contains('hidden')) return null;
      var pill = doc.createElement('div');
      pill.id = 'ctv-failover-pill';
      pill.setAttribute('role', 'status');
      pill.innerHTML =
        iconHtml('quality', 16) +
        '<span class="ctv-fp-txt"></span>' +
        '<button type="button" id="ctv-failover-now" class="btn ctv-btn-primary focusable" tabindex="0">Cambiar ahora</button>' +
        '<button type="button" id="ctv-failover-keep" class="btn focusable" tabindex="0">Mantener</button>';
      var txtEl = pill.querySelector('.ctv-fp-txt');
      var rem = 5;
      var updateTxt = function () {
        if (txtEl) {
          txtEl.textContent = 'Calidad limitada (' + detectedH + 'p) · Cambiando a servidor HD... (' + rem + 's)';
        }
      };
      updateTxt();

      var tickTimer = null;
      var cleaned = false;
      var stopPill = function () {
        if (cleaned) return;
        cleaned = true;
        if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
        if (win.__ctvCancelActiveQualityJump === stopPill) {
          win.__ctvCancelActiveQualityJump = null;
        }
        removeFailoverPill();
      };
      win.__ctvCancelActiveQualityJump = stopPill;

      var nowBtn = pill.querySelector('#ctv-failover-now');
      var keepBtn = pill.querySelector('#ctv-failover-keep');
      if (nowBtn) {
        nowBtn.onclick = function (ev) {
          if (ev) { ev.preventDefault(); ev.stopPropagation(); }
          stopPill();
          if (typeof onJumpNow === 'function') onJumpNow();
        };
      }
      if (keepBtn) {
        keepBtn.onclick = function (ev) {
          if (ev) { ev.preventDefault(); ev.stopPropagation(); }
          stopPill();
          if (typeof onKeep === 'function') onKeep();
        };
      }

      modal.appendChild(pill);
      if (!doc.getElementById('ctv-quality-modal') && !doc.getElementById('ctv-subs-modal') && !doc.getElementById('ctv-imgmode-modal') && !doc.getElementById('ctv-resume-prompt')) {
        setTimeout(function () {
          try {
            if (pill.isConnected && nowBtn && typeof nowBtn.focus === 'function') {
              nowBtn.focus({ preventScroll: true });
            }
          } catch (e) {}
        }, 60);
      }

      tickTimer = setInterval(function () {
        if (cleaned || !pill.isConnected) {
          stopPill();
          return;
        }
        rem -= 1;
        if (rem <= 0) {
          stopPill();
          if (typeof onJumpNow === 'function') onJumpNow();
        } else {
          updateTxt();
        }
      }, 1000);

      return stopPill;
    }

    function setupQualityAutoFailover(videoEl, ctx) {
      if (!videoEl || !ctx || ctx.isAgendaSports) return;
      if (win.__ctvCurrentItem && win.__ctvCurrentItem.kind === 'tv') return;
      var fs = ctx.failoverState;
      if (!fs || fs.cancelled || fs.qualityJumpCancelled || (fs.qualityJumpCount || 0) >= 1) return;

      var activeMs = 0;
      var lastPlayTs = 0;
      var evalTimer = null;
      var evaluated = false;

      var syncElapsed = function () {
        if (lastPlayTs > 0 && !videoEl.paused && !videoEl.ended) {
          activeMs += Math.max(0, Date.now() - lastPlayTs);
          lastPlayTs = Date.now();
        }
      };

      var evaluateQuality = function () {
        if (evaluated) return;
        if (win.__ctvPlaySessionId !== ctx.sessionId || win.__ctvActiveFailoverState !== fs) return;
        if (fs.cancelled || fs.playbackSessionId !== ctx.playbackSessionId) return;
        if (fs.qualityJumpCancelled || (fs.qualityJumpCount || 0) >= 1) { evaluated = true; return; }
        var modal = doc ? doc.getElementById('player-modal') : null;
        if (doc && (!modal || modal.classList.contains('hidden'))) return;
        if (videoEl.paused || videoEl.ended) return;
        if (videoEl.readyState >= 1 && !isFinite(Number(videoEl.duration))) {
          evaluated = true;
          return;
        }

        var prefs = typeof win.ctvGetUserPrefs === 'function' ? win.ctvGetUserPrefs() : {};
        var prefQ = String(prefs.preferredQuality || '').trim();
        if (prefQ === '360' || (parseInt(prefQ, 10) > 0 && parseInt(prefQ, 10) <= 360)) {
          evaluated = true;
          return;
        }

        var hls = getActiveHls();
        var effMaxH = 0;
        if (hls && Array.isArray(hls.levels) && hls.levels.length > 0) {
          for (var i = 0; i < hls.levels.length; i++) {
            var lh = Number(hls.levels[i] && hls.levels[i].height) || 0;
            if (lh > effMaxH) effMaxH = lh;
          }
        }
        if (!effMaxH && videoEl.videoHeight > 0) {
          effMaxH = Number(videoEl.videoHeight) || 0;
        }
        if (!effMaxH) return;
        evaluated = true;

        if (effMaxH > 0 && effMaxH <= 360) {
          if (ctx.serverHostKey && typeof win.ctvRecordServerOutcome === 'function') {
            win.ctvRecordServerOutcome(ctx.serverHostKey, { height: effMaxH, authoritativeMaxH: true });
          }
          var bestCand = selectQualityAutoJumpCandidate({
            activeList: win.__ctvActiveServerList,
            tried: fs.tried,
            currentRawUrl: ctx.rawUrl,
            currentServerName: ctx.serverName,
            scoresMap: typeof win.ctvGetServerScores === 'function' ? win.ctvGetServerScores() : {},
            scoringFns: {
              extractKey: typeof win.ctvExtractServerHostKey === 'function' ? win.ctvExtractServerHostKey : null,
              computeScore: typeof win.ctvComputeServerScore === 'function' ? win.ctvComputeServerScore : null,
              rankCandidates: typeof win.ctvRankServerCandidates === 'function' ? win.ctvRankServerCandidates : null,
              baseScoreFn: typeof win.ctvServerBaseTierScore === 'function' ? win.ctvServerBaseTierScore : null
            }
          });
          if (!bestCand || !bestCand.url) return;

          showQualityAutoFailoverPill(
            effMaxH,
            function () {
              if (
                win.__ctvPlaySessionId !== ctx.sessionId ||
                win.__ctvActiveFailoverState !== fs ||
                fs.playbackSessionId !== ctx.playbackSessionId ||
                fs.cancelled ||
                fs.qualityJumpCancelled ||
                (fs.qualityJumpCount || 0) >= 1
              ) {
                return;
              }
              fs.qualityJumpCount = 1;
              if (fs.tried) fs.tried.add(bestCand.url);
              var nextTitle = bestCand.baseTitle
                ? (bestCand.baseTitle + ' · ' + bestCand.name)
                : ((ctx.title || '').split(' · ')[0] + ' · ' + bestCand.name);
              win.ctvPlaySmartEmbed(bestCand.url, nextTitle, bestCand.name, ctx.slugOrType, ctx.resumeKey, fs);
            },
            function () {
              fs.qualityJumpCancelled = true;
              if (videoEl && videoEl.isConnected) {
                try { videoEl.focus({ preventScroll: true }); } catch (e) {}
              }
            }
          );
        }
      };

      var scheduleEval = function () {
        if (evaluated) return;
        syncElapsed();
        if (videoEl.paused || videoEl.ended) {
          lastPlayTs = 0;
          if (evalTimer) { clearTimeout(evalTimer); evalTimer = null; }
          return;
        }
        if (lastPlayTs === 0) lastPlayTs = Date.now();
        if (activeMs >= 7000) {
          evaluateQuality();
          return;
        }
        if (evalTimer) clearTimeout(evalTimer);
        evalTimer = setTimeout(function () {
          evalTimer = null;
          syncElapsed();
          if (activeMs >= 7000) evaluateQuality();
          else if (!videoEl.paused && !videoEl.ended) scheduleEval();
        }, Math.max(80, 7000 - activeMs));
      };

      var onPlaying = function () { if (!evaluated) scheduleEval(); };
      var onPause = function () {
        syncElapsed();
        lastPlayTs = 0;
        if (evalTimer) { clearTimeout(evalTimer); evalTimer = null; }
      };
      var onTimeUpdate = function () {
        if (evaluated || videoEl.paused || videoEl.ended || videoEl.readyState < 2) return;
        if (lastPlayTs === 0) {
          scheduleEval();
        } else {
          syncElapsed();
          if (activeMs >= 7000) evaluateQuality();
        }
      };

      videoEl.addEventListener('playing', onPlaying);
      videoEl.addEventListener('pause', onPause);
      videoEl.addEventListener('timeupdate', onTimeUpdate);
      if (!videoEl.paused && !videoEl.ended && videoEl.readyState >= 2) {
        scheduleEval();
      }

      registerPlaybackCleanup(function () {
        if (evalTimer) { clearTimeout(evalTimer); evalTimer = null; }
        if (typeof win.__ctvCancelActiveQualityJump === 'function') {
          try { win.__ctvCancelActiveQualityJump(); } catch (e) {}
        }
        try { videoEl.removeEventListener('playing', onPlaying); } catch (e) {}
        try { videoEl.removeEventListener('pause', onPause); } catch (e) {}
        try { videoEl.removeEventListener('timeupdate', onTimeUpdate); } catch (e) {}
      });
    }

    function playSmartEmbed(url, title, serverName, slugOrType, resumeKey, failoverState) {
      if (failoverState && failoverState.cancelled) return false;
      cleanupActivePlayback();
      win.__ctvPlaySessionId = (win.__ctvPlaySessionId || 0) + 1;
      var currentPlaySession = win.__ctvPlaySessionId;

      var rawUrl = String(url || '');
      if (!rawUrl || rawUrl.indexOf('youtube.com/embed') >= 0) return false;

      var isAgendaSports = isAgendaSportsUrl(slugOrType, rawUrl);
      var watchMeta = resolveWatchMediaMeta(title, slugOrType, resumeKey, isAgendaSports, serverName, win);

      if (isAgendaSports && !failoverState) {
        win.__ctvActiveServerList = resolveAgendaServerList(win, rawUrl, title, serverName);
      }

      if (!failoverState) {
        if (doc && doc.activeElement && doc.activeElement !== doc.body) {
          win.__ctvLastServerBtn = doc.activeElement;
        }
        removeFailoverPill();
        failoverState = {
          tried: new Set([rawUrl]),
          hop: 0,
          cancelled: false,
          jumpTimer: null,
          playbackSessionId: currentPlaySession,
          qualityJumpCount: 0,
          qualityJumpCancelled: false,
          __bypassRetriedHosts: new Set(),
          originalUrl: rawUrl,
          originalTitle: String(title || 'Reproduciendo'),
          originalServer: String(serverName || '')
        };
      } else {
        failoverState.tried.add(rawUrl);
        if (typeof failoverState.playbackSessionId !== 'number') failoverState.playbackSessionId = currentPlaySession;
        if (typeof failoverState.qualityJumpCount !== 'number') failoverState.qualityJumpCount = 0;
        if (typeof failoverState.qualityJumpCancelled !== 'boolean') failoverState.qualityJumpCancelled = false;
        if (!failoverState.__bypassRetriedHosts) failoverState.__bypassRetriedHosts = new Set();
      }
      failoverState.sessionId = currentPlaySession;
      win.__ctvActiveFailoverState = failoverState;

      var attemptStartAt = Date.now();
      var serverHostKey = typeof win.ctvExtractServerHostKey === 'function'
        ? (win.ctvExtractServerHostKey(rawUrl) || win.ctvExtractServerHostKey(String(serverName || '')))
        : '';
      var attemptTelemetry = {
        sessionId: currentPlaySession,
        serverHostKey: serverHostKey,
        embedHost: '',
        startAt: attemptStartAt,
        successRecorded: false,
        failRecorded: false,
        blockedCount: 0,
        maxHeight: 0,
        hlsMaxHeight: 0
      };
      win.__ctvActivePlaybackTelemetry = attemptTelemetry;

      removeAgendaStatusOverlay();
      var pFavBtn = doc ? doc.getElementById('player-fav') : null;
      if (isAgendaSports) {
        win.__ctvCurrentItem = null;
        if (pFavBtn) pFavBtn.classList.add('hidden');
      } else if (pFavBtn) {
        pFavBtn.classList.remove('hidden');
      }

      var pFrameInit = doc ? doc.getElementById('player-frame') : null;
      if (pFrameInit) {
        ctvConfigureIframeSandbox(pFrameInit);
        pFrameInit.removeAttribute('referrerpolicy');
      }

      function markServerSuccess(customStartupMs) {
        removePlayerLoader();
        removeFailoverPill();
        if (!attemptTelemetry.successRecorded && !attemptTelemetry.failRecorded && win.__ctvPlaySessionId === currentPlaySession) {
          attemptTelemetry.successRecorded = true;
          var elapsed = typeof customStartupMs === 'number' && isFinite(customStartupMs)
            ? customStartupMs
            : Math.max(0, Date.now() - attemptStartAt);
          if (serverHostKey && typeof win.ctvRecordServerOutcome === 'function') {
            win.ctvRecordServerOutcome(serverHostKey, { ok: true, startupMs: elapsed });
          }
        }
        if (shouldSavePreferredServer({
          isAgendaSports: isAgendaSports,
          maxHeight: attemptTelemetry.maxHeight,
          qualityJumpCancelled: failoverState.qualityJumpCancelled,
          serverName: serverName
        }) && typeof win.ctvSaveUserPrefs === 'function') {
          win.ctvSaveUserPrefs({ preferredServer: String(serverName) });
        }
      }

      function recordAttemptFailure(reason) {
        if (attemptTelemetry.failRecorded) return;
        attemptTelemetry.failRecorded = true;
        var isTimeout = /timeout|stall/i.test(String(reason || ''));
        if (serverHostKey && typeof win.ctvRecordServerOutcome === 'function') {
          win.ctvRecordServerOutcome(serverHostKey, { ok: false, timeout: isTimeout });
        }
      }

      function openIframeAttempt(targetUrl, keepPill) {
        openInCleanIframe(
          targetUrl,
          title,
          function (errReason) {
            attemptAutoFailoverOrError(errReason || 'iframe-error');
          },
          currentPlaySession,
          keepPill,
          {
            failoverState: failoverState,
            onSuccessCb: function (loadMs) {
              markServerSuccess(loadMs);
            }
          }
        );
      }

      function attemptAutoFailoverOrError(reason) {
        if (win.__ctvPlaySessionId !== currentPlaySession) return;
        if (failoverState.cancelled) return;
        var modal = doc ? doc.getElementById('player-modal') : null;
        if (doc && (!modal || modal.classList.contains('hidden'))) return;

        var activeSrvList = Array.isArray(win.__ctvActiveServerList) ? win.__ctvActiveServerList : [];
        var hasSwitchableServers = !isAgendaSports || activeSrvList.length > 1;
        var maxFailoverHops = isAgendaSports ? Math.max(3, Math.min(6, activeSrvList.length)) : 3;

        if (failoverState.hop === 0 && reason !== 'iframe-error' && reason !== 'subframe-net-error' && reason !== 'iframe-timeout' && isExtractableServer(rawUrl) && !failoverState.__triedDirectIframe) {
          var preNext = findNextFallbackServer(failoverState.tried);
          if (!preNext) {
            failoverState.__triedDirectIframe = true;
            openIframeAttempt(rawUrl, false);
            updateNextServerButton(isAgendaSports, rawUrl, title, slugOrType, resumeKey, failoverState);
            return;
          }
        }

        recordAttemptFailure(reason);

        var nextSrv = failoverState.hop < maxFailoverHops ? findNextFallbackServer(failoverState.tried) : null;
        if (nextSrv) {
          if (failoverState.jumpingSession === currentPlaySession) return;
          failoverState.jumpingSession = currentPlaySession;
          failoverState.hop += 1;
          failoverState.tried.add(nextSrv.url);
          cleanupActivePlayback();
          var nextTitle = nextSrv.baseTitle ? (nextSrv.baseTitle + ' · ' + nextSrv.name) : ((title || '').split(' · ')[0] + ' · ' + nextSrv.name);
          showFailoverPill(nextSrv.name, function () {
            failoverState.cancelled = true;
            if (failoverState.jumpTimer) {
              clearTimeout(failoverState.jumpTimer);
              failoverState.jumpTimer = null;
            }
            win.__ctvPlaySessionId = (win.__ctvPlaySessionId || 0) + 1;
            removeFailoverPill();
            showAgendaStatusOverlay(
              failoverState.originalTitle || title || 'Reproducción',
              isAgendaSports
                ? 'Cambio automático cancelado. Puedes reintentar o elegir otro enlace disponible.'
                : 'Cambio automático cancelado. Puedes reintentar o elegir otro servidor manualmente.',
              function () {
                win.ctvPlaySmartEmbed(failoverState.originalUrl, failoverState.originalTitle, failoverState.originalServer, slugOrType, resumeKey);
              },
              { isSports: isAgendaSports, showSwitch: hasSwitchableServers, backLabel: 'Volver' }
            );
          });
          failoverState.jumpTimer = setTimeout(function () {
            failoverState.jumpTimer = null;
            if (win.__ctvPlaySessionId !== currentPlaySession || failoverState.cancelled) return;
            win.ctvPlaySmartEmbed(nextSrv.url, nextTitle, nextSrv.name, slugOrType, resumeKey, failoverState);
          }, 900);
          registerPlaybackCleanup(function () {
            if (failoverState.jumpTimer) {
              clearTimeout(failoverState.jumpTimer);
              failoverState.jumpTimer = null;
            }
          });
          return;
        }

        showAgendaStatusOverlay(
          failoverState.originalTitle || title || (isAgendaSports ? 'Agenda deportiva' : 'Reproducción'),
          isAgendaSports
            ? 'Servidor sin señal en este momento · Prueba otro enlace o vuelve cuando inicie el evento'
            : 'Los servidores disponibles están saturados o sin respuesta en este momento. Puedes reintentar o seleccionar otro servidor manualmente.',
          function () {
            win.ctvPlaySmartEmbed(failoverState.originalUrl, failoverState.originalTitle, failoverState.originalServer, slugOrType, resumeKey);
          },
          {
            isSports: isAgendaSports,
            heading: isAgendaSports ? 'Servidor sin señal en este momento' : undefined,
            showSwitch: hasSwitchableServers,
            backLabel: 'Volver'
          }
        );
      }

      if (!isExtractableServer(rawUrl)) {
        openIframeAttempt(rawUrl, failoverState.hop > 0);
        updateNextServerButton(isAgendaSports, rawUrl, title, slugOrType, resumeKey, failoverState);
        return true;
      }

      if (win.__ctvPlaySessionId !== currentPlaySession) return false;
      notifyActiveEmbedHost('', win);
      openModalWithSmartGuard((title || 'Reproduciendo') + ' · Conectando…');
      updateNextServerButton(isAgendaSports, rawUrl, title, slugOrType, resumeKey, failoverState);
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
      if (!isAgendaSports && typeof win.ctvUpdateFavButtonsUI === 'function') {
        win.ctvUpdateFavButtonsUI();
      }

      var didFallback = false;
      var agendaRetries = 0;

      function fallbackToNext(reason) {
        if (win.__ctvPlaySessionId !== currentPlaySession) return;
        if (didFallback || failoverState.cancelled) return;
        didFallback = true;
        attemptAutoFailoverOrError(reason);
      }

      function playResolvedResult(res) {
        if (win.__ctvPlaySessionId !== currentPlaySession) return;
        if (didFallback || failoverState.cancelled) return;
        var modal = doc ? doc.getElementById('player-modal') : null;
        if (doc && (!modal || modal.classList.contains('hidden'))) return;

        if (res && res.type === 'dash' && res.url) {
          notifyActiveEmbedHost('', win);
          if (win.AndroidBridge && typeof win.AndroidBridge.playChannelFull === 'function') {
            try {
              removePlayerLoader();
              if (typeof win.ctvForceClosePlayer === 'function') win.ctvForceClosePlayer();
              else if (typeof win.__ctvClosePlayer === 'function') win.__ctvClosePlayer();
              win.AndroidBridge.playChannelFull(title || 'Agenda Deportiva', res.url, '', res.keyId || '', res.key || '', '');
              return;
            } catch (e) {}
          }
          if (typeof win.__ctvPlayDash === 'function') {
            var dashFailureHandled = false;
            var handleDashFailure = function () {
              if (win.__ctvPlaySessionId !== currentPlaySession) return;
              if (dashFailureHandled || didFallback || failoverState.cancelled) return;
              dashFailureHandled = true;
              fallbackToNext('dash-error');
            };
            win.__ctvActiveDashExpectedUrl = String(res.url || '');
            win.__ctvActiveDashFailCb = handleDashFailure;
            try {
              var dashPromise = runWithSmartModalGuard(function () {
                return win.__ctvPlayDash(res.url, res.keyId || '', res.key || '', title || 'Agenda Deportiva');
              });
              updateNextServerButton(isAgendaSports, rawUrl, title, slugOrType, resumeKey, failoverState);
              if (!isAgendaSports && typeof win.ctvUpdateFavButtonsUI === 'function') win.ctvUpdateFavButtonsUI();
              var vDash = doc ? doc.getElementById('player-video') : null;
              if (vDash) {
                if (watchMeta) bindWatchProgressTracker(vDash, watchMeta, failoverState);
                attachVideoPlaybackGuards(vDash, {
                  sessionId: currentPlaySession,
                  modal: modal,
                  isFallbackDone: function () { return didFallback; },
                  onSuccess: function () { markServerSuccess(); },
                  onError: handleDashFailure,
                  onStall: handleDashFailure
                });
              } else {
                markServerSuccess();
              }
              if (dashPromise && typeof dashPromise.catch === 'function') {
                dashPromise.catch(handleDashFailure);
              }
              return;
            } catch (e) {}
          }
          fallbackToNext('dash-error');
          return;
        }

        if (res && res.type === 'hls' && res.url) {
          notifyActiveEmbedHost('', win);
          if ((isAgendaSports || res.isLive) && win.AndroidBridge && typeof win.AndroidBridge.playChannelFull === 'function') {
            try {
              removePlayerLoader();
              if (typeof win.ctvForceClosePlayer === 'function') win.ctvForceClosePlayer();
              else if (typeof win.__ctvClosePlayer === 'function') win.__ctvClosePlayer();
              win.AndroidBridge.playChannelFull(title || 'Agenda Deportiva', '', res.url, '', '', '');
              return;
            } catch (e) {}
          }

          if (typeof win.__ctvPlayHls === 'function') {
            var hlsFailureHandled = false;
            var handleHlsFailure = function () {
              if (win.__ctvPlaySessionId !== currentPlaySession) return;
              if (hlsFailureHandled || didFallback || failoverState.cancelled) return;
              hlsFailureHandled = true;
              if (isAgendaSports && agendaRetries < 1) {
                agendaRetries++;
                showPlayerLoader('Reintentando con otro nodo…');
                extractDirectStream(rawUrl).then(function (retryRes) {
                  if (win.__ctvPlaySessionId !== currentPlaySession) return;
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

            win.__ctvActiveHlsFatalCb = handleHlsFailure;
            runWithSmartModalGuard(function () {
              return win.__ctvPlayHls(res.url, title, handleHlsFailure);
            });
            updateNextServerButton(isAgendaSports, rawUrl, title, slugOrType, resumeKey, failoverState);
            if (!isAgendaSports && typeof win.ctvUpdateFavButtonsUI === 'function') win.ctvUpdateFavButtonsUI();
            var vHls = doc ? doc.getElementById('player-video') : null;
            if (vHls) {
              if (watchMeta) bindWatchProgressTracker(vHls, watchMeta, failoverState);
              attachVideoPlaybackGuards(vHls, {
                sessionId: currentPlaySession,
                modal: modal,
                isFallbackDone: function () { return didFallback; },
                onSuccess: function () { markServerSuccess(); },
                onError: handleHlsFailure,
                onStall: handleHlsFailure
              });
              setupQualityAutoFailover(vHls, {
                sessionId: currentPlaySession,
                playbackSessionId: failoverState.playbackSessionId,
                failoverState: failoverState,
                rawUrl: rawUrl,
                title: title,
                serverName: serverName,
                slugOrType: slugOrType,
                resumeKey: resumeKey,
                isAgendaSports: isAgendaSports,
                serverHostKey: serverHostKey
              });
            } else {
              removePlayerLoader();
            }
            attachSubtitlesToVideo(res.tracks || []);
            return;
          }
        }

        if (res && res.type === 'mp4' && res.url) {
          notifyActiveEmbedHost('', win);
          if (win.__ctvPlaySessionId !== currentPlaySession) return;
          openModalWithSmartGuard(title);
          updateNextServerButton(isAgendaSports, rawUrl, title, slugOrType, resumeKey, failoverState);
          if (!isAgendaSports && typeof win.ctvUpdateFavButtonsUI === 'function') win.ctvUpdateFavButtonsUI();
          var v = doc ? doc.getElementById('player-video') : null;
          if (v) {
            v.classList.remove('hidden');
            if (watchMeta) bindWatchProgressTracker(v, watchMeta, failoverState);
            attachVideoPlaybackGuards(v, {
              sessionId: currentPlaySession,
              modal: modal,
              isFallbackDone: function () { return didFallback; },
              onSuccess: function () { markServerSuccess(); },
              onError: function () { fallbackToNext('mp4-error'); },
              onStall: function () { fallbackToNext('mp4-stall'); }
            });
            setupQualityAutoFailover(v, {
              sessionId: currentPlaySession,
              playbackSessionId: failoverState.playbackSessionId,
              failoverState: failoverState,
              rawUrl: rawUrl,
              title: title,
              serverName: serverName,
              slugOrType: slugOrType,
              resumeKey: resumeKey,
              isAgendaSports: isAgendaSports,
              serverHostKey: serverHostKey
            });
            v.src = res.url;
            v.play().catch(function () {});
            v.focus();
            attachSubtitlesToVideo(res.tracks || []);
            return;
          }
        }

        if (res && res.type === 'srcdoc' && res.html) {
          if (win.__ctvPlaySessionId !== currentPlaySession) return;
          openModalWithSmartGuard(title);
          updateNextServerButton(isAgendaSports, rawUrl, title, slugOrType, resumeKey, failoverState);
          if (!isAgendaSports && typeof win.ctvUpdateFavButtonsUI === 'function') win.ctvUpdateFavButtonsUI();
          var f = doc ? doc.getElementById('player-frame') : null;
          if (f) {
            attemptTelemetry.embedHost = notifyActiveEmbedHost(rawUrl, win);
            ctvConfigureIframeSandbox(f);
            f.removeAttribute('referrerpolicy');
            f.classList.remove('hidden');
            var srcdocStartAt = Date.now();
            var srcdocHide = setTimeout(function () { markServerSuccess(Date.now() - srcdocStartAt); }, 2500);
            var onSrcdocLoad = function () {
              clearTimeout(srcdocHide);
              markServerSuccess(Date.now() - srcdocStartAt);
            };
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

        if (res && res.type === 'iframe' && res.url) {
          openIframeAttempt(res.url, failoverState.hop > 0);
          updateNextServerButton(isAgendaSports, rawUrl, title, slugOrType, resumeKey, failoverState);
          return;
        }

        fallbackToNext('empty-extract');
      }

      var isDesktopExt = typeof win.ctvIsDesktopProxyAvailable === 'function' ? win.ctvIsDesktopProxyAvailable() : false;
      var extractTimeoutMs = isDesktopExt ? 11000 : 14000;
      var extractTimer = setTimeout(function () {
        if (win.__ctvPlaySessionId !== currentPlaySession) return;
        fallbackToNext('extract-timeout');
      }, extractTimeoutMs);
      registerPlaybackCleanup(function () { clearTimeout(extractTimer); });

      extractDirectStream(rawUrl)
        .then(function (res) {
          clearTimeout(extractTimer);
          if (win.__ctvPlaySessionId !== currentPlaySession) return;
          playResolvedResult(res);
        })
        .catch(function () {
          clearTimeout(extractTimer);
          if (win.__ctvPlaySessionId !== currentPlaySession) return;
          fallbackToNext('extract-error');
        });

      return true;
    }

    function monitorDirectLivePlayback(title) {
      if (!doc) return;
      if (win.__ctvSmartModalGuard > 0) return;
      cleanupActivePlayback();
      removeAgendaStatusOverlay();
      removeFailoverPill();
      removePlayerLoader();

      win.__ctvPlaySessionId = (win.__ctvPlaySessionId || 0) + 1;
      var directSid = win.__ctvPlaySessionId;
      var retryTarget = (win.__ctvLastServerBtn && win.__ctvLastServerBtn.isConnected)
        ? win.__ctvLastServerBtn
        : (doc.activeElement && doc.activeElement !== doc.body ? doc.activeElement : null);

      showPlayerLoader('Conectando con ' + (title || 'el canal') + '…');

      var directFailed = false;
      var triggerDirectFailure = function () {
        if (win.__ctvPlaySessionId !== directSid || directFailed) return;
        var modalNow = doc.getElementById('player-modal');
        if (!modalNow || modalNow.classList.contains('hidden')) return;
        directFailed = true;
        if (typeof win.ctvAbortActiveMediaFetches === 'function') {
          try { win.ctvAbortActiveMediaFetches(); } catch (e) {}
        }
        showAgendaStatusOverlay(
          title || 'TV en vivo',
          'Servidor sin señal en este momento · Este canal está fuera de línea o requiere conexión local.',
          function () {
            if (win.__ctvAbortedMpdUrls && typeof win.__ctvAbortedMpdUrls.clear === 'function') {
              win.__ctvAbortedMpdUrls.clear();
            }
            if (retryTarget && retryTarget.isConnected && typeof retryTarget.click === 'function') {
              retryTarget.click();
              monitorDirectLivePlayback(title);
            } else if (typeof win.ctvForceClosePlayer === 'function') {
              win.ctvForceClosePlayer();
            }
          },
          {
            isSports: true,
            heading: 'Servidor sin señal en este momento',
            showSwitch: false,
            backLabel: 'Volver'
          }
        );
      };

      win.__ctvActiveHlsFatalCb = triggerDirectFailure;
      win.__ctvActiveDashFailCb = triggerDirectFailure;

      var bindTimer = setTimeout(function () {
        if (win.__ctvPlaySessionId !== directSid || directFailed) return;
        var modal = doc.getElementById('player-modal');
        var pv = doc.getElementById('player-video');
        var pf = doc.getElementById('player-frame');
        if (!modal || modal.classList.contains('hidden')) {
          removePlayerLoader();
          return;
        }
        if (!pv || pv.classList.contains('hidden') || (pf && !pf.classList.contains('hidden'))) {
          removePlayerLoader();
          return;
        }
        if (pv.readyState >= 2 && !pv.paused) {
          removePlayerLoader();
          return;
        }
        attachVideoPlaybackGuards(pv, {
          sessionId: directSid,
          modal: modal,
          isFallbackDone: function () { return directFailed; },
          onSuccess: function () { removePlayerLoader(); },
          onError: triggerDirectFailure,
          onStall: triggerDirectFailure
        });
      }, 0);

      registerPlaybackCleanup(function () {
        clearTimeout(bindTimer);
      });
    }

    win.ctvPlaySmartEmbed = playSmartEmbed;
    win.__ctvMonitorDirectPlayback = monitorDirectLivePlayback;

    return {
      ctvConfigureIframeSandbox: ctvConfigureIframeSandbox,
      notifyActiveEmbedHost: function (h) { return notifyActiveEmbedHost(h, win); },
      focusNextServerAfterClose: focusNextServerAfterClose,
      findNextFallbackServer: findNextFallbackServer,
      urlsMatchOriginOrHost: urlsMatchOriginOrHost,
      ensureNextServerButton: ensureNextServerButton,
      updateNextServerButton: updateNextServerButton,
      showFailoverPill: showFailoverPill,
      openInCleanIframe: openInCleanIframe,
      showAgendaStatusOverlay: showAgendaStatusOverlay,
      resolveWatchMediaMeta: function (t, s, r, a, sn) { return resolveWatchMediaMeta(t, s, r, a, sn, win); },
      showResumePrompt: showResumePrompt,
      bindWatchProgressTracker: bindWatchProgressTracker,
      attachVideoPlaybackGuards: attachVideoPlaybackGuards,
      showQualityAutoFailoverPill: showQualityAutoFailoverPill,
      setupQualityAutoFailover: setupQualityAutoFailover,
      playSmartEmbed: playSmartEmbed,
      monitorDirectLivePlayback: monitorDirectLivePlayback
    };
  }

  /* @ctv-browser-boot-start */
  if (typeof exports === 'undefined' && typeof window !== 'undefined') {
    window.__ctvInitQualityFailover = initQualityFailover;
  }
  /* @ctv-browser-boot-end */

  /* @ctv-node-exports-start */
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      ctvConfigureIframeSandbox: ctvConfigureIframeSandbox,
      notifyActiveEmbedHost: notifyActiveEmbedHost,
      urlsMatchOriginOrHost: urlsMatchOriginOrHost,
      isAgendaSportsUrl: isAgendaSportsUrl,
      resolveAgendaServerList: resolveAgendaServerList,
      selectNextFallbackServer: selectNextFallbackServer,
      shouldAttemptAdShieldBypassRetry: shouldAttemptAdShieldBypassRetry,
      shouldSavePreferredServer: shouldSavePreferredServer,
      selectQualityAutoJumpCandidate: selectQualityAutoJumpCandidate,
      resolveWatchMediaMeta: resolveWatchMediaMeta,
      initQualityFailover: initQualityFailover
    };
  }
  /* @ctv-node-exports-end */
})();
