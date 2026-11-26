'use strict';

const { ALLOWED_UPDATE_PREFIXES } = require('./updater');

const ALLOWED_EXTERNAL_OPEN_PREFIXES = [
  ...ALLOWED_UPDATE_PREFIXES,
  'sidestore://'
];

const STEALTH_AD_DOMAINS = [
  '1xbet.com',
  'a-ads.com',
  'acscdn.com',
  'ad-maven.com',
  'adangle.online',
  'adcash.com',
  'admaven.com',
  'adsco.re',
  'adskeeper.co.uk',
  'adskeeper.com',
  'adspyglass.com',
  'adsterra.com',
  'adtng.com',
  'adxxx.com',
  'ay.delivery',
  'bet365.com',
  'bidgear.com',
  'bidvertiser.com',
  'bongacams.com',
  'cam4.com',
  'chaturbate.com',
  'clickadu.com',
  'clickadu.net',
  'clickaine.com',
  'cpmrevenuegate.com',
  'cvt-s1.adangle.online',
  'displayformatrevenue.com',
  'dtscdn.com',
  'dtscout.com',
  'effectivegatecpm.com',
  'ero-advertising.com',
  'evadav.com',
  'exdynsrv.com',
  'exoclick.com',
  'exoclick.net',
  'exosrv.com',
  'flawlessimmunizeguy.com',
  'galaksion.com',
  'gigaduckgo.com',
  'highperformanceformat.com',
  'highrevenuegate.com',
  'hilltopads.com',
  'hilltopads.net',
  'histats.com',
  'juicyads.com',
  'kadam.net',
  'livejasmin.com',
  'llvpn.com',
  'mgid.com',
  'mondiad.com',
  'monetag.com',
  'myfreecams.com',
  'oclasrv.com',
  'onclickads.net',
  'onclickalgo.com',
  'onclkds.com',
  'pemsrv.com',
  'phruk.org',
  'plugrush.com',
  'popads.com',
  'popads.net',
  'popcash.net',
  'popmyads.com',
  'popunderjs.com',
  'profitableratecpm.com',
  'propellerads.com',
  'pushame.com',
  'realsrv.com',
  'richpush.co',
  'rollerads.com',
  'stripchat.com',
  'trafficfactory.biz',
  'trafficjunky.com',
  'trafficjunky.net',
  'trafficstars.com',
  'tsyndicate.com',
  'tsyndicate.net',
  'vidoomy.com',
  'wpadmngr.com',
  'xlovecam.com',
  'yllix.com'
];

// O(labels) lookup Set for confirmed popunder/malvertising domains
const STEALTH_AD_DOMAIN_SET = new Set(STEALTH_AD_DOMAINS);

const MULTI_PART_SUFFIXES = new Set([
  'co.uk', 'org.uk', 'ac.uk', 'com.au', 'net.au', 'com.br', 'net.br',
  'com.mx', 'com.ar', 'com.es', 'co.jp', 'workers.dev'
]);

const MEDIA_STREAM_EXT_RE = /\.(?:m3u8|ts|m4s|mp4|mpd|vtt|srt|key)(?:$|\?)/i;
const BAIT_SCRIPT_RE = /(?:\/ads\.js|\/adframe\.js|adsbygoogle\.js|prebid(?:[-.\w]*)?\.js)(?:$|\?)/i;

