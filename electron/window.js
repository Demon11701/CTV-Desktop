'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const MOBILE_USER_AGENT =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';
const DESKTOP_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const USER_AGENT = MOBILE_USER_AGENT;

const MAX_CACHE_BYTES = 180 * 1024 * 1024;
const MAX_PROXY_BODY_BYTES = 15 * 1024 * 1024;
const PREFERRED_LOCAL_PORTS = [45780, 45781, 45782, 45783, 45784, 0];

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

let mainWindow = null;
let localServer = null;

function getMainWindow() {
  return mainWindow;
}

function configureHardwareAcceleration(app) {
  if (!app || !app.commandLine) return;
  const isLinux = process.platform === 'linux';
  const isWin = process.platform === 'win32';

  if (process.env.CTV_DISABLE_GPU === '1' && typeof app.disableHardwareAcceleration === 'function') {
    app.disableHardwareAcceleration();
  }

  app.commandLine.appendSwitch('disk-cache-size', String(MAX_CACHE_BYTES));
  app.commandLine.appendSwitch('media-cache-size', String(100 * 1024 * 1024));
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
        app.commandLine.appendSwitch('use-webgpu-adapter', 'opengles');
      }
      ['Vulkan', 'DefaultAngleVulkan', 'VulkanFromANGLE', 'VulkanV2'].forEach((f) => linuxDisabledSet.add(f));
      linuxEnabledSet.add('WaylandWindowDecorations');
    }
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
    app.commandLine.appendSwitch(
      'enable-features',
      'D3D11VideoDecoder,MediaFoundationD3D11VideoCapture,PlatformHEVCDecoderSupport,HardwareMediaKeyHandling'
    );
    app.commandLine.appendSwitch('enable-accelerated-video-decode');
  }
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
          if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
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

async function handleProxyEndpoint(req, res, parsedUrl) {
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
}

function startLocalServer(rootDir, { app, persistence, updater }) {
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
          persistence.handleStateEndpoint(req, res, {
            activePort: (addr && addr.port) || 45780,
            parsedUrl
          });
          return;
        }

        if (pathname === '/__ctv_self_update') {
          updater.handleSelfUpdateRequest(parsedUrl, res, { app, userAgent: USER_AGENT });
          return;
        }

        if (pathname === '/__ctv_self_update_status') {
          updater.handleSelfUpdateStatusRequest(res);
          return;
        }

        if (pathname === '/__ctv_proxy') {
          await handleProxyEndpoint(req, res, parsedUrl);
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

function stopLocalServer() {
  if (localServer) {
    try { localServer.close(); } catch {}
    localServer = null;
  }
}

async function createMainWindow({
  app,
  BrowserWindow,
  session,
  shell,
  ipcMain,
  webFrameMain,
  rootDir,
  baseDir,
  appVersion,
  persistence,
  adblock,
  updater,
  ipc
}) {
  adblock.configureSessionSecurityAndAdblock({
    session,
    mobileUserAgent: MOBILE_USER_AGENT,
    desktopUserAgent: DESKTOP_USER_AGENT,
    maxCacheBytes: MAX_CACHE_BYTES,
    getMainWindow
  });

  ipc.registerIpcHandlers({
    ipcMain,
    app,
    session,
    appVersion,
    getMainWindow,
    persistence,
    adblock,
    updater
  });

  const appUrl = await startLocalServer(rootDir, { app, persistence, updater });

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 320,
    minHeight: 300,
    show: false,
    title: 'CTV',
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    fullscreenable: true,
    icon: path.join(baseDir, 'build', 'icons', 'icon.png'),
    webPreferences: {
      preload: path.join(baseDir, 'preload.js'),
      additionalArguments: [`--ctv-app-version=${appVersion}`],
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

  // Fullscreen toggle + Back/Escape interception even when cross-origin iframes hold focus
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

  // Notify renderer when a non-ad embed subframe fails to load
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (
      !isMainFrame &&
      errorCode !== -3 &&
      typeof validatedURL === 'string' &&
      validatedURL.startsWith('http') &&
      !adblock.isStealthAdUrl(validatedURL)
    ) {
      const failedHost = adblock.normalizeEmbedHost(validatedURL);
      const activeHost = adblock.getActiveEmbedHost();
      const hostKey = activeHost || failedHost;
      const blockedCount =
        (hostKey && adblock.getBlockedCountForHost(hostKey)) ||
        (failedHost && adblock.getBlockedCountForHost(failedHost)) ||
        0;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('ctv:subframe-load-error', {
          url: String(validatedURL || ''),
          errorCode: Number(errorCode) || 0,
          errorDescription: String(errorDescription || ''),
          host: hostKey || '',
          blockedCount
        });
      }
    }
  });

  adblock.attachWindowStealthHandlers(mainWindow, { shell, webFrameMain });

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

  // Auto-recovery if renderer terminates unexpectedly
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

  return mainWindow;
}

function cleanupResources(BrowserWindow) {
  stopLocalServer();
  if (!BrowserWindow) return;
  try {
    BrowserWindow.getAllWindows().forEach((win) => {
      if (win && !win.isDestroyed()) {
        try { win.destroy(); } catch {}
      }
    });
  } catch {}
}

module.exports = {
  MOBILE_USER_AGENT,
  DESKTOP_USER_AGENT,
  USER_AGENT,
  MAX_CACHE_BYTES,
  MAX_PROXY_BODY_BYTES,
  PREFERRED_LOCAL_PORTS,
  MIME_TYPES,
  getMainWindow,
  configureHardwareAcceleration,
  proxyFetchRequest,
  startLocalServer,
  stopLocalServer,
  createMainWindow,
  cleanupResources
};
