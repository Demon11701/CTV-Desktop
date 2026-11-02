const { app, BrowserWindow, session } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');

const USER_AGENT =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Mobile Safari/537.36';

app.userAgentFallback = USER_AGENT;

// Detect Linux / Wayland (e.g., Hyprland, Sway, GNOME/KDE Wayland) and enable Ozone + VA-API hardware acceleration
const isLinux = process.platform === 'linux';
if (isLinux) {
  app.commandLine.appendSwitch('enable-features', 'UseOzonePlatform,VaapiVideoDecodeLinuxGL');
  app.commandLine.appendSwitch('ozone-platform-hint', 'auto');
  app.commandLine.appendSwitch('ignore-gpu-blocklist');
  app.commandLine.appendSwitch('enable-gpu-rasterization');
}

// Allow autoplay without user gesture for seamless channel/stream playback
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

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

// Comprehensive list of ad/popunder/tracker domains (from CTV.apk + streaming embed ad networks)
const AD_DOMAINS = [
  '33across.com',
  'a-ads.com',
  'acscdn.com',
  'ad-maven.com',
  'adcash.com',
  'adform.net',
  'admaven.com',
  'adnxs.com',
  'adsafeprotected.com',
  'adsco.re',
  'adservice.google.com',
  'adskeeper.com',
  'adspyglass.com',
  'adsrvr.org',
  'adsterra.com',
  'adtng.com',
  'adxxx.com',
  'amazon-adsystem.com',
  'bet365.com',
  '1xbet.com',
  'bidgear.com',
  'bidvertiser.com',
  'bongacams.com',
  'casalemedia.com',
  'chaturbate.com',
  'clickadu.com',
  'clickadu.net',
  'connatix.com',
  'cpmrevenuegate.com',
  'criteo.com',
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
  'googleadservices.com',
  'googlesyndication.com',
  'highperformanceformat.com',
  'highrevenuegate.com',
  'hilltopads.com',
  'hilltopads.net',
  'histats.com',
  'juicyads.com',
  'livejasmin.com',
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
  'plugrush.com',
  'popads.com',
  'popads.net',
  'popcash.net',
  'popunderjs.com',
  'profitableratecpm.com',
  'propellerads.com',
  'pubmatic.com',
  'pushame.com',
  'realsrv.com',
  'revcontent.com',
  'richpush.co',
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
  'vidoomy.com',
  'wpadmngr.com',
  'yllix.com'
];

const AD_PATH_PATTERNS = [
  /\/pop(?:under)?\.js(\?|$)/i,
  /\/ad(?:s|server|manager|vast)?\.js(\?|$)/i,
  /\/vast\.xml(\?|$)/i,
  /\/nativeads\//i,
  /\/popunder\//i
];

