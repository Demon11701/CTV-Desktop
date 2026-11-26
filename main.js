'use strict';

const { app, BrowserWindow, session, shell, ipcMain, webFrameMain } = require('electron');
const path = require('path');
const fs = require('fs');

const persistence = require('./electron/persistence');
const adblock = require('./electron/adblock');
const updater = require('./electron/updater');
const windowManager = require('./electron/window');
const ipc = require('./electron/ipc');

function resolvePackageAppVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf-8'));
    if (pkg && typeof pkg.version === 'string' && pkg.version.trim()) {
      return pkg.version.trim();
    }
  } catch {}
  const v = app && typeof app.getVersion === 'function' ? app.getVersion() : '';
  return v && v !== (process.versions && process.versions.electron) ? v : '1.6.2';
}

const APP_VERSION = resolvePackageAppVersion();
persistence.configureStableUserDataPath(app);
persistence.cleanupOrphanedStateTempFiles();
if (app) {
  app.userAgentFallback = windowManager.USER_AGENT;
}
windowManager.configureHardwareAcceleration(app);

const gotSingleInstanceLock = app && typeof app.requestSingleInstanceLock === 'function'
  ? app.requestSingleInstanceLock()
  : true;

if (!gotSingleInstanceLock && app) {
  app.quit();
}

function openMainWindow() {
  return windowManager.createMainWindow({
    app,
    BrowserWindow,
    session,
    shell,
    ipcMain,
    webFrameMain,
    rootDir: path.join(__dirname, 'src'),
    baseDir: __dirname,
    appVersion: APP_VERSION,
    persistence,
    adblock,
    updater,
    ipc
  });
}

if (gotSingleInstanceLock && app) {
  app.on('second-instance', () => {
    const win = windowManager.getMainWindow();
    if (win && !win.isDestroyed()) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    openMainWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        openMainWindow();
      }
    });
  });

  app.on('before-quit', () => {
    windowManager.stopLocalServer();
  });

  app.windowAllClosedHandler = () => {
    windowManager.cleanupResources(BrowserWindow);
    if (process.platform !== 'darwin') {
      app.quit();
    }
  };

  app.on('window-all-closed', app.windowAllClosedHandler);
}
