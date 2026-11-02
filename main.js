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

function configureSessionHeaders() {
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
  configureSessionHeaders();
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

  // Prevent popups from ad scripts inside embed iframes
  mainWindow.webContents.setWindowOpenHandler(() => {
    return { action: 'deny' };
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
