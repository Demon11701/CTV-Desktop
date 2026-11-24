const { app, BrowserWindow, session, shell, ipcMain, webFrameMain } = require('electron');
const path = require('path');
const http = require('http');
const https = require('https');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

/* ============================================================================
 * 1. CONFIGURACIÓN DE PLATAFORMA, RUTA PERSISTENTE Y ACELERACIÓN GPU
 * ============================================================================ */
const MOBILE_USER_AGENT =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';
const DESKTOP_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const USER_AGENT = MOBILE_USER_AGENT;
const MAX_CACHE_BYTES = 180 * 1024 * 1024; // 180 MB límite en disco
const MAX_PROXY_BODY_BYTES = 15 * 1024 * 1024; // 15 MB límite seguro por respuesta proxy
const MAX_STATE_BODY_BYTES = 256 * 1024; // 256 KB límite estricto para /__ctv_state
const PREFERRED_LOCAL_PORTS = [45780, 45781, 45782, 45783, 45784, 0];

const ALLOWED_UPDATE_PREFIXES = [
  'https://github.com/Demon11701/CTV-Desktop/',
  'https://objects.githubusercontent.com/',
  'https://release-assets.githubusercontent.com/'
];

// Garantizar ruta userData estable en %APPDATA%\CTV en Windows Portable (nunca en %TEMP% ni carpeta efímera NSIS)
function configureStableUserDataPath() {
  try {
    if (process.platform === 'win32') {
      const appDataBase = process.env.APPDATA || app.getPath('appData');
      if (appDataBase) {
        const stableDir = path.join(appDataBase, 'CTV');
        fs.mkdirSync(stableDir, { recursive: true });
        app.setPath('userData', stableDir);
      }
    }
  } catch {}
}

function resolvePackageAppVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf-8'));
    if (pkg && typeof pkg.version === 'string' && pkg.version.trim()) {
      return pkg.version.trim();
    }
  } catch {}
  const v = app.getVersion();
  return v && v !== (process.versions && process.versions.electron) ? v : '1.6.2';
}

const APP_VERSION = resolvePackageAppVersion();
configureStableUserDataPath();
app.userAgentFallback = USER_AGENT;

function getPersistentStateFilePath() {
  return path.join(app.getPath('userData'), 'ctv-user-state.json');
}

function normalizeArrayBySlug(arr) {
  if (!Array.isArray(arr)) return [];
  const map = new Map();
  for (const item of arr) {
    if (item && typeof item === 'object' && item.slug) {
      map.set(String(item.slug), item);
    }
  }
  return Array.from(map.values());
}

function normalizeStringArray(arr) {
  if (!Array.isArray(arr)) return [];
  return Array.from(new Set(arr.map((x) => String(x || '').trim()).filter(Boolean)));
}

const MAX_WATCH_PROGRESS_ENTRIES = 60;

function normalizeWatchProgressMap(rawMap) {
  if (!rawMap || typeof rawMap !== 'object' || Array.isArray(rawMap)) return {};
  const entries = [];
  for (const [rawKey, val] of Object.entries(rawMap)) {
    const key = typeof rawKey === 'string' ? rawKey.trim() : '';
    if (!key || key.length > 180 || key === '__proto__' || key === 'constructor' || key === 'prototype') {
      continue;
    }
    if (!val || typeof val !== 'object' || Array.isArray(val)) continue;
    if (typeof val.t !== 'number' || !Number.isFinite(val.t) || val.t < 5) continue;
    if (typeof val.d !== 'number' || !Number.isFinite(val.d) || val.d <= 0) continue;
    if (typeof val.updatedAt !== 'number' || !Number.isFinite(val.updatedAt) || val.updatedAt <= 0) continue;
    entries.push([
      key,
      {
        t: val.t,
        d: val.d,
        title: typeof val.title === 'string' ? val.title.slice(0, 160) : '',
        poster: typeof val.poster === 'string' ? val.poster.slice(0, 320) : '',
        type: val.type === 'serie' ? 'serie' : 'movie',
        slug: typeof val.slug === 'string' ? val.slug.slice(0, 140) : '',
        ep: typeof val.ep === 'string' ? val.ep.slice(0, 24) : '',
        updatedAt: val.updatedAt
      }
    ]);
  }
  entries.sort((a, b) => b[1].updatedAt - a[1].updatedAt);
  const out = {};
  for (const [key, cleanVal] of entries.slice(0, MAX_WATCH_PROGRESS_ENTRIES)) {
    out[key] = cleanVal;
  }
  return out;
}

function readPersistentState() {
  const defaultState = {
    favMovies: [],
    favSeries: [],
    favTvSlugs: [],
    watched: [],
    userPrefs: {},
    watchProgress: {},
    dismissedUpdateTag: '',
    updatedAt: 0
  };
  try {
    const filePath = getPersistentStateFilePath();
    if (!fs.existsSync(filePath)) return defaultState;
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    if (!raw || typeof raw !== 'object') return defaultState;
    return {
      favMovies: normalizeArrayBySlug(raw.favMovies),
      favSeries: normalizeArrayBySlug(raw.favSeries),
      favTvSlugs: normalizeStringArray(raw.favTvSlugs),
      watched: normalizeStringArray(raw.watched),
      userPrefs: raw.userPrefs && typeof raw.userPrefs === 'object' ? raw.userPrefs : {},
      watchProgress: normalizeWatchProgressMap(raw.watchProgress),
      dismissedUpdateTag: typeof raw.dismissedUpdateTag === 'string' ? raw.dismissedUpdateTag : '',
      updatedAt: Number(raw.updatedAt) || 0
    };
  } catch {
    return defaultState;
  }
}

let atomicWriteSeq = 0;
let atomicWriteInProgress = false;
let pendingStatePatchQueue = [];