// In-frame cosmetic & scriptlet ad-shield (MutationObserver + rAF)
const EMBED_ADBLOCK_SCRIPT = `
(function() {
  if (window.__pjAd) return;
  window.__pjAd = 1;
  try {
    window.cRAds = true;
    window.xRds = false;
    const decoyWinOpen = function() {
      var loc = { href: 'about:blank', replace: function(v) { this.href = String(v || 'about:blank'); }, assign: function(v) { this.href = String(v || 'about:blank'); } };
      return { closed: false, opener: null, focus: function() {}, blur: function() {}, close: function() { this.closed = true; }, postMessage: function() {}, location: loc };
    };
    window.open = decoyWinOpen;
    Object.defineProperty(window, 'open', { value: decoyWinOpen, writable: false, configurable: true });
    window.alert = function() {};
    window.confirm = function() { return false; };
    window.prompt = function() { return null; };
  } catch (e) {}

  try {
    var st = document.createElement('style');
    st.textContent = '#adbd, #play_limit_box, .overdiv, #first-click-ad { display: none !important; }';
    (document.head || document.documentElement).appendChild(st);
  } catch (e) {}

  // Intercept window-level click-hijackers that try to open external ad links on click
  try {
    window.addEventListener('click', function(ev) {
      var t = ev.target;
      if (t && t.closest) {
        var a = t.closest('a');
        if (a && (a.target === '_blank' || (a.href && !a.href.startsWith('javascript:') && a.hostname && a.hostname !== location.hostname))) {
          ev.stopImmediatePropagation();
          ev.preventDefault();
          a.remove();
        }
      }
    }, true);
  } catch (e) {}

  var rafPending = false;
  var cleaning = false;
  function cleanOverlaysAndSkipAds() {
    rafPending = false;
    if (document.hidden || cleaning) return;
    cleaning = true;
    try {
      var d = document;
      // 1. Remove invisible click-hijack anchors (<a target="_blank">) and <ins> ad slots without touching player divs/iframes
      var anchors = d.querySelectorAll('a[target="_blank"], ins');
      for (var j = 0; j < anchors.length; j++) {
        var el = anchors[j];
        try {
          if (el.querySelector('video')) continue;
          if (el.tagName === 'INS') {
            el.remove();
            continue;
          }
          var style = window.getComputedStyle(el);
          var z = parseInt(style.zIndex, 10) || 0;
          var pos = style.position;
          if ((pos === 'fixed' || pos === 'absolute') && (el.target === '_blank' || z > 50)) {
            el.remove();
          }
        } catch (e2) {}
      }

      // 2. Skip in-stream video ads automatically
      var vs = d.querySelectorAll('video'), ad = false;
      if (vs.length) {
        var b = d.body, t = b ? (b.innerText || '').toLowerCase() : '';
        ad = (t.indexOf('anuncio') >= 0 && (t.indexOf('saltar') >= 0 || t.indexOf('terminar') >= 0)) ||
             (t.indexOf('skip ad') >= 0) || (t.indexOf('advertisement') >= 0);
      }
      for (var i = 0; i < vs.length; i++) {
        var v = vs[i];
        if (!ad) {
          if (v.__pjm) {
            try { v.playbackRate = 1; v.muted = v.__pjo; } catch (e) {}
            v.__pjm = 0;
          }
          continue;
        }
        var du = v.duration;
        if (isFinite(du) && du > 0 && du < 180) {
          try {
            if (!v.__pjm) { v.__pjm = 1; v.__pjo = v.muted; }
            v.muted = true;
            v.playbackRate = 16;
            v.currentTime = Math.max(0, du - 0.1);
          } catch (e) {}
        }
      }
      if (ad) {
        var els = d.querySelectorAll('button,div,span,a');
        for (var k = 0; k < els.length; k++) {
          var e = els[k];
          try {
            if (e.children.length === 0) {
              var x = (e.innerText || '').toLowerCase();
              if ((x.indexOf('saltar anuncio') >= 0 || x.indexOf('skip ad') >= 0) && x.indexOf(' en ') < 0 && x.indexOf(' in ') < 0) {
                e.click();
              }
            }
          } catch (e2) {}
        }
      }
    } catch (e) {
    } finally {
      cleaning = false;
    }
  }

  function scheduleClean() {
    if (rafPending || cleaning || document.hidden) return;
    rafPending = true;
    (window.requestAnimationFrame || setTimeout)(cleanOverlaysAndSkipAds, 16);
  }

  try {
    var obsRoot = document.body || document.documentElement;
    if (obsRoot && typeof MutationObserver !== 'undefined') {
      var obs = new MutationObserver(scheduleClean);
      obs.observe(obsRoot, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class', 'hidden']
      });
      window.addEventListener('pagehide', function() { try { obs.disconnect(); } catch (e) {} }, { once: true });
    }
  } catch (e) {}

  var fallbackTimer = setInterval(scheduleClean, 1500);
  window.addEventListener('pagehide', function() { clearInterval(fallbackTimer); }, { once: true });
  cleanOverlaysAndSkipAds();
})();
`;

let activeEmbedHost = '';
const adShieldBypassHosts = new Set();
const blockedCountByEmbedHost = new Map();
const lastAdShieldEmitAt = new Map();
let sessionConfigured = false;

