import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { app } from 'electron';
import os from 'os';
import Store from 'electron-store';
import { AppUpdateTrackURL } from '../utils/constants';

const trackUrl = AppUpdateTrackURL;

interface UpdateEvent {
  event: string;
  version: string;
  previousVersion?: string;
  platform: string;
  arch: string;
  timestamp: string;
  hostname?: string;
  clientId: string; // Added clientId to the payload
}

interface AnalyticsEvent {
  category: string;
  action: string;
  label?: string;
  timestamp: string;
  response?: {
    status?: number;
    statusText?: string;
    serverResponse: any;
  };
  error?: {
    message: string;
    code?: string;
    status?: number;
    statusText?: string;
  };
}

// Define the schema for our store
interface AnalyticsStoreSchema {
  clientId: string;
  clientIdCreatedAt: string;
  lastVersion: string;
  lastVersionUpdatedAt: string;
}

export default class AnalyticsService {
  private static clientId: string;
  private static debugMode: boolean;
  private static lastEvent: AnalyticsEvent | null = null;
  private static readonly store = new Store() as any;

  static {
    this.debugMode = process.env.NODE_ENV === 'development';
    this.clientId = this.getOrCreateClientId();
  }

  private static getOrCreateClientId(): string {
    try {
      // Use correct accessor methods for electron-store v10
      let clientId = this.store.get('clientId') as string | undefined;

      if (!clientId) {
        // Generate a new client ID if none exists
        clientId = uuidv4();
        this.store.set('clientId', clientId);
        this.store.set('clientIdCreatedAt', new Date().toISOString());
      }

      return clientId;
    } catch (err) {
      console.error('Error with client ID:', err);
      // If there's an error, generate a temporary ID that won't be persisted
      return uuidv4();
    }
  }

  private static getLastStoredVersion(): string | null {
    try {
      // Use correct accessor methods for electron-store v10
      const version = this.store.get('lastVersion') as string | undefined;
      return version || null;
    } catch (err) {
      console.error('Error reading last version:', err);
      return null;
    }
  }

  private static saveCurrentVersion(version: string) {
    try {
      this.store.set('lastVersion', version);
      this.store.set('lastVersionUpdatedAt', new Date().toISOString());
    } catch (err) {
      console.error('Error saving current version:', err);
    }
  }

  static async trackAppUpdate(): Promise<void> {
    const currentVersion = app.getVersion();
    const lastVersion = this.getLastStoredVersion();

    // Only send telemetry if this is a new version
    if (lastVersion !== currentVersion) {
      console.log(`App updated from ${lastVersion || 'new install'} to ${currentVersion}`);

      try {
        // Create update telemetry payload with clientId
        const telemetryPayload: UpdateEvent = {
          event: 'app_updated',
          version: currentVersion,
          previousVersion: lastVersion || 'new_install',
          platform: os.platform(),
          arch: os.arch(),
          timestamp: new Date().toISOString(),
          hostname: os.hostname(), // Optional, for internal use
          clientId: this.clientId // Include the client ID in the payload
        };

        // Only send in production environment
        if (process.env.NODE_ENV === 'production') {
          if(!trackUrl) {
            console.error('TRACK_URL is not set. Telemetry will not be sent.');
            return;
          }
          await axios.post(trackUrl, telemetryPayload);
          console.log('Update telemetry sent successfully.');

          this.lastEvent = {
            category: 'app',
            action: 'update',
            timestamp: new Date().toISOString(),
            response: {
              status: 200,
              statusText: 'OK',
              serverResponse: 'Success'
            }
          };
        } else {
          console.log('Update telemetry (debug mode):', telemetryPayload);
        }

        // Update stored version after successful telemetry or in debug mode
        this.saveCurrentVersion(currentVersion);
      } catch (err: any) {
        console.error('Failed to send update telemetry:', err);

        this.lastEvent = {
          category: 'app',
          action: 'update',
          timestamp: new Date().toISOString(),
          error: {
            message: err.message,
            code: err.code,
            status: err.response?.status,
            statusText: err.response?.statusText
          }
        };

        // Still update the version to avoid repeated attempts
        this.saveCurrentVersion(currentVersion);
      }
    }
  }

  static getLastEvent(): AnalyticsEvent | null {
    return this.lastEvent;
  }
}

export const analyticsService = AnalyticsService;