function sleepSyncMs(ms) {
  try {
    if (typeof SharedArrayBuffer === 'function' && typeof Atomics === 'object') {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
      return;
    }
  } catch {}
  const end = Date.now() + ms;
  while (Date.now() < end) {
    // Fallback breve no bloqueante
  }
}

function cleanupOrphanedStateTempFiles() {
  try {
    const filePath = getPersistentStateFilePath();
    const dirPath = path.dirname(filePath);
    const baseName = path.basename(filePath);
    if (!fs.existsSync(dirPath)) return;
    const entries = fs.readdirSync(dirPath);
    for (const entry of entries) {
      if (entry.startsWith(baseName + '.') && entry.endsWith('.tmp')) {
        try {
          fs.unlinkSync(path.join(dirPath, entry));
        } catch {}
      }
    }
  } catch {}
}

cleanupOrphanedStateTempFiles();

function isValidStatePatchObject(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
  if (obj.watchProgress !== undefined && (!obj.watchProgress || typeof obj.watchProgress !== 'object' || Array.isArray(obj.watchProgress))) {
    return false;
  }
  const allowedKeys = new Set([
    'favMovies',
    'favSeries',
    'favTvSlugs',
    'watched',
    'userPrefs',
    'watchProgress',
    'dismissedUpdateTag',
    'updatedAt'
  ]);
  return Object.keys(obj).every((k) => allowedKeys.has(k));
}

function writePersistentStateAtomic(patch = {}) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    return readPersistentState();
  }
  pendingStatePatchQueue.push(patch);
  if (atomicWriteInProgress) {
    return readPersistentState();
  }
  atomicWriteInProgress = true;
  let lastSaved = null;
  try {
    while (pendingStatePatchQueue.length > 0) {
      const curPatch = pendingStatePatchQueue.shift();
      const current = lastSaved || readPersistentState();
      const next = {
        favMovies: Array.isArray(curPatch.favMovies) ? normalizeArrayBySlug(curPatch.favMovies) : current.favMovies,
        favSeries: Array.isArray(curPatch.favSeries) ? normalizeArrayBySlug(curPatch.favSeries) : current.favSeries,
        favTvSlugs: Array.isArray(curPatch.favTvSlugs) ? normalizeStringArray(curPatch.favTvSlugs) : current.favTvSlugs,
        watched: Array.isArray(curPatch.watched) ? normalizeStringArray(curPatch.watched) : current.watched,
        userPrefs:
          curPatch.userPrefs && typeof curPatch.userPrefs === 'object' && !Array.isArray(curPatch.userPrefs)
            ? { ...current.userPrefs, ...curPatch.userPrefs }
            : current.userPrefs,
        watchProgress:
          curPatch.watchProgress && typeof curPatch.watchProgress === 'object' && !Array.isArray(curPatch.watchProgress)
            ? normalizeWatchProgressMap(curPatch.watchProgress)
            : (current.watchProgress || {}),
        dismissedUpdateTag:
          typeof curPatch.dismissedUpdateTag === 'string'
            ? curPatch.dismissedUpdateTag
            : current.dismissedUpdateTag,
        updatedAt: Date.now()
      };

      const filePath = getPersistentStateFilePath();
      const dirPath = path.dirname(filePath);
      fs.mkdirSync(dirPath, { recursive: true });
      const tmpPath = `${filePath}.${process.pid}.${++atomicWriteSeq}.tmp`;
      const serialized = JSON.stringify(next, null, 2);
      fs.writeFileSync(tmpPath, serialized, 'utf-8');

      let renamed = false;
      for (let attempt = 1; attempt <= 3 && !renamed; attempt++) {
        try {
          fs.renameSync(tmpPath, filePath);
          renamed = true;
        } catch (err) {
          const code = (err && err.code) || '';
          if ((code === 'EPERM' || code === 'EBUSY' || code === 'EACCES') && attempt < 3) {
            sleepSyncMs(15 * attempt);
          } else {
            break;
          }
        }
      }

      if (!renamed) {
        try {
          fs.copyFileSync(tmpPath, filePath);
        } catch {
          try {
            fs.writeFileSync(filePath, serialized, 'utf-8');
          } catch {}
        }
        try {
          if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
        } catch {}
      }

      lastSaved = next;
    }
    return lastSaved || readPersistentState();
  } catch {
    return readPersistentState();
  } finally {
    atomicWriteInProgress = false;
    cleanupOrphanedStateTempFiles();
  }
}

