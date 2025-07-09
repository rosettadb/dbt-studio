import axios from 'axios';
import { v4 as uuidV4 } from 'uuid';
import { app } from 'electron';
import os from 'os';
import Store from 'electron-store';
import { AppUpdateTrackURL } from '../utils/constants';
import { AnalyticsEvent, StoreSchema, UpdateEvent } from '../../types/backend';

const trackUrl = AppUpdateTrackURL;

export default class AnalyticsService {
  private static clientId: string;

  private static debugMode: boolean;

  private static lastEvent: AnalyticsEvent | null = null;

  private static readonly store = new Store<StoreSchema>({
    defaults: {
      clientId: '',
      clientIdCreatedAt: '',
      lastVersion: '',
      lastVersionUpdatedAt: '',
    },
  });

  static {
    this.debugMode = process.env.NODE_ENV === 'development';
    this.clientId = this.getOrCreateClientId();
  }

  private static getOrCreateClientId(): string {
    try {
      let clientId = this.store.get('clientId');

      if (!clientId) {
        clientId = uuidV4();
        this.store.set('clientId', clientId);
        this.store.set('clientIdCreatedAt', new Date().toISOString());
      }

      return clientId;
    } catch (err) {
      return uuidV4();
    }
  }

  private static getLastStoredVersion(): string | null {
    try {
      return this.store.get('lastVersion');
    } catch (err) {
      return null;
    }
  }

  private static saveCurrentVersion(version: string) {
    this.store.set('lastVersion', version);
    this.store.set('lastVersionUpdatedAt', new Date().toISOString());
  }

  static async trackAppUpdate(): Promise<void> {
    const currentVersion = app.getVersion();
    const lastVersion = this.getLastStoredVersion();

    if (lastVersion !== currentVersion) {
      try {
        const telemetryPayload: UpdateEvent = {
          event: 'app_updated',
          version: currentVersion,
          previousVersion: lastVersion || 'new_install',
          platform: os.platform(),
          arch: os.arch(),
          timestamp: new Date().toISOString(),
          hostname: os.hostname(),
          clientId: this.clientId,
        };

        if (process.env.NODE_ENV === 'production') {
          if (!trackUrl) {
            return;
          }
          await axios.post(trackUrl, telemetryPayload);
          this.lastEvent = {
            category: 'app',
            action: 'update',
            timestamp: new Date().toISOString(),
            response: {
              status: 200,
              statusText: 'OK',
              serverResponse: 'Success',
            },
          };
        }
        this.saveCurrentVersion(currentVersion);
      } catch (err: any) {
        this.lastEvent = {
          category: 'app',
          action: 'update',
          timestamp: new Date().toISOString(),
          error: {
            message: err.message,
            code: err.code,
            status: err.response?.status,
            statusText: err.response?.statusText,
          },
        };
        this.saveCurrentVersion(currentVersion);
      }
    }
  }
}