function normalizeEmbedHost(raw) {
  if (!raw || typeof raw !== 'string') return '';
  let s = raw.trim().toLowerCase();
  if (!s || s.length > 180) return '';
  if (s.startsWith('http://') || s.startsWith('https://')) {
    try {
      s = new URL(s).hostname.toLowerCase();
    } catch {
      return '';
    }
  } else if (s.startsWith('//')) {
    try {
      s = new URL('https:' + s).hostname.toLowerCase();
    } catch {
      return '';
    }
  }
  s = s.replace(/^www\./, '').replace(/\.$/, '');
  if (!s || s === '127.0.0.1' || s === 'localhost' || s === '::1' || s === 'about:blank') {
    return '';
  }
  return s;
}

function getRegistrableDomain(hostname) {
  const h = normalizeEmbedHost(hostname);
  if (!h) return '';
  const parts = h.split('.').filter(Boolean);
  if (parts.length <= 2) return h;
  const tail2 = parts.slice(-2).join('.');
  if (MULTI_PART_SUFFIXES.has(tail2) && parts.length >= 3) {
    return parts.slice(-3).join('.');
  }
  return tail2;
}

function isSameSiteOrFirstParty(reqHostname, embedHost) {
  if (!reqHostname || !embedHost || !embedHost.includes('.')) return false;
  const normReq = normalizeEmbedHost(reqHostname);
  const normEmbed = normalizeEmbedHost(embedHost);
  if (!normReq || !normEmbed) return false;
  if (normReq === normEmbed || normReq.endsWith('.' + normEmbed) || normEmbed.endsWith('.' + normReq)) {
    return true;
  }
  const r1 = getRegistrableDomain(normReq);
  const r2 = getRegistrableDomain(normEmbed);
  return Boolean(r1 && r2 && r1 === r2);
}

function isMediaAssetUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  try {
    const parsed = new URL(rawUrl);
    return MEDIA_STREAM_EXT_RE.test(parsed.pathname);
  } catch {
    return MEDIA_STREAM_EXT_RE.test(rawUrl.split('#')[0]);
  }
}

function isBaitScriptUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  try {
    const parsed = new URL(rawUrl);
    return BAIT_SCRIPT_RE.test(parsed.pathname + parsed.search);
  } catch {
    return BAIT_SCRIPT_RE.test(rawUrl);
  }
}

function isStealthAdUrl(rawUrl, currentEmbedHost = activeEmbedHost) {
  if (
    !rawUrl ||
    rawUrl.startsWith('http://127.0.0.1') ||
    rawUrl.startsWith('http://localhost') ||
    rawUrl.startsWith('blob:') ||
    rawUrl.startsWith('data:') ||
    rawUrl.startsWith('about:')
  ) {
    return false;
  }
  if (isMediaAssetUrl(rawUrl) || isBaitScriptUrl(rawUrl)) {
    return false;
  }
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    if (currentEmbedHost && isSameSiteOrFirstParty(host, currentEmbedHost)) {
      return false;
    }
    let dotIdx = -1;
    let candidate = host;
    while (candidate) {
      if (STEALTH_AD_DOMAIN_SET.has(candidate)) return true;
      dotIdx = candidate.indexOf('.');
      if (dotIdx < 0) break;
      candidate = candidate.slice(dotIdx + 1);
    }
  } catch {}
  return false;
}

function isAllowedExternalOpen(rawUrl) {
  return Boolean(rawUrl && typeof rawUrl === 'string' && ALLOWED_EXTERNAL_OPEN_PREFIXES.some((prefix) => rawUrl.startsWith(prefix)));
}

function shouldAllowWindowOpen(details, mainFrameRef) {
  const url = String((details && details.url) || '');
  const refUrl = String((details && details.referrer && details.referrer.url) || '');
  const hasFrame = Boolean(details && details.frame);
  const isFromMainFrame = hasFrame
    ? Boolean(mainFrameRef && details.frame === mainFrameRef)
    : refUrl.startsWith('http://127.0.0.1:');
  const allowExternal = Boolean(isFromMainFrame && isAllowedExternalOpen(url));
  return { allowExternal, url, isFromMainFrame };
}

function shouldBlockSubframeNavigation(details, currentEmbedHost = activeEmbedHost) {
  return Boolean(details && !details.isMainFrame && isStealthAdUrl(details.url, currentEmbedHost));
}