function configureHardwareAcceleration() {
  const isLinux = process.platform === 'linux';
  const isWin = process.platform === 'win32';

  // Opción de emergencia explícita para forzar renderizado por software si el usuario lo solicita
  if (process.env.CTV_DISABLE_GPU === '1') {
    app.disableHardwareAcceleration();
  }

  // Control razonable de caché en disco para evitar crecimiento infinito
  app.commandLine.appendSwitch('disk-cache-size', String(MAX_CACHE_BYTES));
  app.commandLine.appendSwitch('media-cache-size', String(100 * 1024 * 1024));
  // Autoplay fluido para canales y streams sin gesto adicional
  app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

  if (isLinux) {
    const isWayland =
      String(process.env.XDG_SESSION_TYPE || '').toLowerCase() === 'wayland' ||
      Boolean(process.env.WAYLAND_DISPLAY);
    const isNvidiaOffload =
      process.env.__NV_PRIME_RENDER_OFFLOAD === '1' ||
      String(process.env.__GLX_VENDOR_LIBRARY_NAME || '').toLowerCase() === 'nvidia' ||
      String(process.env.GBM_BACKEND || '').toLowerCase().includes('nvidia') ||
      String(process.env.LIBVA_DRIVER_NAME || '').toLowerCase() === 'nvidia';

    // Mantener fallback limpio a X11/XWayland y decodificación segura sin forzar VA-API, Vulkan ni --use-gl
    // (evita pantalla negra de video en portátiles híbridos Intel + NVIDIA Optimus / prime-run bajo Hyprland)
    const prevEnabled = app.commandLine
      .getSwitchValue('enable-features')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s && !/vulkan/i.test(s));
    const prevDisabled = app.commandLine
      .getSwitchValue('disable-features')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const linuxEnabledSet = new Set(prevEnabled);
    const linuxDisabledSet = new Set(prevDisabled);

    if (isWayland) {
      if (!app.commandLine.hasSwitch('ozone-platform') && !app.commandLine.hasSwitch('ozone-platform-hint')) {
        app.commandLine.appendSwitch('ozone-platform-hint', 'auto');
      }
      if (app.commandLine.hasSwitch('use-vulkan')) {
        app.commandLine.removeSwitch('use-vulkan');
      }
      if (!app.commandLine.hasSwitch('use-webgpu-adapter')) {
        // Evita que Dawn/WebGPU invoque InitializeVulkan (webgpu_on_vk_via_gl_interop) en Ozone-Wayland sin afectar WebGL2/EGL
        app.commandLine.appendSwitch('use-webgpu-adapter', 'opengles');
      }
      // Consolidar una sola llamada disable-features para desactivar Vulkan por completo bajo Ozone-Wayland
      ['Vulkan', 'DefaultAngleVulkan', 'VulkanFromANGLE', 'VulkanV2'].forEach((f) => linuxDisabledSet.add(f));
      linuxEnabledSet.add('WaylandWindowDecorations');
    }
    // Opt-in manual para VA-API moderno únicamente fuera de NVIDIA offload
    if (process.env.CTV_ENABLE_VAAPI === '1' && !isNvidiaOffload) {
      linuxEnabledSet.add('AcceleratedVideoDecodeLinuxGL');
      linuxEnabledSet.add('AcceleratedVideoDecodeLinuxZeroCopyGL');
    }
    if (linuxDisabledSet.size > 0) {
      app.commandLine.removeSwitch('disable-features');
      app.commandLine.appendSwitch('disable-features', Array.from(linuxDisabledSet).join(','));
    }
    if (linuxEnabledSet.size > 0) {
      app.commandLine.removeSwitch('enable-features');
      app.commandLine.appendSwitch('enable-features', Array.from(linuxEnabledSet).join(','));
    }
  } else if (isWin) {
    // Decodificación hardware D3D11 + MediaFoundation en Windows respetando la GPU blocklist de Chromium para fallback seguro
    app.commandLine.appendSwitch(
      'enable-features',
      'D3D11VideoDecoder,MediaFoundationD3D11VideoCapture,PlatformHEVCDecoderSupport,HardwareMediaKeyHandling'
    );
    app.commandLine.appendSwitch('enable-accelerated-video-decode');
  }
}

configureHardwareAcceleration();

// Evitar instancias duplicadas / procesos zombi en Windows y Linux
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

/* ============================================================================
 * 2. RED, BLOQUEO DE ANUNCIOS O(labels) Y ESCUDO ANTI-SANDBOX / PROXY
 * ============================================================================ */
const AD_DOMAINS = [
  '33across.com',
  'a-ads.com',
  'acscdn.com',
  'ad-maven.com',
  'adangle.online',
  'adcash.com',
  'adform.net',
  'admaven.com',
  'adnxs.com',
  'adsafeprotected.com',
  'adsco.re',
  'adservice.google.com',
  'adskeeper.co.uk',
  'adskeeper.com',
  'adspyglass.com',
  'adsrvr.org',
  'adsterra.com',
  'adtng.com',
  'adxxx.com',
  'amazon-adsystem.com',
  'ay.delivery',
  'bet365.com',
  '1xbet.com',
  'bidgear.com',
  'bidvertiser.com',
  'bongacams.com',
  'casalemedia.com',
  'chaturbate.com',
  'clickadu.com',
  'clickadu.net',
  'clickaine.com',
  'connatix.com',
  'cpmrevenuegate.com',
  'criteo.com',
  'cvt-s1.adangle.online',
  'displayformatrevenue.com',
  'doubleclick.net',
  'dtscdn.com',
  'dtscout.com',
  'effectivegatecpm.com',
  'ero-advertising.com',
  'exdynsrv.com',
  'exoclick.com',
  'exoclick.net',
  'exosrv.com',
  'galaksion.com',
  'gigaduckgo.com',
  'googleadservices.com',
  'googlesyndication.com',
  'highperformanceformat.com',
  'highrevenuegate.com',
  'hilltopads.com',
  'hilltopads.net',
  'histats.com',
  'juicyads.com',
  'kadam.net',
  'livejasmin.com',
  'llvpn.com',
  'mc.yandex.ru',
  'media.net',
  'mgid.com',
  'moatads.com',
  'mondiad.com',
  'monetag.com',
  'oclasrv.com',
  'onclickads.net',
  'onclkds.com',
  'onetag-sys.com',
  'openx.net',
  'outbrain.com',
  'pemsrv.com',
  'phruk.org',
  'flawlessimmunizeguy.com',
  'plugrush.com',
  'popads.com',
  'popads.net',
  'popcash.net',
  'popmyads.com',
  'popunderjs.com',
  'primis.tech',
  'profitableratecpm.com',
  'propellerads.com',
  'pubmatic.com',
  'pushame.com',
  'realsrv.com',
  'revcontent.com',
  'richpush.co',
  'rollerads.com',
  'rubiconproject.com',
  'sharethrough.com',
  'smartadserver.com',
  'stripchat.com',
  'taboola.com',
  'teads.tv',
  'trafficfactory.biz',
  'trafficjunky.net',
  'trafficstars.com',
  'tsyndicate.com',
  'tsyndicate.net',
  'vi.ai',
  'vidoomy.com',
  'wpadmngr.com',
  'yllix.com'
];

