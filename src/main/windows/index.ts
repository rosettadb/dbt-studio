import { BrowserWindow, app } from 'electron';
import { createSplashWindow } from './splash';
import { createMainWindow } from './main';
import registerHandlers from '../ipcSetup';
import { installExtensions } from '../utils/setupHelpers';
import { createSetupWindow } from './setup';

export class WindowManager {
  private splashWindow: BrowserWindow | null = null;

  private mainWindow: BrowserWindow | null = null;

  private setupWindow: BrowserWindow | null = null;

  private isQuitting = false;

  public async startApplication() {
    this.showSplashScreen();
    await this.initializeApp();
  }

  private showSplashScreen() {
    this.splashWindow = createSplashWindow();
  }

  // eslint-disable-next-line class-methods-use-this
  private async initializeApp() {
    if (
      process.env.NODE_ENV === 'development' ||
      process.env.DEBUG_PROD === 'true'
    ) {
      await installExtensions();
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 2000);
    });
  }

  public async showMainWindow() {
    this.mainWindow = createMainWindow(() => {
      this.mainWindow = null;
      if (!this.isQuitting) {
        app.quit();
      }
    });

    // Wait for the main window to be ready to show
    return new Promise<void>((resolve) => {
      if (!this.mainWindow) {
        resolve();
        return;
      }

      this.mainWindow.once('ready-to-show', () => {
        if (this.mainWindow) {
          this.mainWindow.show();
          this.mainWindow.focus();
        }
        resolve();
      });

      registerHandlers(this.mainWindow);
    });
  }

  public showSetupWindow() {
    if (this.setupWindow) {
      return new Promise<void>((resolve) => {
        resolve();
      });
    }

    this.setupWindow = createSetupWindow();
    registerHandlers(this.setupWindow);
    this.setupWindow.on('closed', () => {
      this.setupWindow = null;
      if (this.mainWindow) {
        this.mainWindow.reload();
        this.mainWindow.focus();
      }
    });

    return new Promise<void>((resolve) => {
      if (!this.setupWindow) {
        resolve();
        return;
      }

      this.setupWindow.once('ready-to-show', () => {
        if (this.setupWindow) {
          this.setupWindow.show();
          this.setupWindow.focus();
        }
        resolve();
      });
    });
  }

  public closeSetupWindow() {
    if (this.setupWindow) {
      this.setupWindow.close();
      this.setupWindow = null;
      if (this.mainWindow) {
        this.mainWindow.show();
        this.mainWindow.focus();
      } else {
        this.showMainWindow();
      }
    }
  }

  public closeSplashScreen() {
    if (this.splashWindow && !this.splashWindow.isDestroyed()) {
      this.splashWindow.close();
      this.splashWindow = null;
    }
  }

  public getMainWindow() {
    return this.mainWindow;
  }

  public getSplash() {
    return this.splashWindow;
  }

  public getSetupWindow() {
    return this.setupWindow;
  }
}
