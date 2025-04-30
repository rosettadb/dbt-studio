import { BrowserWindow, app, ipcMain } from 'electron';
import { createSplashWindow } from './splash';
import { createProjectWindow } from './selectProject';
import { createMainWindow } from './main';
import registerHandlers from '../ipcSetup';
import { installExtensions } from '../utils/setupHelpers';
import { ProjectsService } from '../services';

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

  public async showProjectWindow() {
    this.projectWindow = createProjectWindow(() => {
      this.projectWindow = null;
      if (!this.mainWindow && !this.isQuitting) {
        app.quit();
      }
    });
    registerHandlers(this.projectWindow);
    ipcMain.removeHandler('project:select');
    ipcMain.handle(
      'project:select',
      async (_event, body: { projectId: string }) => {
        await ProjectsService.selectProject(body);
        this.closeProjectWindow(() => this.showMainWindow());
      },
    );
  }

  private async showMainWindow() {
    this.mainWindow = createMainWindow(() => {
      this.showProjectWindow();
      this.mainWindow = null;
    });
    registerHandlers(this.mainWindow);
    ipcMain.removeHandler('project:select');
    ipcMain.handle(
      'project:select',
      async (_event, body: { projectId: string }) => {
        await ProjectsService.selectProject(body);
        this.mainWindow?.reload();
      },
    );
  }

  public closeSplashScreen() {
    if (this.splashWindow && !this.splashWindow.isDestroyed()) {
      this.splashWindow.close();
      this.splashWindow = null;
    }
  }

  private closeProjectWindow(cb: () => void) {
    if (this.projectWindow && !this.projectWindow.isDestroyed()) {
      this.projectWindow.close();
      this.projectWindow = null;
      cb();
    }
  }

  public getMainWindow() {
    return this.mainWindow;
  }

  public getSplash() {
    return this.splashWindow;
  }

  public getProjectWindow() {
    return this.projectWindow;
  }
}
