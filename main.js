const { app, BrowserWindow, session, shell } = require('electron');
const path = require('path');
const http = require('http');
const https = require('https');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

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
  'kadam.net',
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

const AD_PATH_PATTERNS = [
  /\/pop(?:under|up)?\.js(\?|$)/i,
  /\/ad(?:s|server|manager|vast|block|loader)?\.js(\?|$)/i,
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

// In-frame cosmetic & scriptlet ad-shield (extracted from CTV.apk + aggressive click-hijack killer)
const EMBED_ADBLOCK_SCRIPT = `
(function() {
  if (window.__pjAd) return;
  window.__pjAd = 1;
  try {
    const noop = function() { return null; };
    window.open = noop;
    Object.defineProperty(window, 'open', { value: noop, writable: false, configurable: false });
    window.alert = function() {};
    window.confirm = function() { return false; };
    window.prompt = function() { return null; };
  } catch (e) {}

  // Intercept window-level click-hijackers that try to open popups on first click
  try {
    window.addEventListener('click', function(ev) {
      var t = ev.target;
      if (t && t.closest) {
        var a = t.closest('a');
        if (a && (a.target === '_blank' || (a.href && !a.href.startsWith('javascript:') && a.hostname !== location.hostname))) {
          ev.stopImmediatePropagation();
          ev.preventDefault();
          a.remove();
        }
      }
    }, true);
  } catch (e) {}

  function cleanOverlaysAndSkipAds() {
    try {
      var d = document;
      // 1. Remove invisible click-hijack overlays and ad iframes/anchors
      var candidates = d.querySelectorAll('a[target="_blank"], div, ins, iframe, aside');
      for (var j = 0; j < candidates.length; j++) {
        var el = candidates[j];
        try {
          if (el.tagName === 'VIDEO' || el.querySelector('video') || el.id === 'player') continue;
          var style = window.getComputedStyle(el);
          var z = parseInt(style.zIndex, 10) || 0;
          var pos = style.position;
          if ((pos === 'fixed' || pos === 'absolute') && z > 900) {
            var rect = el.getBoundingClientRect();
            if (rect.width >= window.innerWidth * 0.65 && rect.height >= window.innerHeight * 0.65) {
              var op = parseFloat(style.opacity);
              var bg = style.backgroundColor || '';
              if (el.tagName === 'A' || el.tagName === 'IFRAME' || op < 0.2 || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') {
                el.remove();
                continue;
              }
            }
          }
          if (el.tagName === 'A' && (el.target === '_blank' || pos === 'fixed' || pos === 'absolute') && z > 10) {
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
    } catch (e) {}
  }

  setInterval(cleanOverlaysAndSkipAds, 500);
  cleanOverlaysAndSkipAds();
})();
`;

let mainWindow = null;
let localServer = null;
let selfUpdateState = { state: 'idle', percent: 0, error: '' };

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
    req.on('error', (err) => {
      try { fs.unlinkSync(destPath); } catch {}
      reject(err);
    });
  });
}

function startDesktopSelfUpdate(downloadUrl) {
  if (selfUpdateState.state === 'downloading') return;
  const targetExe = getSelfExecutablePath();
  if (!targetExe) {
    selfUpdateState = { state: 'error', percent: 0, error: 'Modo desarrollo (sin ejecutable empaquetado)' };
    return;
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
}

function proxyFetchRequest(targetUrl, options = {}, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 6) {
      reject(new Error('Too many redirects'));
      return;
    }
    try {
      const parsed = new URL(targetUrl);
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
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            const body = Buffer.concat(chunks).toString('utf-8');
            resolve({
              status: res.statusCode || 200,
              finalUrl: targetUrl,
              contentType: res.headers['content-type'] || 'text/plain; charset=utf-8',
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
  return new Promise((resolve) => {
    const server = http.createServer(async (req, res) => {
      try {
        const parsedUrl = new URL(req.url, 'http://127.0.0.1');
        let pathname = decodeURIComponent(parsedUrl.pathname);

        // Local proxy endpoint for Referer-protected embeds & stream extractors (e.g. seriesplayer.fortamomar.workers.dev)
        if (pathname === '/__ctv_self_update') {
          const dlUrl = parsedUrl.searchParams.get('url');
          if (!dlUrl) {
            res.writeHead(400, { 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ ok: false, error: 'Missing url' }));
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

  // 2. Clean Mobile User-Agent & Referer Spoofing for PelisJuanita / SeriesPlayer
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    const headers = { ...details.requestHeaders };
    headers['User-Agent'] = USER_AGENT;

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

  // 3. Relax X-Frame-Options & ensure CORS for video streams and subtitle tracks
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = { ...(details.responseHeaders || {}) };
    for (const key of Object.keys(responseHeaders)) {
      const lower = key.toLowerCase();
      if (lower === 'x-frame-options') {
        delete responseHeaders[key];
      } else if (lower === 'content-security-policy') {
        responseHeaders[key] = responseHeaders[key].map((v) =>
          v.replace(/frame-ancestors[^;]*;?/gi, '')
        );
      }
    }
    const u = (details.url || '').toLowerCase();
    if (u.includes('.m3u8') || u.includes('.ts') || u.includes('.vtt') || u.includes('.srt') || u.includes('workers.dev')) {
      responseHeaders['Access-Control-Allow-Origin'] = ['*'];
    }
    callback({ responseHeaders });
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

app.windowAllClosedHandler = () => {
  if (localServer) {
    try {
      localServer.close();
    } catch {}
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
};

app.on('window-all-closed', app.windowAllClosedHandler);
