const { app, BrowserWindow, session } = require('electron');
const path = require('path');

// Detect Linux / Wayland (e.g., Hyprland, Sway, GNOME/KDE Wayland) and enable Ozone + VA-API hardware acceleration
const isLinux = process.platform === 'linux';
const isWayland = isLinux && (
  Boolean(process.env.WAYLAND_DISPLAY) ||
  process.env.XDG_SESSION_TYPE === 'wayland' ||
  Boolean(process.env.HYPRLAND_INSTANCE_SIGNATURE)
);

if (isLinux) {
  app.commandLine.appendSwitch('enable-features', 'UseOzonePlatform,VaapiVideoDecodeLinuxGL');
  app.commandLine.appendSwitch('ozone-platform-hint', 'auto');
  if (isWayland) {
    app.commandLine.appendSwitch('ozone-platform', 'wayland');
  }
  app.commandLine.appendSwitch('ignore-gpu-blocklist');
  app.commandLine.appendSwitch('enable-gpu-rasterization');
}

// Allow autoplay without user gesture for seamless channel/stream playback
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

let mainWindow = null;

function createWindow() {
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

  // Prevent popups from ad scripts inside embed iframes while allowing legitimate player navigation
  mainWindow.webContents.setWindowOpenHandler(() => {
    return { action: 'deny' };
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

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
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
