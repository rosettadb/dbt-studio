import { app, BrowserWindow } from 'electron';
import path from 'path';
import fs from 'fs';

export const createSplashWindow = (): BrowserWindow => {
  const RESOURCES_PATH = app.isPackaged
    ? path.join(process.resourcesPath, 'assets')
    : path.join(__dirname, '../../assets');

  // Get version using Electron's built-in method
  const version = app.getVersion();

  const splashWindow = new BrowserWindow({
    width: 400,
    height: 400,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  const logoPath = path.join(RESOURCES_PATH, 'logo_new.png');
  const logoData = fs.readFileSync(logoPath);
  const encodedLogo = logoData.toString('base64');
  const logoSrc = `data:image/png;base64,${encodedLogo}`;

  const splashHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body {
            margin: 0;
            padding: 0;
            font-family: Arial, sans-serif;
            background: white;
          }
          .container {
            position: fixed;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            inset: 0;
            pointer-events: none;
          }
          .image {
            height: 120px;
          }
          .tagline {
            font-size: 14px;
            margin-top: 16px;
            text-align: center;
            max-width: 300px;
            line-height: 1.4;
            font-weight: 400;
            color: #333333;
          }
          .loading-spinner {
            width: 40px;
            height: 40px;
            border: 4px solid rgba(112, 12, 156, 0.2);
            border-radius: 50%;
            border-top-color: #700c9c;
            animation: spin 1s ease-in-out infinite;
            margin-top: 20px;
          }
          .loaderMessage {
            position: absolute;
            bottom: 50px;
            font-size: 12px;
            font-weight: 400;
            color: #700c9c;
          }
          .version {
            position: absolute;
            bottom: 20px;
            font-size: 12px;
            font-weight: 500;
            color: #999999;
          }
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <img src="${logoSrc}" class="image" alt="Logo" />
          <div class="tagline"></div>
          <div class="loading-spinner"></div>
          <div id="loaderMessage" class="loaderMessage">Loading...</div>
          <div class="version">v${version}</div>
        </div>
        <script>
          window.updateLoaderMessage = (message) => {
            const loader = document.getElementById('loaderMessage');
            if (loader) {
              loader.textContent = message;
            }
          };
        </script>
      </body>
    </html>
  `;

  splashWindow.loadURL(
    `data:text/html;charset=UTF-8,${encodeURIComponent(splashHtml)}`,
  );

  return splashWindow;
};