// Búsqueda O(labels) mediante Set en lugar de escaneo lineal O(N) por cada petición
const AD_DOMAIN_SET = new Set(AD_DOMAINS);

const AD_PATH_PATTERNS = [
  /\/pop(?:under|up)\.js(\?|$)/i,
  /\/ad(?:s|server|manager|vast|block|loader)\.js(\?|$)/i,
  /\/vast\.xml(\?|$)/i,
  /\/nativeads\//i,
  /\/popunder\//i,
  /\/clickunder\//i,
  /\/banner(?:s|ad)?\.js(\?|$)/i
];

function isAdUrl(rawUrl) {
  if (!rawUrl || rawUrl.startsWith('http://127.0.0.1') || rawUrl.startsWith('blob:') || rawUrl.startsWith('data:')) {
    return false;
  }
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase();
    // Verificar dominio exacto y sufijos padre en O(labels)
    let dotIdx = -1;
    let candidate = host;
    while (candidate) {
      if (AD_DOMAIN_SET.has(candidate)) return true;
      dotIdx = candidate.indexOf('.');
      if (dotIdx < 0) break;
      candidate = candidate.slice(dotIdx + 1);
    }
    const fullPath = parsed.pathname + parsed.search;
    for (let i = 0; i < AD_PATH_PATTERNS.length; i++) {
      if (AD_PATH_PATTERNS[i].test(fullPath)) {
        return true;
      }
    }
  } catch {}
  return false;
}

