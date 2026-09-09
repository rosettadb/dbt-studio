import { ipcMain } from 'electron';
import { ProjectsService } from '../services';
import { AIProviderManager } from '../services/ai/providerManager.service';
import { Project } from '../../types/backend';
import {
  CompletionResponse,
  JSONSchema,
} from '../services/ai/types/completion.types';

const registerProjectHandlers = () => {
  ipcMain.handle('project:list', async () => {
    return ProjectsService.loadProjects();
  });

  ipcMain.handle('project:get', async (_event, body: { id: string }) => {
    return ProjectsService.getProject(body.id);
  });

  ipcMain.handle(
    'project:add',
    async (
      _event,
      body: {
        name: string;
        connectionId?: string;
        createTemplateFolders?: boolean;
      },
    ) => {
      return ProjectsService.addProject(
        body.name,
        body.connectionId,
        body.createTemplateFolders,
      );
    },
  );

  ipcMain.handle(
    'project:select',
    async (_event, body: { projectId: string }) => {
      await ProjectsService.selectProject(body);
    },
  );

  ipcMain.handle(
    'project:addFromVCS',
    async (
      _event,
      body: {
        path: string;
        name: string;
        connectionId?: string;
      },
    ) => {
      return ProjectsService.addProjectFromVCS(body);
    },
  );

  ipcMain.handle('project:addFromFolder', async () => {
    return ProjectsService.importProjectFromFolder();
  });

  ipcMain.handle('project:update', async (_event, body: Project) => {
    return ProjectsService.updateProject(body);
  });

  ipcMain.handle('project:delete', async (_event, body: { id: string }) => {
    return ProjectsService.deleteProject(body.id);
  });

  ipcMain.handle(
    'project:removeFromList',
    async (_event, body: { id: string }) => {
      return ProjectsService.removeProjectFromList(body.id);
    },
  );

  ipcMain.handle('project:getPath', async (_event, body: { name: string }) => {
    return ProjectsService.getProjectPath(body.name);
  });

  ipcMain.handle(
    'project:postRosettaDBTCopy',
    async (_event, body: Project) => {
      return ProjectsService.postRosettaDBTCopy(body);
    },
  );

  ipcMain.handle('project:extractSchema', async (_event, body: Project) => {
    return ProjectsService.extractSchema(body);
  });

  ipcMain.handle(
    'project:extractSchemaFromModelYaml',
    async (_event, body: Project) => {
      return ProjectsService.extractSchemaFromModelYaml(body);
    },
  );

  ipcMain.handle(
    'project:updateQuery',
    async (_event, body: { projectId: string; query: string }) => {
      return ProjectsService.updateQuery(body);
    },
  );

  ipcMain.handle('project:getQuery', async (_event, body: Project) => {
    return ProjectsService.getQuery(body);
  });

  ipcMain.handle('project:getDirectory', async (_event, body: Project) => {
    return ProjectsService.getDirectoryStructure(body);
  });

  ipcMain.handle('project:readFile', async (_event, body: { path: string }) => {
    return ProjectsService.readFileContent(body.path);
  });

  ipcMain.handle(
    'project:searchInFiles',
    async (
      _event,
      body: {
        path: string;
        query: string;
        caseSensitive?: boolean;
        useRegex?: boolean;
      },
    ) => {
      return ProjectsService.searchInFiles(body);
    },
  );

  ipcMain.handle(
    'project:updateFile',
    async (_event, body: { path: string; content: string }) => {
      return ProjectsService.saveFileContent(body.path, body.content);
    },
  );

  ipcMain.handle(
    'project:createFolder',
    async (_event, body: { filePath: string; name: string }) => {
      return ProjectsService.createFolder(body);
    },
  );

  ipcMain.handle(
    'project:createFolderAsync',
    async (_event, body: { filePath: string; name: string }) => {
      return ProjectsService.createFolderAsync(body);
    },
  );

  ipcMain.handle(
    'project:createFile',
    async (
      _event,
      body: { filePath: string; name: string; content?: string },
    ) => {
      return ProjectsService.createFile(body);
    },
  );

  ipcMain.handle(
    'project:copyPath',
    async (_event, body: { source: string; target: string }) => {
      return ProjectsService.copyPath(body);
    },
  );

  ipcMain.handle(
    'project:deleteItem',
    async (_event, body: { filePath: string }) => {
      await ProjectsService.deleteItem(body);
    },
  );

  ipcMain.handle(
    'project:renamePath',
    async (
      _event,
      body: {
        path: string;
        newName: string;
      },
    ) => {
      return ProjectsService.renamePath(body);
    },
  );

  ipcMain.handle('project:selected', async () => {
    return ProjectsService.getSelectedProject();
  });

  ipcMain.handle(
    'project:enhanceModelQuery',
    async (_event, prompt: string): Promise<CompletionResponse<JSONSchema>> => {
      const jsonSchema: JSONSchema = {
        type: 'object',
        properties: {
          fileName: { type: 'string' },
          content: { type: 'string' },
        },
        required: ['fileName', 'content'],
      };
      return AIProviderManager.generateTypedCompletion<JSONSchema>({
        prompt,
        schemaConfig: {
          schema: jsonSchema,
          name: 'dbtBusinessModelGenerator',
          description: 'Extract Business Model Information',
        },
      });
    },
  );

  ipcMain.handle('project:zipDir', async (_event, path: string) => {
    return ProjectsService.zipDirectory(path);
  });

  ipcMain.handle(
    'project:chooseDir',
    async (_event, { path }: { path: string }) => {
      return ProjectsService.chooseDir(path);
    },
  );
  ipcMain.handle(
    'project:downloadSeed',
    async (
      _event,
      body: {
        objectUrl: string;
        project: Project;
      },
    ) => {
      return ProjectsService.downloadSeed(body);
    },
  );

  ipcMain.handle(
    'project:extractProfileEnvVars',
    async (_event, body: { projectId: string }) => {
      return ProjectsService.extractProfileEnvVars(body.projectId);
    },
  );

  ipcMain.handle(
    'project:extractRequiredEnvVars',
    async (
      _event,
      body: { projectId: string; pipelineRelativePath?: string },
    ) => {
      return ProjectsService.extractRequiredEnvVars(
        body.projectId,
        body.pipelineRelativePath,
      );
    },
  );

  ipcMain.handle(
    'project:listPipelines',
    async (_event, body: { projectId: string }) => {
      return ProjectsService.listPipelines(body.projectId);
    },
  );
};

export default registerProjectHandlers;
