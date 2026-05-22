/* eslint-disable no-restricted-syntax, no-await-in-loop */
import { shell } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import { CloudDeploymentPayload, Secret } from '../../types/backend';
import { UserProfile } from '../../types/profile';

import { ROSETTA_CLOUD_BASE_URL } from '../utils/constants';
import SecureStorageService from './secureStorage.service';
import ProjectsService from './projects.service';

export default class RosettaCloudService {
  private static cachedProfile: UserProfile | null = null;

  private static readonly API_KEY_STORAGE_KEY = 'cloud-api-key';

  static async pushProjectToCloud(body: CloudDeploymentPayload): Promise<void> {
    const { id, secrets } = body;
    const project = await ProjectsService.getProject(id);
    const hasSecrets = Object.keys(secrets ?? {}).length > 0;

    if (!project) {
      throw new Error('Project not found');
    }

    const rosettaCloudUrl = ROSETTA_CLOUD_BASE_URL;
    const baseUrl = rosettaCloudUrl.replace(/\/$/, '');

    const postJson = async (url: string, data?: object): Promise<any> => {
      const apiKey = await this.getApiKey();
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${apiKey}`,
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
      if (hasSecrets) await addSecrets(project.externalId, secrets);
      const teardown = body.ROSETTA_RUN_TEARDOWN ?? true;
      const runEndpoint = `${baseUrl}/api/projects/${project.externalId}/run?teardown=${teardown}`;
      const runBody: Record<string, any> = {
        CUSTOM_DBT_COMMANDS: body.CUSTOM_DBT_COMMANDS,
        EXECUTION_MODE: body.EXECUTION_MODE || 'command',
      };
      if (body.EXECUTION_MODE === 'pipeline' && body.PIPELINE_FILE) {
        runBody.PIPELINE_FILE = body.PIPELINE_FILE;
      }
      await postJson(runEndpoint, runBody);
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

    const newTeardown = body.ROSETTA_RUN_TEARDOWN ?? true;
    const runEndpoint = `${baseUrl}/api/projects/${projectData.id}/run?teardown=${newTeardown}`;
    const newRunBody: Record<string, any> = {
      CUSTOM_DBT_COMMANDS: body.CUSTOM_DBT_COMMANDS,
      EXECUTION_MODE: body.EXECUTION_MODE || 'command',
    };
    if (body.EXECUTION_MODE === 'pipeline' && body.PIPELINE_FILE) {
      newRunBody.PIPELINE_FILE = body.PIPELINE_FILE;
    }
    await postJson(runEndpoint, newRunBody);
  }

  static async getSecrets(projectId: string): Promise<Secret[]> {
    const project = await ProjectsService.getProject(projectId);
    if (!project) {
      throw new Error('Project not found');
    }

    if (!project.externalId) {
      throw new Error('Project has not been deployed to cloud');
    }

    const rosettaCloudUrl = ROSETTA_CLOUD_BASE_URL;
    const baseUrl = rosettaCloudUrl.replace(/\/$/, '');

    const apiKey = await this.getApiKey();
    const secretsEndpoint = `${baseUrl}/api/projects/${project.externalId}/secrets`;

    const response = await fetch(secretsEndpoint, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch secrets: ${response.status}`);
    }

    return response.json();
  }

  static async deleteSecret(
    projectId: string,
    secretId: string,
  ): Promise<void> {
    const project = await ProjectsService.getProject(projectId);

    if (!project) {
      throw new Error('Project not found');
    }

    if (!project.externalId) {
      throw new Error('Project has not been deployed to cloud');
    }

    const rosettaCloudUrl = ROSETTA_CLOUD_BASE_URL;
    const baseUrl = rosettaCloudUrl.replace(/\/$/, '');

    const apiKey = await this.getApiKey();
    const deleteEndpoint = `${baseUrl}/api/projects/${project.externalId}/secrets?secretId=${secretId}`;

    const response = await fetch(deleteEndpoint, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to delete secret: ${response.status}`);
    }
  }

  static async getProfile(): Promise<UserProfile | null> {
    try {
      const apiKey = await this.getApiKey();

      if (!apiKey) {
        // eslint-disable-next-line no-console
        console.log('No API key available for profile fetch');
        return null;
      }

      const response = await fetch(
        `${ROSETTA_CLOUD_BASE_URL}/api/electron/profile`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      if (!response.ok) {
        if (response.status === 401) {
          // API key invalid, clear it
          await this.clearApiKey();
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

  static async storeApiKey(apiKey: string): Promise<void> {
    try {
      await SecureStorageService.setCredential(
        this.API_KEY_STORAGE_KEY,
        apiKey,
      );

      // eslint-disable-next-line no-console
      console.log('API key stored successfully');
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to store API key:', error);
      throw error;
    }
  }

  static async getApiKey(): Promise<string | null> {
    try {
      return await SecureStorageService.getCredential(this.API_KEY_STORAGE_KEY);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to retrieve API key:', error);
      return null;
    }
  }

  static async clearApiKey(): Promise<void> {
    try {
      await SecureStorageService.deleteCredential(this.API_KEY_STORAGE_KEY);

      this.clearProfile();

      // eslint-disable-next-line no-console
      console.log('API key cleared successfully');
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to clear API key:', error);
      throw error;
    }
  }

  static async isAuthenticated(): Promise<boolean> {
    const apiKey = await this.getApiKey();
    return !!apiKey;
  }

  /**
   * Verifies the stored API key against /api/electron/token/check.
   * If the token is invalid or expired, clears the stored API key.
   * Called on app startup when user is logged in to Rosetta Cloud.
   */
  static async checkTokenOnStartup(): Promise<void> {
    try {
      const apiKey = await this.getApiKey();
      if (!apiKey) {
        return;
      }

      const baseUrl = ROSETTA_CLOUD_BASE_URL.replace(/\/$/, '');
      const response = await fetch(`${baseUrl}/api/electron/token/check`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      let data: { valid?: boolean } = {};
      try {
        data = await response.json();
      } catch {
        // 401 may not return valid JSON
      }

      if (!response.ok || data.valid !== true) {
        await this.clearApiKey();
      }
    } catch (error) {
      // On network error, don't clear - user might be offline
      // eslint-disable-next-line no-console
      console.error('Token check on startup failed:', error);
    }
  }

  static async validateApiKey(
    apiKey: string,
  ): Promise<{ valid: boolean; error?: string }> {
    try {
      const response = await fetch(
        `${ROSETTA_CLOUD_BASE_URL}/api/electron/profile`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      if (response.ok) {
        return { valid: true };
      }

      if (response.status === 401) {
        return { valid: false, error: 'Invalid API key' };
      }

      if (response.status === 404) {
        return {
          valid: false,
          error: 'API key not found or user does not exist',
        };
      }

      return { valid: false, error: `Validation failed: ${response.status}` };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('API key validation error:', error);
      return { valid: false, error: 'Unable to connect to Rosetta Cloud' };
    }
  }
}