// In-frame cosmetic & scriptlet ad-shield optimizado (MutationObserver + rAF en lugar de polling agresivo de 500ms)
const EMBED_ADBLOCK_SCRIPT = `
(function() {
  if (window.__pjAd) return;
  window.__pjAd = 1;
  try {
    window.cRAds = true;
    window.xRds = false;
    const noop = function() { return null; };
    window.open = noop;
    Object.defineProperty(window, 'open', { value: noop, writable: false, configurable: false });
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

let mainWindow = null;
let localServer = null;
let sessionConfigured = false;
let selfUpdateState = { state: 'idle', percent: 0, error: '' };

function isAllowedUpdateUrl(url) {
  return typeof url === 'string' && ALLOWED_UPDATE_PREFIXES.some((p) => url.startsWith(p));
}

function getSelfExecutablePath() {
  if (process.env.APPIMAGE) return process.env.APPIMAGE;
  if (process.env.PORTABLE_EXECUTABLE_FILE) return process.env.PORTABLE_EXECUTABLE_FILE;
  if (app.isPackaged) return process.execPath;
  return '';
}

function downloadFileWithProgress(url, destPath, onProgress, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 8) {
      reject(new Error('Demasiadas redirecciones'));
      return;
    }
    const parsed = new URL(url);
    const client = parsed.protocol === 'https:' ? https : http;
    const req = client.get(
      parsed,
      {
        headers: { 'User-Agent': USER_AGENT, Accept: '*/*' },
        timeout: 30000
      },
      (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          const nextUrl = new URL(res.headers.location, url).toString();
          res.resume();
          downloadFileWithProgress(nextUrl, destPath, onProgress, redirectCount + 1)
            .then(resolve)
            .catch(reject);
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error('HTTP ' + res.statusCode));
          return;
        }
        const total = parseInt(res.headers['content-length'] || '0', 10);
        let received = 0;
        const fileStream = fs.createWriteStream(destPath);
        res.on('data', (chunk) => {
          received += chunk.length;
          if (total > 0 && onProgress) {
            onProgress(Math.min(99, Math.round((received * 100) / total)));
          }
        });
        res.pipe(fileStream);
        fileStream.on('finish', () => {
          fileStream.close(() => resolve(destPath));
        });
        fileStream.on('error', (err) => {
          try { fs.unlinkSync(destPath); } catch {}
          reject(err);
        });
      }
    );
    req.on('timeout', () => {
      req.destroy(new Error('Tiempo de descarga agotado'));
    });
    req.on('error', (err) => {
      try { fs.unlinkSync(destPath); } catch {}
      reject(err);
    });
  });
}

function startDesktopSelfUpdate(downloadUrl) {
  if (!isAllowedUpdateUrl(downloadUrl)) {
    selfUpdateState = { state: 'error', percent: 0, error: 'URL de actualización no permitida' };
    return selfUpdateState;
  }
  if (selfUpdateState.state === 'downloading') return selfUpdateState;
  const targetExe = getSelfExecutablePath();
  if (!targetExe) {
    selfUpdateState = { state: 'error', percent: 0, error: 'Modo desarrollo (sin ejecutable empaquetado)' };
    return selfUpdateState;
  }

  const tempFile = targetExe + '.update-tmp';
  selfUpdateState = { state: 'downloading', percent: 1, error: '' };

  downloadFileWithProgress(downloadUrl, tempFile, (pct) => {
    selfUpdateState.percent = pct;
  })
    .then(() => {
      selfUpdateState = { state: 'restarting', percent: 100, error: '' };
      if (process.platform === 'win32') {
        const batPath = path.join(os.tmpdir(), 'ctv_self_update_' + Date.now() + '.bat');
        const batContent = [
          '@echo off',
          'ping 127.0.0.1 -n 3 > nul',
          `move /y "${tempFile}" "${targetExe}" > nul`,
          `start "" "${targetExe}"`,
          'del "%~f0"'
        ].join('\r\n');
        fs.writeFileSync(batPath, batContent, 'utf-8');
        spawn('cmd.exe', ['/c', batPath], {
          detached: true,
          stdio: 'ignore',
          windowsHide: true
        }).unref();
        setTimeout(() => app.quit(), 400);
      } else {
        fs.chmodSync(tempFile, 0o755);
        fs.renameSync(tempFile, targetExe);
        spawn(targetExe, [], {
          detached: true,
          stdio: 'ignore'
        }).unref();
        setTimeout(() => app.quit(), 400);
      }
    })
    .catch((err) => {
      selfUpdateState = {
        state: 'error',
        percent: 0,
        error: String((err && err.message) || err)
      };
    });

  return selfUpdateState;
}

function proxyFetchRequest(targetUrl, options = {}, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 6) {
      reject(new Error('Too many redirects'));
      return;
    }
    try {
      const parsed = new URL(targetUrl);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        reject(new Error('Unsupported protocol'));
        return;
      }
      const client = parsed.protocol === 'https:' ? https : http;
      const method = (options.method || 'GET').toUpperCase();
      const ref = options.referer || 'https://pelisjuanita.com/';
      let refOrigin = 'https://pelisjuanita.com';
      try {
        refOrigin = new URL(ref).origin;
      } catch {}

      const reqHeaders = {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
        'Referer': ref,
        'Origin': refOrigin,
        'Sec-Fetch-Dest': 'iframe',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'cross-site',
        ...(options.headers || {})
      };

      if (parsed.hostname.includes('pelisjuanita.com')) {
        const rndIp = `187.${Math.floor(Math.random() * 200) + 20}.${Math.floor(Math.random() * 240) + 10}.${Math.floor(Math.random() * 240) + 10}`;
        reqHeaders['X-Forwarded-For'] = rndIp;
        reqHeaders['X-Real-IP'] = rndIp;
        reqHeaders['Client-IP'] = rndIp;
      }

      const bodyBuf = options.body ? Buffer.from(options.body, 'utf-8') : null;
      if (bodyBuf) {
        reqHeaders['Content-Length'] = bodyBuf.length;
      }

      const req = client.request(
        parsed,
        {
          method,
          headers: reqHeaders,
          timeout: 12000,
          rejectUnauthorized: false
        },
        (res) => {
          if (
            [301, 302, 303, 307, 308].includes(res.statusCode) &&
            res.headers.location
          ) {
            const nextUrl = new URL(res.headers.location, targetUrl).toString();
            res.resume();
            proxyFetchRequest(
              nextUrl,
              { ...options, method: res.statusCode === 303 ? 'GET' : method, body: res.statusCode === 303 ? null : options.body },
              redirectCount + 1
            )
              .then(resolve)
              .catch(reject);
            return;
          }

          const chunks = [];
          let totalBytes = 0;
          let aborted = false;
          res.on('data', (c) => {
            totalBytes += c.length;
            if (totalBytes > MAX_PROXY_BODY_BYTES) {
              aborted = true;
              res.destroy(new Error('Response too large'));
              return;
            }
            chunks.push(c);
          });
          res.on('error', (err) => reject(err));
          res.on('end', () => {
            if (aborted) return;
            const body = Buffer.concat(chunks).toString('utf-8');
            const rawSc = res.headers['set-cookie'];
            const cookies = Array.isArray(rawSc)
              ? rawSc.map((c) => String(c).split(';')[0].trim()).filter(Boolean).join('; ')
              : typeof rawSc === 'string'
                ? rawSc.split(';')[0].trim()
                : '';
            resolve({
              status: res.statusCode || 200,
              finalUrl: targetUrl,
              contentType: res.headers['content-type'] || 'text/plain; charset=utf-8',
              cookies,
              body
            });
          });
        }
      );

      req.on('timeout', () => {
        req.destroy(new Error('Request timeout'));
      });
      req.on('error', reject);
      if (bodyBuf) {
        req.write(bodyBuf);
      }
      req.end();
    } catch (err) {
      reject(err);
    }
  });
}

function startLocalServer(rootDir) {
  if (localServer) {
    const addr = localServer.address();
    if (addr && addr.port) {
      return Promise.resolve(`http://127.0.0.1:${addr.port}/index.html`);
    }
  }
  return new Promise((resolve) => {
    const server = http.createServer(async (req, res) => {
      try {
        const parsedUrl = new URL(req.url, 'http://127.0.0.1');
        let pathname = decodeURIComponent(parsedUrl.pathname);

        if (pathname === '/__ctv_state') {
          const addr = server.address();
          const activePort = (addr && addr.port) || 45780;
          const expectedOrigin = `http://127.0.0.1:${activePort}`;
          const remoteAddr = String((req.socket && req.socket.remoteAddress) || '');
          const isLoopbackSocket = remoteAddr === '127.0.0.1' || remoteAddr === '::ffff:127.0.0.1';
          const originHdr = String(req.headers['origin'] || '').trim();
          const refererHdr = String(req.headers['referer'] || '').trim();
          const localTokenHdr = String(req.headers['x-ctv-local'] || '').trim();

          const originForbidden = Boolean(originHdr && originHdr !== expectedOrigin);
          const refererForbidden = Boolean(
            refererHdr && refererHdr !== expectedOrigin && !refererHdr.startsWith(expectedOrigin + '/')
          );
          const hasTrustedContext =
            originHdr === expectedOrigin ||
            refererHdr === expectedOrigin ||
            refererHdr.startsWith(expectedOrigin + '/') ||
            localTokenHdr === '1';

          if (!isLoopbackSocket || originForbidden || refererForbidden || !hasTrustedContext) {
            res.writeHead(403, {
              'Content-Type': 'application/json; charset=utf-8',
              'Cache-Control': 'no-store'
            });
            res.end(JSON.stringify({ ok: false, error: 'Forbidden: untrusted origin' }));
            return;
          }

          if (req.method === 'OPTIONS') {
            res.writeHead(204, {
              'Access-Control-Allow-Origin': expectedOrigin,
              'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
              'Access-Control-Allow-Headers': 'Content-Type, X-CTV-Local',
              'Vary': 'Origin'
            });
            res.end();
            return;
          }

          if (req.method === 'POST') {
            const contentLen = parseInt(req.headers['content-length'] || '0', 10) || 0;
            if (contentLen > MAX_STATE_BODY_BYTES) {
              req.resume();
              res.writeHead(413, {
                'Content-Type': 'application/json; charset=utf-8',
                'Cache-Control': 'no-store'
              });
              res.end(JSON.stringify({ ok: false, error: 'Payload Too Large (max 256 KB)' }));
              return;
            }
            const chunks = [];
            let bytes = 0;
            let tooLarge = false;
            req.on('data', (c) => {
              bytes += c.length;
              if (bytes > MAX_STATE_BODY_BYTES) {
                tooLarge = true;
                chunks.length = 0;
                return;
              }
              chunks.push(c);
            });
            req.on('end', () => {
              if (tooLarge) {
                res.writeHead(413, {
                  'Content-Type': 'application/json; charset=utf-8',
                  'Cache-Control': 'no-store'
                });
                res.end(JSON.stringify({ ok: false, error: 'Payload Too Large (max 256 KB)' }));
                return;
              }
              let parsed = null;
              try {
                const bodyStr = Buffer.concat(chunks).toString('utf-8');
                parsed = JSON.parse(bodyStr || '{}');
              } catch {
                parsed = null;
              }
              if (!isValidStatePatchObject(parsed)) {
                res.writeHead(400, {
                  'Content-Type': 'application/json; charset=utf-8',
                  'Cache-Control': 'no-store'
                });
                res.end(JSON.stringify({ ok: false, error: 'Invalid state payload' }));
                return;
              }
              const saved = writePersistentStateAtomic(parsed);
              res.writeHead(200, {
                'Content-Type': 'application/json; charset=utf-8',
                'Access-Control-Allow-Origin': expectedOrigin,
                'Cache-Control': 'no-store'
              });
              res.end(JSON.stringify({ ok: true, state: saved }));
            });
            return;
          }

          res.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8',
            'Access-Control-Allow-Origin': expectedOrigin,
            'Cache-Control': 'no-store'
          });
          res.end(JSON.stringify({ ok: true, state: readPersistentState() }));
          return;
        }

        if (pathname === '/__ctv_self_update') {
          const dlUrl = parsedUrl.searchParams.get('url');
          if (!dlUrl || !isAllowedUpdateUrl(dlUrl)) {
            res.writeHead(400, { 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ ok: false, error: 'URL inválida o no permitida' }));
            return;
          }
          startDesktopSelfUpdate(dlUrl);
          res.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-store'
          });
          res.end(JSON.stringify({ ok: true, state: selfUpdateState }));
          return;
        }

        if (pathname === '/__ctv_self_update_status') {
          res.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-store'
          });
          res.end(JSON.stringify(selfUpdateState));
          return;
        }

        if (pathname === '/__ctv_proxy') {
          if (req.method === 'OPTIONS') {
            res.writeHead(204, {
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
              'Access-Control-Allow-Headers': '*'
            });
            res.end();
            return;
          }
          const targetUrl = parsedUrl.searchParams.get('url');
          const ref = parsedUrl.searchParams.get('ref') || 'https://pelisjuanita.com/';
          const method = parsedUrl.searchParams.get('method') || req.method || 'GET';
          const contentType = parsedUrl.searchParams.get('ct') || '';
          const bodyParam = parsedUrl.searchParams.get('body') || '';
          const cookieParam = parsedUrl.searchParams.get('cookie') || '';
          const rawMode = parsedUrl.searchParams.get('raw') === '1';

          if (!targetUrl) {
            res.writeHead(400, { 'Access-Control-Allow-Origin': '*' });
            res.end('Missing url');
            return;
          }

          const extraHeaders = {};
          if (contentType) {
            extraHeaders['Content-Type'] = contentType;
          }
          if (cookieParam && !targetUrl.includes('pelisjuanita.com')) {
            extraHeaders['Cookie'] = cookieParam;
          }

          try {
            const result = await proxyFetchRequest(targetUrl, {
              method,
              referer: ref,
              body: bodyParam || null,
              headers: extraHeaders
            });

            if (rawMode) {
              res.writeHead(result.status, {
                'Content-Type': result.contentType,
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'no-store'
              });
              res.end(result.body);
            } else {
              res.writeHead(200, {
                'Content-Type': 'application/json; charset=utf-8',
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'no-store'
              });
              res.end(JSON.stringify(result));
            }
          } catch (e) {
            res.writeHead(502, {
              'Content-Type': 'application/json; charset=utf-8',
              'Access-Control-Allow-Origin': '*'
            });
            res.end(JSON.stringify({ status: 502, error: String(e.message || e), body: '' }));
          }
          return;
        }

        if (pathname === '/' || pathname === '') {
          pathname = '/index.html';
        }
        const safePath = path.normalize(pathname).replace(/^(\.\.(\/|\\|$))+/, '');
        const filePath = path.join(rootDir, safePath);

        if (!filePath.startsWith(rootDir)) {
          res.writeHead(403);
          res.end('Forbidden');
          return;
        }

        fs.readFile(filePath, (err, data) => {
          if (err) {
            res.writeHead(404);
            res.end('Not Found');
            return;
          }
          const ext = path.extname(filePath).toLowerCase();
          const isHashedAsset = safePath.startsWith(path.join('assets', ''));
          res.writeHead(200, {
            'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': isHashedAsset ? 'public, max-age=86400' : 'no-cache'
          });
          res.end(data);
        });
      } catch {
        res.writeHead(500);
        res.end('Internal Server Error');
      }
    });

    let portIdx = 0;
    const tryListen = () => {
      const targetPort = PREFERRED_LOCAL_PORTS[portIdx] !== undefined ? PREFERRED_LOCAL_PORTS[portIdx] : 0;
      const onError = (err) => {
        if (err && err.code === 'EADDRINUSE' && portIdx < PREFERRED_LOCAL_PORTS.length - 1) {
          portIdx += 1;
          tryListen();
        }
      };
      server.once('error', onError);
      server.listen(targetPort, '127.0.0.1', () => {
        server.removeListener('error', onError);
        const { port } = server.address();
        localServer = server;
        resolve(`http://127.0.0.1:${port}/index.html`);
      });
    };
    tryListen();
  });
}