function getActiveEmbedHost() {
  return activeEmbedHost;
}

function setActiveEmbedHost(host) {
  activeEmbedHost = normalizeEmbedHost(String(host || ''));
  if (activeEmbedHost) {
    blockedCountByEmbedHost.set(activeEmbedHost, 0);
  }
  return {
    activeEmbedHost,
    bypassed: Boolean(activeEmbedHost && adShieldBypassHosts.has(activeEmbedHost)),
    blockedCount: activeEmbedHost ? (blockedCountByEmbedHost.get(activeEmbedHost) || 0) : 0
  };
}

function addAdShieldBypassHost(host) {
  const norm = normalizeEmbedHost(String(host || ''));
  if (norm) {
    adShieldBypassHosts.add(norm);
  }
  return {
    host: norm,
    bypassed: Boolean(norm && adShieldBypassHosts.has(norm))
  };
}

function isAdShieldBypassed(host) {
  const norm = normalizeEmbedHost(String(host || ''));
  return Boolean(norm && adShieldBypassHosts.has(norm));
}

function clearAdShieldBypassHosts() {
  adShieldBypassHosts.clear();
  blockedCountByEmbedHost.clear();
  activeEmbedHost = '';
}

function getBlockedCountForHost(host) {
  const norm = normalizeEmbedHost(String(host || ''));
  return norm ? (blockedCountByEmbedHost.get(norm) || 0) : 0;
}

function shouldBlockNetworkRequest(details, overrideEmbedHost) {
  const reqUrl = details && details.url ? String(details.url) : '';
  if (details && details.resourceType === 'mainFrame') {
    return { cancel: false, reqUrl, host: '' };
  }
  const host = overrideEmbedHost !== undefined ? normalizeEmbedHost(overrideEmbedHost) : activeEmbedHost;
  if (host && adShieldBypassHosts.has(host)) {
    return { cancel: false, reqUrl, host };
  }
  if (isStealthAdUrl(reqUrl, host)) {
    return { cancel: true, reqUrl, host };
  }
  return { cancel: false, reqUrl, host };
}

function emitAdShieldEvent(mainWindow, payload, throttleMs = 0) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (throttleMs > 0) {
    const key = `${payload.type}:${payload.host || ''}`;
    const now = Date.now();
    const prev = lastAdShieldEmitAt.get(key) || 0;
    if (now - prev < throttleMs) return;
    lastAdShieldEmitAt.set(key, now);
  }
  try {
    mainWindow.webContents.send('ctv:ad-shield-event', payload);
  } catch {}
}

const CORS_ENABLED_URL_RE = /(?:pelisjuanita\.com|workers\.dev|ftlly\.com|tvf90\.com|tv-90\.com|\.(?:m3u8|ts|m4s|mp4|mpd|vtt|srt|key)(?:$|\?))/i;

/**
 * Strip X-Frame-Options, CSP frame-ancestors/sandbox directives, and deduplicate CORS headers
 * case-insensitively so Chromium never rejects responses with "Access-Control-Allow-Origin: *, *".
 */
function sanitizeResponseHeaders(rawHeaders, rawUrl) {
  const responseHeaders = { ...(rawHeaders || {}) };
  const u = String(rawUrl || '').toLowerCase();
  for (const key of Object.keys(responseHeaders)) {
    const lower = key.toLowerCase();
    if (lower === 'x-frame-options') {
      delete responseHeaders[key];
    } else if (lower === 'content-security-policy') {
      const vals = Array.isArray(responseHeaders[key]) ? responseHeaders[key] : [responseHeaders[key]];
      const cleanedCsp = vals
        .map((v) =>
          String(v || '')
            .replace(/(?:frame-ancestors|sandbox)[^;]*;?/gi, '')
            .replace(/^\s*;+|;+\s*$/g, '')
            .trim()
        )
        .filter(Boolean);
      if (cleanedCsp.length > 0) {
        responseHeaders[key] = cleanedCsp;
      } else {
        delete responseHeaders[key];
      }
    } else if (lower === 'set-cookie' && u.includes('pelisjuanita.com')) {
      delete responseHeaders[key];
    }
  }
  if (CORS_ENABLED_URL_RE.test(u)) {
    for (const key of Object.keys(responseHeaders)) {
      const lower = key.toLowerCase();
      if (
        lower === 'access-control-allow-origin' ||
        lower === 'access-control-allow-headers' ||
        lower === 'access-control-allow-methods'
      ) {
        delete responseHeaders[key];
      }
    }
    responseHeaders['Access-Control-Allow-Origin'] = ['*'];
    responseHeaders['Access-Control-Allow-Headers'] = ['*'];
    responseHeaders['Access-Control-Allow-Methods'] = ['GET, POST, OPTIONS'];
  }
  return responseHeaders;
}

