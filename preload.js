/**
 * CTV Desktop Preload (Electron contextBridge)
 * Exposes a strictly scoped, validated IPC API on window.DesktopBridge
 * without enabling nodeIntegration in the renderer.
 */
const { contextBridge, ipcRenderer } = require('electron');

const ALLOWED_UPDATE_PREFIXES = [
  'https://github.com/Demon11701/CTV-Desktop/',
  'https://objects.githubusercontent.com/',
  'https://release-assets.githubusercontent.com/'
];

function isValidUpdateUrl(url) {
  if (typeof url !== 'string' || !url) return false;
  return ALLOWED_UPDATE_PREFIXES.some((prefix) => url.startsWith(prefix));
}

function resolveAppVersionFromArgs() {
  const eVer = (process.versions && process.versions.electron) || '';
  try {
    const arg = (process.argv || []).find((a) => typeof a === 'string' && a.startsWith('--ctv-app-version='));
    if (arg) {
      const val = (arg.split('=')[1] || '').trim();
      if (val && val !== eVer) return val;
    }
  } catch {}
  return '1.6.2';
}

const APP_VERSION = resolveAppVersionFromArgs();
const ELECTRON_VERSION = (process.versions && process.versions.electron) || '';

contextBridge.exposeInMainWorld('DesktopBridge', Object.freeze({
  isDesktop: true,
  platform: process.platform,
  appVersion: APP_VERSION,
  electronVersion: ELECTRON_VERSION,
  toggleFullscreen: () => ipcRenderer.invoke('ctv:toggle-fullscreen'),
  setFullscreen: (enabled) => ipcRenderer.invoke('ctv:set-fullscreen', Boolean(enabled)),
  isFullscreen: () => ipcRenderer.invoke('ctv:is-fullscreen'),
  getRuntimeInfo: () => ipcRenderer.invoke('ctv:get-runtime-info'),
  clearCache: () => ipcRenderer.invoke('ctv:clear-cache'),
  loadPersistentState: () => ipcRenderer.invoke('ctv:load-persistent-state'),
  savePersistentState: (patch) => {
    if (!patch || typeof patch !== 'object') return Promise.resolve(null);
    return ipcRenderer.invoke('ctv:save-persistent-state', patch);
  },
  startSelfUpdate: (downloadUrl) => {
    if (!isValidUpdateUrl(downloadUrl)) {
      return Promise.resolve({ ok: false, error: 'URL de actualización no permitida' });
    }
    return ipcRenderer.invoke('ctv:self-update', downloadUrl);
  },
  getSelfUpdateStatus: () => ipcRenderer.invoke('ctv:self-update-status'),
  onPlayerEscape: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const handler = (_ev, payload) => callback(payload || {});
    ipcRenderer.on('ctv:player-escape', handler);
    return () => ipcRenderer.removeListener('ctv:player-escape', handler);
  },
  onSubframeError: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const handler = (_ev, payload) => callback(payload || {});
    ipcRenderer.on('ctv:subframe-load-error', handler);
    return () => ipcRenderer.removeListener('ctv:subframe-load-error', handler);
  },
  setActiveEmbedHost: (host) => ipcRenderer.invoke('ctv:set-active-embed-host', String(host || '')),
  bypassAdShieldForHost: (host) => ipcRenderer.invoke('ctv:ad-shield-bypass-host', String(host || '')),
  onAdShieldEvent: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const handler = (_ev, payload) => callback(payload || {});
    ipcRenderer.on('ctv:ad-shield-event', handler);
    return () => ipcRenderer.removeListener('ctv:ad-shield-event', handler);
  }
}));
