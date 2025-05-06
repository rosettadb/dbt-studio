import { BrowserWindow, app, ipcMain } from 'electron';
import { createSplashWindow } from './splash';
import { createMainWindow } from './main';
import registerHandlers from '../ipcSetup';
import { installExtensions } from '../utils/setupHelpers';
import { ProjectsService } from '../services';
import { createProjectWindow } from './project';

export class WindowManager {
  private splashWindow: BrowserWindow | null = null;

  private projectWindow: BrowserWindow | null = null;

  private mainWindow: BrowserWindow | null = null;

  private isQuitting = false;

  public async startApplication() {
    this.showSplashScreen();
    await this.initializeApp();
  }

  private showSplashScreen() {
    this.splashWindow = createSplashWindow();
  }

  public showProjectWindow() {
    this.projectWindow = createProjectWindow();

    return new Promise<void>((resolve) => {
      if (!this.projectWindow) {
        resolve();
        return;
      }

      this.projectWindow.once('ready-to-show', () => {
        if (this.projectWindow) {
          this.projectWindow.show();
          this.projectWindow.focus();
        }
        resolve();
      });
    });
  }

  public closeProjectWindow() {
    if (this.projectWindow) {
      this.mainWindow?.reload();
      this.projectWindow.close();
      this.projectWindow = null;
      if (this.mainWindow) {
        this.mainWindow.show();
        this.mainWindow.focus();
      }
    }
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
      ipcMain.removeHandler('project:select');
      ipcMain.handle(
        'project:select',
        async (_event, body: { projectId: string }) => {
          await ProjectsService.selectProject(body);
          // Removed reload that breaks the render
        },
      );
    });
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
}