function configureSessionSecurityAndAdblock({
  session,
  mobileUserAgent,
  desktopUserAgent,
  maxCacheBytes,
  getMainWindow
}) {
  if (sessionConfigured || !session || !session.defaultSession) return;
  sessionConfigured = true;

  // 1. Stealth network shield (respects per-host bypass, first-party assets, media streams & bait scripts)
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const decision = shouldBlockNetworkRequest(details);
    if (decision.cancel) {
      if (decision.host) {
        const nextCount = (blockedCountByEmbedHost.get(decision.host) || 0) + 1;
        blockedCountByEmbedHost.set(decision.host, nextCount);
        emitAdShieldEvent(
          getMainWindow(),
          { type: 'request-blocked', url: decision.reqUrl, host: decision.host, count: nextCount },
          350
        );
      }
      callback({ cancel: true });
      return;
    }
    callback({ cancel: false });
  });

  // 2. Clean User-Agent & Referer spoofing
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    const headers = { ...details.requestHeaders };
    const reqUrl = details.url || '';
    const isLocalRequest = reqUrl.startsWith('http://127.0.0.1') || reqUrl.startsWith('file://');
    const needsPjReferer =
      reqUrl.includes('workers.dev') ||
      reqUrl.includes('seriesplayer') ||
      reqUrl.includes('pelisplayer') ||
      reqUrl.includes('pelisjuanita.com') ||
      reqUrl.includes('flixlat.com') ||
      reqUrl.includes('playspelis.com') ||
      reqUrl.includes('onfilom.com') ||
      reqUrl.includes('solo-latino.com') ||
      reqUrl.includes('321moviesfree.com');

    headers['User-Agent'] = needsPjReferer ? mobileUserAgent : desktopUserAgent;

    for (const key of Object.keys(headers)) {
      const lower = key.toLowerCase();
      if (lower.startsWith('sec-ch-ua') || lower === 'x-requested-with') {
        delete headers[key];
      }
      if (
        (lower === 'origin' || lower === 'referer') &&
        (String(headers[key]).includes('127.0.0.1') ||
          String(headers[key]).includes('localhost') ||
          String(headers[key]).startsWith('file://'))
      ) {
        delete headers[key];
      }
    }

    if (!isLocalRequest) {
      if (reqUrl.includes('pelisjuanita.com')) {
        delete headers['Cookie'];
        delete headers['cookie'];
        const rndIp = `187.${Math.floor(Math.random() * 200) + 20}.${Math.floor(Math.random() * 240) + 10}.${Math.floor(Math.random() * 240) + 10}`;
        headers['X-Forwarded-For'] = rndIp;
        headers['X-Real-IP'] = rndIp;
        headers['Client-IP'] = rndIp;
      }
      if (needsPjReferer) {
        headers['Referer'] = 'https://pelisjuanita.com/';
        if (reqUrl.includes('workers.dev')) {
          headers['Sec-Fetch-Dest'] = 'iframe';
          headers['Sec-Fetch-Mode'] = 'navigate';
          headers['Sec-Fetch-Site'] = 'cross-site';
        }
      } else if (!headers['Referer'] && !headers['referer'] && details.resourceType === 'subFrame') {
        headers['Referer'] = 'https://pelisjuanita.com/';
      }
    }

    callback({ requestHeaders: headers });
  });

  // 3. Relax X-Frame-Options & frame-ancestors/sandbox + ensure single-valued CORS headers
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = sanitizeResponseHeaders(details.responseHeaders, details.url);
    callback({ responseHeaders });
  });

  // 3b. Passive resolution hint telemetry for HD-First scoring
  session.defaultSession.webRequest.onCompleted((details) => {
    if (!activeEmbedHost || !details || details.statusCode < 200 || details.statusCode >= 400) return;
    const reqUrl = String(details.url || '');
    if (!reqUrl || !/\.(?:m3u8|mp4|mpd)(?:$|\?)/i.test(reqUrl)) return;
    const resMatch = reqUrl.match(/(?:^|[^0-9])(2160|1080|720|480|360)p?(?:[^0-9]|$)/i);
    if (resMatch && resMatch[1]) {
      const h = parseInt(resMatch[1], 10) || 0;
      if (h > 0) {
        emitAdShieldEvent(getMainWindow(), { type: 'media-hint', host: activeEmbedHost, height: h, url: reqUrl }, 1200);
      }
    }
  });

  // 4. Background cache size hygiene
  if (typeof maxCacheBytes === 'number' && maxCacheBytes > 0) {
    setTimeout(() => {
      session.defaultSession
        .getCacheSize()
        .then((size) => {
          if (size > maxCacheBytes) {
            return session.defaultSession.clearCache();
          }
        })
        .catch(() => {});
    }, 6000);
  }
}