function configureSessionSecurityAndAdblock() {
  if (sessionConfigured) return;
  sessionConfigured = true;

  // 1. Network-level Ad & Popunder Blocker (O(labels) lookup)
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    if (isAdUrl(details.url)) {
      callback({ cancel: true });
      return;
    }
    callback({ cancel: false });
  });

  // 2. Clean User-Agent & Referer Spoofing (Mobile UA para PelisJuanita/Workers; Desktop UA para CDNs de video externos en HD)
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

    headers['User-Agent'] = needsPjReferer ? MOBILE_USER_AGENT : DESKTOP_USER_AGENT;

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

  // 3. Relax X-Frame-Options & ensure CORS for video streams, subtitle tracks, and PelisJuanita API
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = { ...(details.responseHeaders || {}) };
    const u = (details.url || '').toLowerCase();
    for (const key of Object.keys(responseHeaders)) {
      const lower = key.toLowerCase();
      if (lower === 'x-frame-options') {
        delete responseHeaders[key];
      } else if (lower === 'content-security-policy') {
        responseHeaders[key] = responseHeaders[key].map((v) =>
          v.replace(/frame-ancestors[^;]*;?/gi, '')
        );
      } else if (lower === 'set-cookie' && u.includes('pelisjuanita.com')) {
        delete responseHeaders[key];
      }
    }
    if (
      u.includes('pelisjuanita.com') ||
      u.includes('.m3u8') ||
      u.includes('.ts') ||
      u.includes('.mp4') ||
      u.includes('.vtt') ||
      u.includes('.srt') ||
      u.includes('workers.dev')
    ) {
      responseHeaders['Access-Control-Allow-Origin'] = ['*'];
      responseHeaders['Access-Control-Allow-Headers'] = ['*'];
      responseHeaders['Access-Control-Allow-Methods'] = ['GET, POST, OPTIONS'];
    }
    callback({ responseHeaders });
  });

  // 4. Higiene automática de caché en segundo plano (sin bloquear arranque)
  setTimeout(() => {
    session.defaultSession
      .getCacheSize()
      .then((size) => {
        if (size > MAX_CACHE_BYTES) {
          return session.defaultSession.clearCache();
        }
      })
      .catch(() => {});
  }, 6000);
}

