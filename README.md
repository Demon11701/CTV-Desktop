# CTV Desktop

Aplicación de escritorio multiplataforma (Linux Wayland/Hyprland/X11 y Windows x64) basada en Electron.

## Características
- **Soporte nativo para Linux (Wayland / Hyprland / X11)** con aceleración por hardware (`UseOzonePlatform,VaapiVideoDecodeLinuxGL`).
- **Reproductor HTML5 + HLS.js / Shaka Player** integrado con puente de escritorio (`desktop-bridge.js`).
- **Modo pantalla completa** (`F11` o `Alt + Enter`).

## Desarrollo y Compilación

```bash
# Instalar dependencias
npm install

# Ejecutar en modo desarrollo
npm start

# Compilar para Linux (AppImage + dir) y Windows (Portable .exe)
npm run build
```
