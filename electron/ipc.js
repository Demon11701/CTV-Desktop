'use strict';

const IPC_CHANNELS = [
  'ctv:toggle-fullscreen',
  'ctv:set-fullscreen',
  'ctv:is-fullscreen',
  'ctv:get-runtime-info',
  'ctv:clear-cache',
  'ctv:self-update',
  'ctv:self-update-status',
  'ctv:load-persistent-state',
  'ctv:save-persistent-state',
  'ctv:set-active-embed-host',
  'ctv:ad-shield-bypass-host'
];

function registerIpcHandlers({
  ipcMain,
  app,
  session,
  appVersion,
  getMainWindow,
  persistence,
  adblock,
  updater
}) {
  if (!ipcMain) return;

  IPC_CHANNELS.forEach((ch) => {
    try { ipcMain.removeHandler(ch); } catch {}
  });

  ipcMain.handle('ctv:toggle-fullscreen', () => {
    const win = getMainWindow();
    if (!win || win.isDestroyed()) return false;
    const next = !win.isFullScreen();
    win.setFullScreen(next);
    return next;
  });

  ipcMain.handle('ctv:set-fullscreen', (_event, enabled) => {
    const win = getMainWindow();
    if (!win || win.isDestroyed()) return false;
    const next = Boolean(enabled);
    if (win.isFullScreen() !== next) {
      win.setFullScreen(next);
    }
    return next;
  });

  ipcMain.handle('ctv:is-fullscreen', () => {
    const win = getMainWindow();
    if (!win || win.isDestroyed()) return false;
    return win.isFullScreen();
  });

  ipcMain.handle('ctv:get-runtime-info', () => ({
    appVersion,
    version: appVersion,
    electronVersion: (process.versions && process.versions.electron) || '',
    platform: process.platform,
    arch: process.arch,
    isPackaged: Boolean(app && app.isPackaged),
    userDataPath: app && typeof app.getPath === 'function' ? app.getPath('userData') : ''
  }));

  ipcMain.handle('ctv:load-persistent-state', () => persistence.readPersistentState());

  ipcMain.handle('ctv:save-persistent-state', (_event, patch) => {
    if (!patch || typeof patch !== 'object') return persistence.readPersistentState();
    return persistence.writePersistentStateAtomic(patch);
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
    if (!updater.isAllowedUpdateUrl(downloadUrl)) {
      return { ok: false, error: 'URL de actualización no permitida' };
    }
    const state = updater.startDesktopSelfUpdate(downloadUrl, { app });
    return { ok: state.state !== 'error', state };
  });

  ipcMain.handle('ctv:self-update-status', () => updater.getSelfUpdateStatus());

  ipcMain.handle('ctv:set-active-embed-host', (_event, host) => adblock.setActiveEmbedHost(host));

  ipcMain.handle('ctv:ad-shield-bypass-host', (_event, host) => adblock.addAdShieldBypassHost(host));
}

module.exports = {
  IPC_CHANNELS,
  registerIpcHandlers
};