/* ============================================================================
 * 3. CANALES IPC VALIDADOS (SIN LISTENERS DUPLICADOS)
 * ============================================================================ */
function registerIpcHandlers() {
  const channels = [
    'ctv:toggle-fullscreen',
    'ctv:set-fullscreen',
    'ctv:is-fullscreen',
    'ctv:get-runtime-info',
    'ctv:clear-cache',
    'ctv:self-update',
    'ctv:self-update-status',
    'ctv:load-persistent-state',
    'ctv:save-persistent-state'
  ];
  channels.forEach((ch) => {
    try { ipcMain.removeHandler(ch); } catch {}
  });

  ipcMain.handle('ctv:toggle-fullscreen', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return false;
    const next = !mainWindow.isFullScreen();
    mainWindow.setFullScreen(next);
    return next;
  });

  ipcMain.handle('ctv:set-fullscreen', (_event, enabled) => {
    if (!mainWindow || mainWindow.isDestroyed()) return false;
    const next = Boolean(enabled);
    if (mainWindow.isFullScreen() !== next) {
      mainWindow.setFullScreen(next);
    }
    return next;
  });

  ipcMain.handle('ctv:is-fullscreen', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return false;
    return mainWindow.isFullScreen();
  });

  ipcMain.handle('ctv:get-runtime-info', () => ({
    appVersion: APP_VERSION,
    version: APP_VERSION,
    electronVersion: process.versions.electron || '',
    platform: process.platform,
    arch: process.arch,
    isPackaged: app.isPackaged,
    userDataPath: app.getPath('userData')
  }));

  ipcMain.handle('ctv:load-persistent-state', () => readPersistentState());

  ipcMain.handle('ctv:save-persistent-state', (_event, patch) => {
    if (!patch || typeof patch !== 'object') return readPersistentState();
    return writePersistentStateAtomic(patch);
  });

  ipcMain.handle('ctv:clear-cache', async () => {
    try {
      await session.defaultSession.clearCache();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String((err && err.message) || err) };
    }
  });

  ipcMain.handle('ctv:self-update', (_event, downloadUrl) => {
    if (!isAllowedUpdateUrl(downloadUrl)) {
      return { ok: false, error: 'URL de actualización no permitida' };
    }
    const state = startDesktopSelfUpdate(downloadUrl);
    return { ok: state.state !== 'error', state };
  });

  ipcMain.handle('ctv:self-update-status', () => selfUpdateState);
}

/* ============================================================================
 * 4. VENTANA PRINCIPAL (ZERO-FLICKER) Y CICLO DE VIDA
 * ============================================================================ */
