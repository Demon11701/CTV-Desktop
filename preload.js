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

contextBridge.exposeInMainWorld('DesktopBridge', Object.freeze({
  isDesktop: true,
  platform: process.platform,
  toggleFullscreen: () => ipcRenderer.invoke('ctv:toggle-fullscreen'),
  setFullscreen: (enabled) => ipcRenderer.invoke('ctv:set-fullscreen', Boolean(enabled)),
  isFullscreen: () => ipcRenderer.invoke('ctv:is-fullscreen'),
  getRuntimeInfo: () => ipcRenderer.invoke('ctv:get-runtime-info'),
  clearCache: () => ipcRenderer.invoke('ctv:clear-cache'),
  startSelfUpdate: (downloadUrl) => {
    if (!isValidUpdateUrl(downloadUrl)) {
      return Promise.resolve({ ok: false, error: 'URL de actualización no permitida' });
    }
    return ipcRenderer.invoke('ctv:self-update', downloadUrl);
  },
  getSelfUpdateStatus: () => ipcRenderer.invoke('ctv:self-update-status')
}));
