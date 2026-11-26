'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const os = require('os');
const { spawn } = require('child_process');

let electronApp = null;
try {
  const electronMod = require('electron');
  if (electronMod && typeof electronMod === 'object' && electronMod.app) {
    electronApp = electronMod.app;
  }
} catch {}

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';

const ALLOWED_UPDATE_PREFIXES = [
  'https://github.com/Demon11701/CTV-Desktop/',
  'https://objects.githubusercontent.com/',
  'https://release-assets.githubusercontent.com/'
];

let selfUpdateState = { state: 'idle', percent: 0, error: '' };

function isAllowedUpdateUrl(url) {
  return typeof url === 'string' && ALLOWED_UPDATE_PREFIXES.some((p) => url.startsWith(p));
}

function getSelfExecutablePath(appRef = electronApp) {
  if (process.env.APPIMAGE) return process.env.APPIMAGE;
  if (process.env.PORTABLE_EXECUTABLE_FILE) return process.env.PORTABLE_EXECUTABLE_FILE;
  if (appRef && appRef.isPackaged) return process.execPath;
  return '';
}

function getSelfUpdateStatus() {
  return { ...selfUpdateState };
}

function downloadFileWithProgress(url, destPath, onProgress, redirectCount = 0, opts = {}) {
  const userAgent = opts.userAgent || DEFAULT_USER_AGENT;
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
        headers: { 'User-Agent': userAgent, Accept: '*/*' },
        timeout: 30000
      },
      (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          const nextUrl = new URL(res.headers.location, url).toString();
          res.resume();
          downloadFileWithProgress(nextUrl, destPath, onProgress, redirectCount + 1, opts)
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

function startDesktopSelfUpdate(downloadUrl, opts = {}) {
  const appRef = opts.app || electronApp;
  if (!isAllowedUpdateUrl(downloadUrl)) {
    selfUpdateState = { state: 'error', percent: 0, error: 'URL de actualización no permitida' };
    return getSelfUpdateStatus();
  }
  if (selfUpdateState.state === 'downloading') return getSelfUpdateStatus();
  const targetExe = typeof opts.getExePath === 'function' ? opts.getExePath() : getSelfExecutablePath(appRef);
  if (!targetExe) {
    selfUpdateState = { state: 'error', percent: 0, error: 'Modo desarrollo (sin ejecutable empaquetado)' };
    return getSelfUpdateStatus();
  }

  const tempFile = targetExe + '.update-tmp';
  selfUpdateState = { state: 'downloading', percent: 1, error: '' };

  downloadFileWithProgress(
    downloadUrl,
    tempFile,
    (pct) => {
      selfUpdateState.percent = pct;
    },
    0,
    { userAgent: opts.userAgent || DEFAULT_USER_AGENT }
  )
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
        setTimeout(() => { if (appRef) appRef.quit(); }, 400);
      } else {
        fs.chmodSync(tempFile, 0o755);
        fs.renameSync(tempFile, targetExe);
        spawn(targetExe, [], {
          detached: true,
          stdio: 'ignore'
        }).unref();
        setTimeout(() => { if (appRef) appRef.quit(); }, 400);
      }
    })
    .catch((err) => {
      selfUpdateState = {
        state: 'error',
        percent: 0,
        error: String((err && err.message) || err)
      };
    });

  return getSelfUpdateStatus();
}

function handleSelfUpdateRequest(parsedUrl, res, opts = {}) {
  const dlUrl = parsedUrl.searchParams.get('url');
  if (!dlUrl || !isAllowedUpdateUrl(dlUrl)) {
    res.writeHead(400, { 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ ok: false, error: 'URL inválida o no permitida' }));
    return;
  }
  const state = startDesktopSelfUpdate(dlUrl, opts);
  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify({ ok: true, state }));
}

function handleSelfUpdateStatusRequest(res) {
  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(getSelfUpdateStatus()));
}

module.exports = {
  ALLOWED_UPDATE_PREFIXES,
  isAllowedUpdateUrl,
  getSelfExecutablePath,
  getSelfUpdateStatus,
  downloadFileWithProgress,
  startDesktopSelfUpdate,
  handleSelfUpdateRequest,
  handleSelfUpdateStatusRequest
};