async function createWindow() {
  configureSessionSecurityAndAdblock();
  registerIpcHandlers();
  const appUrl = await startLocalServer(path.join(__dirname, 'src'));

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 320,
    minHeight: 300,
    show: false, // Evita parpadeo blanco/negro hasta que el primer frame esté pintado
    title: 'CTV',
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    fullscreenable: true,
    icon: path.join(__dirname, 'build', 'icons', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      additionalArguments: [`--ctv-app-version=${APP_VERSION}`],
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      allowRunningInsecureContent: true,
      spellcheck: false,
      backgroundThrottling: true
    }
  });

  mainWindow.setMenuBarVisibility(false);

  let shown = false;
  const revealWindow = () => {
    if (shown || !mainWindow || mainWindow.isDestroyed()) return;
    shown = true;
    if (process.env.CTV_HEADLESS_QA === '1') return;
    mainWindow.show();
    mainWindow.focus();
  };

  mainWindow.once('ready-to-show', revealWindow);
  const revealFallbackTimer = setTimeout(revealWindow, 2500);

  // Toggle fullscreen with F11 or Alt+Enter, and intercept Back/Escape before cross-origin iframes capture focus
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown') {
      if (input.key === 'F11' || (input.alt && input.key === 'Enter')) {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.setFullScreen(!mainWindow.isFullScreen());
        }
        event.preventDefault();
        return;
      }
      if (
        input.key === 'Escape' ||
        input.key === 'BrowserBack' ||
        input.key === 'GoBack' ||
        (input.alt && input.key === 'ArrowLeft')
      ) {
        if (mainWindow && !mainWindow.isDestroyed()) {
          const wasFullscreen = Boolean(mainWindow.isFullScreen());
          if (input.key === 'Escape' && wasFullscreen) {
            mainWindow.setFullScreen(false);
          }
          mainWindow.webContents.send('ctv:player-escape', {
            key: input.key,
            isFullscreen: wasFullscreen,
            exitedFullscreen: Boolean(input.key === 'Escape' && wasFullscreen)
          });
        }
      }
    }
  });

  // Notify renderer when a non-ad embed subframe fails to load (enables instant Desktop iframe failover)
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (
      !isMainFrame &&
      errorCode !== -3 &&
      typeof validatedURL === 'string' &&
      validatedURL.startsWith('http') &&
      !isAdUrl(validatedURL)
    ) {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('ctv:subframe-load-error', {
          url: String(validatedURL || ''),
          errorCode: Number(errorCode) || 0,
          errorDescription: String(errorDescription || '')
        });
      }
    }
  });

  // Block popup windows from embed servers, but allow GitHub release downloads in external browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (
      url &&
      (url.startsWith('https://github.com/Demon11701/CTV-Desktop/') ||
        url.includes('githubusercontent.com'))
    ) {
      shell.openExternal(url).catch(() => {});
    }
    return { action: 'deny' };
  });

  // Prevent main window from being redirected away from the local app
  mainWindow.webContents.on('will-navigate', (event, url) => {
    try {
      const parsed = new URL(url);
      const isLocal =
        parsed.protocol === 'file:' ||
        parsed.hostname === '127.0.0.1' ||
        parsed.hostname === 'localhost';
      if (!isLocal) {
        event.preventDefault();
      }
    } catch {
      event.preventDefault();
    }
  });

  // Block ad-redirects inside embed iframes
  mainWindow.webContents.on('will-frame-navigate', (details) => {
    if (!details.isMainFrame && isAdUrl(details.url)) {
      details.preventDefault();
    }
  });

  // Inject cosmetic & video ad-blocker script into external HTTP(S) embed subframes (never into about:blank or destroyed frames)
  mainWindow.webContents.on('did-frame-finish-load', (_event, isMainFrame, frameProcessId, frameRoutingId) => {
    if (!isMainFrame) {
      try {
        const frame = webFrameMain.fromId(frameProcessId, frameRoutingId);
        if (
          frame &&
          !frame.isDestroyed() &&
          typeof frame.url === 'string' &&
          (frame.url.startsWith('https://') || frame.url.startsWith('http://')) &&
          !frame.url.startsWith('http://127.0.0.1')
        ) {
          frame.executeJavaScript(EMBED_ADBLOCK_SCRIPT).catch(() => {});
        }
      } catch {}
    }
  });

  // Observabilidad y auto-recuperación si un proceso renderer termina inesperadamente
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    const reason = (details && details.reason) || 'unknown';
    const exitCode = details && typeof details.exitCode === 'number' ? details.exitCode : -1;
    console.warn(`[CTV] render-process-gone: reason=${reason} exitCode=${exitCode}`);
    if (reason !== 'clean-exit' && mainWindow && !mainWindow.isDestroyed()) {
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.loadURL(appUrl).catch(() => {});
        }
      }, 300);
    }
  });

  mainWindow.loadURL(appUrl);

  mainWindow.on('closed', () => {
    clearTimeout(revealFallbackTimer);
    mainWindow = null;
  });
}

function cleanupResources() {
  if (localServer) {
    try {
      localServer.close();
    } catch {}
    localServer = null;
  }
  // Asegurar que no queden ventanas secundarias huérfanas
  try {
    BrowserWindow.getAllWindows().forEach((win) => {
      if (win && !win.isDestroyed()) {
        try { win.destroy(); } catch {}
      }
    });
  } catch {}
}

if (gotSingleInstanceLock) {
  app.on('second-instance', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });

  app.on('before-quit', () => {
    if (localServer) {
      try { localServer.close(); } catch {}
      localServer = null;
    }
  });

  app.windowAllClosedHandler = () => {
    cleanupResources();
    if (process.platform !== 'darwin') {
      app.quit();
    }
  };

  app.on('window-all-closed', app.windowAllClosedHandler);
}