function isAdUrl(rawUrl) {
  if (!rawUrl || rawUrl.startsWith('http://127.0.0.1') || rawUrl.startsWith('blob:') || rawUrl.startsWith('data:')) {
    return false;
  }
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase();
    for (let i = 0; i < AD_DOMAINS.length; i++) {
      const d = AD_DOMAINS[i];
      if (host === d || host.endsWith('.' + d)) {
        return true;
      }
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

// In-frame cosmetic & scriptlet ad-shield (extracted from CTV.apk + overlay killer)
const EMBED_ADBLOCK_SCRIPT = `
(function() {
  if (window.__pjAd) return;
  window.__pjAd = 1;
  try {
    window.open = function() { return null; };
    Object.defineProperty(window, 'open', { value: function() { return null; }, writable: false, configurable: false });
  } catch (e) {}

  function cleanOverlaysAndSkipAds() {
    try {
      var d = document;
      // 1. Remove invisible click-hijack overlays and ad iframes/anchors
      var candidates = d.querySelectorAll('a[target="_blank"], div, ins, iframe');
      for (var j = 0; j < candidates.length; j++) {
        var el = candidates[j];
        try {
          if (el.tagName === 'VIDEO' || el.querySelector('video')) continue;
          var style = window.getComputedStyle(el);
          var z = parseInt(style.zIndex, 10) || 0;
          var pos = style.position;
          if ((pos === 'fixed' || pos === 'absolute') && z > 9999) {
            var rect = el.getBoundingClientRect();
            if (rect.width >= window.innerWidth * 0.7 && rect.height >= window.innerHeight * 0.7) {
              var op = parseFloat(style.opacity);
              var bg = style.backgroundColor || '';
              if (el.tagName === 'A' || op < 0.15 || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') {
                el.remove();
                continue;
              }
            }
          }
          if (el.tagName === 'A' && el.target === '_blank' && (pos === 'fixed' || pos === 'absolute')) {
            el.remove();
          }
        } catch (e2) {}
      }

      // 2. Skip in-stream video ads automatically
      var vs = d.querySelectorAll('video'), ad = false;
      if (vs.length) {
        var b = d.body, t = b ? (b.innerText || '').toLowerCase() : '';
        ad = (t.indexOf('anuncio') >= 0 && (t.indexOf('saltar') >= 0 || t.indexOf('terminar') >= 0)) ||
             (t.indexOf('skip ad') >= 0);
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
    } catch (e) {}
  }

  setInterval(cleanOverlaysAndSkipAds, 600);
  cleanOverlaysAndSkipAds();
})();
`;

let mainWindow = null;
let localServer = null;

function startLocalServer(rootDir) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      try {
        const parsedUrl = new URL(req.url, 'http://127.0.0.1');
        let pathname = decodeURIComponent(parsedUrl.pathname);
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
          res.writeHead(200, {
            'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
            'Access-Control-Allow-Origin': '*'
          });
          res.end(data);
        });
      } catch {
        res.writeHead(500);
        res.end('Internal Server Error');
      }
    });

    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      localServer = server;
      resolve(`http://127.0.0.1:${port}/index.html`);
    });
  });
}

function configureSessionSecurityAndAdblock() {
  // 1. Network-level Ad & Popunder Blocker
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    if (isAdUrl(details.url)) {
      callback({ cancel: true });
      return;
    }
    callback({ cancel: false });
  });

  // 2. Clean Mobile User-Agent & Header Normalizer
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    const headers = { ...details.requestHeaders };
    headers['User-Agent'] = USER_AGENT;

    // Strip Chromium/Electron Client Hints and local Origin/Referer so Cloudflare & CDNs do not block requests
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

    callback({ requestHeaders: headers });
  });
}

async function createWindow() {
  configureSessionSecurityAndAdblock();
  const appUrl = await startLocalServer(path.join(__dirname, 'src'));

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 800,
    minHeight: 450,
    title: 'CTV',
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    fullscreenable: true,
    icon: path.join(__dirname, 'build', 'icons', 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      allowRunningInsecureContent: true,
      spellcheck: false
    }
  });

  mainWindow.setMenuBarVisibility(false);

  // Toggle fullscreen with F11 or Alt+Enter
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown') {
      if (input.key === 'F11' || (input.alt && input.key === 'Enter')) {
        mainWindow.setFullScreen(!mainWindow.isFullScreen());
        event.preventDefault();
      }
    }
  });

  // Block all popup windows from embed servers
  mainWindow.webContents.setWindowOpenHandler(() => {
    return { action: 'deny' };
  });

  // Prevent main window from being redirected away from the local app
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('http://127.0.0.1')) {
      event.preventDefault();
    }
  });

  // Block ad-redirects inside embed iframes
  mainWindow.webContents.on('will-frame-navigate', (details) => {
    if (!details.isMainFrame && isAdUrl(details.url)) {
      details.preventDefault();
    }
  });

  // Inject cosmetic & video ad-blocker script into every embed subframe
  mainWindow.webContents.on('did-frame-finish-load', (event, isMainFrame, frameProcessId, frameRoutingId) => {
    if (!isMainFrame) {
      try {
        const { webFrameMain } = require('electron');
        const frame = webFrameMain.fromId(frameProcessId, frameRoutingId);
        if (frame && !frame.url.startsWith('http://127.0.0.1')) {
          frame.executeJavaScript(EMBED_ADBLOCK_SCRIPT).catch(() => {});
        }
      } catch {}
    }
  });

  mainWindow.loadURL(appUrl);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (localServer) {
    try {
      localServer.close();
    } catch {}
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
