/* eslint-disable no-restricted-syntax, no-await-in-loop */
import { shell } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import { CloudDeploymentPayload } from '../../types/backend';
import { UserProfile } from '../../types/profile';

import {
  CLOUD_DASHBOARD_TOKEN_KEY,
  ROSETTA_CLOUD_BASE_URL,
} from '../utils/constants';
import SettingsService from './settings.service';
import SecureStorageService from './secureStorage.service';
import ProjectsService from './projects.service';

export default class RosettaCloudService {
  private static cachedProfile: UserProfile | null = null;

  static async pushProjectToCloud(body: CloudDeploymentPayload): Promise<void> {
    const { id, secrets } = body;
    const project = await ProjectsService.getProject(id);
    const hasSecrets = Object.keys(secrets ?? {}).length > 0;

    if (!project) {
      throw new Error('Project not found');
    }

    const settings = await SettingsService.loadSettings();
    const rosettaCloudUrl =
      settings.cloudWorkspaceUrl ?? ROSETTA_CLOUD_BASE_URL;
    const baseUrl = rosettaCloudUrl.replace(/\/$/, '');

    const postJson = async (url: string, data?: object): Promise<any> => {
      const token = await this.getToken();
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: data ? JSON.stringify(data) : undefined,
      });

      return response.json();
    };

    const addSecrets = async (
      projectId: string,
      secretsArg: Record<string, string>,
    ) => {
      const addSecretsEndpoint = `${baseUrl}/api/projects/${projectId}/secrets`;
      const addSecretsBody = Object.entries(secretsArg).map(([name, value]) => {
        return {
          name,
          value,
        };
      });
      await postJson(addSecretsEndpoint, addSecretsBody);
    };

    if (project.externalId) {
      const runEndpoint = `${baseUrl}/api/projects/${project.externalId}/run`;
      await postJson(runEndpoint);
      await ProjectsService.updateProject({
        ...project,
        lastRun: new Date().toISOString(),
      });
      return;
    }

    const createEndpoint = `${baseUrl}/api/projects`;

    const requestBody = {
      title: body.title,
      git_url: body.gitUrl,
      git_branch: body.gitBranch,
    };

    const projectData = await postJson(createEndpoint, requestBody);
    await ProjectsService.updateProject({
      ...project,
      externalId: projectData.id,
      lastRun: new Date().toISOString(),
    });

    if (hasSecrets) await addSecrets(projectData.id, secrets);

    const runEndpoint = `${baseUrl}/api/projects/${projectData.id}/run`;
    await postJson(runEndpoint);
  }

  static async getProfile(): Promise<UserProfile | null> {
    try {
      const token = await this.getToken();

      if (!token) {
        // eslint-disable-next-line no-console
        console.log('No auth token available for profile fetch');
        return null;
      }

      const response = await fetch(
        `${ROSETTA_CLOUD_BASE_URL}/api/electron/profile`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        },
      );

      if (!response.ok) {
        if (response.status === 401) {
          // Token expired, clear it
          await this.clearToken();
          this.cachedProfile = null;
          return null;
        }
        throw new Error(`Profile fetch failed: ${response.status}`);
      }

      const data = await response.json();
      this.cachedProfile = data.profile;
      return data.profile;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Profile service error:', error);
      return this.cachedProfile; // Return cached data on network error
    }
  }

  static async refreshProfile(): Promise<UserProfile | null> {
    this.cachedProfile = null; // Clear cache
    return this.getProfile();
  }

  static clearProfile(): void {
    this.cachedProfile = null;
  }

  static getCachedProfile(): UserProfile | null {
    return this.cachedProfile;
  }

  static async openLogin(): Promise<string> {
    const uuid = uuidv4();
    const authUrl = `${ROSETTA_CLOUD_BASE_URL}/api/device-auth/start?uuid=${uuid}`;

    await shell.openExternal(authUrl);

    return uuid;
  }

  static async storeToken(token: string): Promise<void> {
    await SecureStorageService.setCredential(CLOUD_DASHBOARD_TOKEN_KEY, token);
  }

  static async getToken(): Promise<string | null> {
    return SecureStorageService.getCredential(CLOUD_DASHBOARD_TOKEN_KEY);
  }

  static async clearToken(): Promise<void> {
    await SecureStorageService.deleteCredential(CLOUD_DASHBOARD_TOKEN_KEY);
    this.clearProfile();
  }

  static async isAuthenticated(): Promise<boolean> {
    const token = await this.getToken();
    return token !== null;
  }
}