function attachWindowStealthHandlers(mainWindow, { shell, webFrameMain }) {
  // Block popup windows from embed servers; only allow external open from mainFrame/127.0.0.1 for allowed prefixes
  mainWindow.webContents.setWindowOpenHandler((details) => {
    const decision = shouldAllowWindowOpen(details, mainWindow.webContents.mainFrame);
    if (decision.allowExternal) {
      shell.openExternal(decision.url).catch(() => {});
      return { action: 'deny' };
    }
    emitAdShieldEvent(
      mainWindow,
      { type: 'popup-blocked', url: decision.url, host: activeEmbedHost || '' },
      250
    );
    return { action: 'deny' };
  });

  // Block confirmed ad-redirects inside embed iframes without blocking legitimate players/CDNs
  mainWindow.webContents.on('will-frame-navigate', (details) => {
    if (shouldBlockSubframeNavigation(details)) {
      details.preventDefault();
      emitAdShieldEvent(
        mainWindow,
        { type: 'nav-blocked', url: String(details.url || ''), host: activeEmbedHost || '' },
        250
      );
    }
  });

  // Inject cosmetic & video ad-blocker script into external HTTP(S) embed subframes (skip when host is in bypass mode)
  mainWindow.webContents.on('did-frame-finish-load', (_event, isMainFrame, frameProcessId, frameRoutingId) => {
    if (!isMainFrame && webFrameMain) {
      try {
        const frame = webFrameMain.fromId(frameProcessId, frameRoutingId);
        if (
          frame &&
          !frame.isDestroyed() &&
          typeof frame.url === 'string' &&
          (frame.url.startsWith('https://') || frame.url.startsWith('http://')) &&
          !frame.url.startsWith('http://127.0.0.1')
        ) {
          const frameHost = normalizeEmbedHost(frame.url);
          if ((activeEmbedHost && adShieldBypassHosts.has(activeEmbedHost)) || (frameHost && adShieldBypassHosts.has(frameHost))) {
            return;
          }
          frame.executeJavaScript(EMBED_ADBLOCK_SCRIPT).catch(() => {});
        }
      } catch {}
    }
  });
}

module.exports = {
  ALLOWED_UPDATE_PREFIXES,
  ALLOWED_EXTERNAL_OPEN_PREFIXES,
  STEALTH_AD_DOMAINS,
  STEALTH_AD_DOMAIN_SET,
  MEDIA_STREAM_EXT_RE,
  BAIT_SCRIPT_RE,
  EMBED_ADBLOCK_SCRIPT,
  adShieldBypassHosts,
  normalizeEmbedHost,
  getRegistrableDomain,
  isSameSiteOrFirstParty,
  isMediaAssetUrl,
  isBaitScriptUrl,
  isStealthAdUrl,
  isAllowedExternalOpen,
  shouldAllowWindowOpen,
  shouldBlockSubframeNavigation,
  shouldBlockNetworkRequest,
  getActiveEmbedHost,
  setActiveEmbedHost,
  addAdShieldBypassHost,
  isAdShieldBypassed,
  clearAdShieldBypassHosts,
  getBlockedCountForHost,
  emitAdShieldEvent,
  sanitizeResponseHeaders,
  configureSessionSecurityAndAdblock,
  attachWindowStealthHandlers
};
