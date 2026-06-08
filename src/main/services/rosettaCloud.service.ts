/* eslint-disable no-restricted-syntax, no-await-in-loop */
import { shell, WebContents } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import { CloudDeploymentPayload, Secret } from '../../types/backend';
import { UserProfile } from '../../types/profile';
import { CloudLogEntry, CloudPipelineData } from '../../types/cloudAction';

import { ROSETTA_CLOUD_BASE_URL } from '../utils/constants';
import SecureStorageService from './secureStorage.service';
import ProjectsService from './projects.service';

type LogStreamHandle = {
  controller: AbortController;
};

export default class RosettaCloudService {
  private static cachedProfile: UserProfile | null = null;

  private static readonly API_KEY_STORAGE_KEY = 'cloud-api-key';

  private static activeLogStreams = new Map<string, LogStreamHandle>();

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

      if (!response.ok) {
        throw new Error(`Request failed: ${response.status}`);
      }

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
      // Resolve and persist the newly-created action id by querying the
      // cloud's actions list — the run response shape is unreliable (cloud-api
      // wraps it as { data: <Action> }), so we go to the source.
      if (body.EXECUTION_MODE === 'pipeline' && body.PIPELINE_FILE) {
        await this.findActionForPipeline(id, body.PIPELINE_FILE).catch((e) => {
          // eslint-disable-next-line no-console
          console.error('Failed to record action id for pipeline:', e);
        });
      }
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
    if (body.EXECUTION_MODE === 'pipeline' && body.PIPELINE_FILE) {
      await this.findActionForPipeline(id, body.PIPELINE_FILE).catch((e) => {
        // eslint-disable-next-line no-console
        console.error('Failed to record action id for pipeline:', e);
      });
    }
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

  /**
   * Source-of-truth resolver: queries the cloud's actions list for the most
   * recent action whose `data.PIPELINE_FILE` matches, then persists the id to
   * `project.pipelineRuns` so subsequent reads are direct.
   *
   * Always queries the cloud — does NOT short-circuit on the locally-cached
   * value. The renderer hook decides whether to call this at all (based on the
   * presence of a recorded id), so by the time we get here the caller wants a
   * fresh lookup.
   */
  static async findActionForPipeline(
    projectId: string,
    pipelineFile: string,
  ): Promise<string | null> {
    const apiKey = await this.getApiKey();
    if (!apiKey) return null;

    const project = await ProjectsService.getProject(projectId);
    if (!project?.externalId) return null;

    const baseUrl = ROSETTA_CLOUD_BASE_URL.replace(/\/$/, '');
    const url = `${baseUrl}/api/actions?projectId=${encodeURIComponent(
      project.externalId,
    )}&limit=20&sortBy=createdAt&sortOrder=desc`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) return null;

    const body = (await response.json()) as {
      actions?: { id: string; data?: { PIPELINE_FILE?: string } }[];
    };

    const match = body.actions?.find(
      (a) => a.data?.PIPELINE_FILE === pipelineFile,
    );
    if (!match?.id) return null;

    // Re-read the project before merging — the cloud-action call may have
    // raced with a separate update.
    const fresh = await ProjectsService.getProject(projectId);
    const base = fresh ?? project;
    await ProjectsService.updateProject({
      ...base,
      pipelineRuns: {
        ...(base.pipelineRuns ?? {}),
        [pipelineFile]: match.id,
      },
    });

    return match.id;
  }

  /**
   * One-shot fetch of the full log set for a (typically finished) action.
   * Used in place of the SSE stream once the action is terminal so we stop
   * holding an open connection that will never receive new data.
   */
  static async getActionLogs(actionId: string): Promise<CloudLogEntry[]> {
    const apiKey = await this.getApiKey();
    if (!apiKey) return [];

    const baseUrl = ROSETTA_CLOUD_BASE_URL.replace(/\/$/, '');
    const response = await fetch(
      `${baseUrl}/api/actions/${encodeURIComponent(actionId)}/logs`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch logs: ${response.status}`);
    }

    const body = (await response.json()) as { logs?: CloudLogEntry[] };
    return body.logs ?? [];
  }

  static async getActionStatus(
    actionId: string,
  ): Promise<CloudPipelineData | null> {
    const apiKey = await this.getApiKey();
    if (!apiKey) return null;

    const baseUrl = ROSETTA_CLOUD_BASE_URL.replace(/\/$/, '');
    const response = await fetch(
      `${baseUrl}/api/actions/${encodeURIComponent(actionId)}/status`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      },
    );

    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`Failed to fetch action status: ${response.status}`);
    }

    return (await response.json()) as CloudPipelineData;
  }

  /**
   * Opens an SSE log stream for the given action and forwards log entries to
   * the provided WebContents via 'rosettaCloud:logEntries' events. Calling
   * with the same actionId twice closes the previous stream first so we never
   * have duplicate streams running.
   */
  static async openLogStream(
    actionId: string,
    webContents: WebContents,
  ): Promise<void> {
    this.closeLogStream(actionId);

    const apiKey = await this.getApiKey();
    if (!apiKey) {
      webContents.send('rosettaCloud:logStreamError', {
        actionId,
        error: 'Not authenticated',
      });
      return;
    }

    const baseUrl = ROSETTA_CLOUD_BASE_URL.replace(/\/$/, '');
    const controller = new AbortController();
    this.activeLogStreams.set(actionId, { controller });

    const stopOnDestroy = () => this.closeLogStream(actionId);
    webContents.once('destroyed', stopOnDestroy);

    try {
      const response = await fetch(
        `${baseUrl}/api/actions/${encodeURIComponent(actionId)}/logs/stream`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            Accept: 'text/event-stream',
          },
          signal: controller.signal,
        },
      );

      if (!response.ok || !response.body) {
        throw new Error(`Log stream failed: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (!controller.signal.aborted) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE messages are separated by a blank line.
        let separatorIdx = buffer.indexOf('\n\n');
        while (separatorIdx !== -1) {
          const rawEvent = buffer.slice(0, separatorIdx);
          buffer = buffer.slice(separatorIdx + 2);

          const dataLines = rawEvent
            .split('\n')
            .filter((l) => l.startsWith('data:'))
            .map((l) => l.slice(5).trimStart());

          if (dataLines.length > 0) {
            const payloadText = dataLines.join('\n');
            try {
              const payload = JSON.parse(payloadText) as {
                logs?: CloudLogEntry[];
              };
              if (
                payload.logs &&
                payload.logs.length > 0 &&
                !webContents.isDestroyed()
              ) {
                webContents.send('rosettaCloud:logEntries', {
                  actionId,
                  logs: payload.logs,
                });
              }
            } catch {
              // ignore malformed SSE frames
            }
          }
          separatorIdx = buffer.indexOf('\n\n');
        }
      }

      if (!webContents.isDestroyed()) {
        webContents.send('rosettaCloud:logStreamEnd', { actionId });
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      if (!webContents.isDestroyed()) {
        webContents.send('rosettaCloud:logStreamError', {
          actionId,
          error: error instanceof Error ? error.message : 'Stream error',
        });
      }
    } finally {
      this.activeLogStreams.delete(actionId);
    }
  }

  static closeLogStream(actionId: string): void {
    const handle = this.activeLogStreams.get(actionId);
    if (!handle) return;
    handle.controller.abort();
    this.activeLogStreams.delete(actionId);
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
