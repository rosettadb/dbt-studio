import { ipcMain } from 'electron';
import { OpenAIService, ProjectsService, SettingsService } from '../services';
import {
  EnhanceModelResponseType,
  GenerateDashboardResponseType,
  Project,
} from '../../types/backend';

const registerProjectHandlers = () => {
  ipcMain.handle('project:list', async () => {
    return ProjectsService.loadProjects();
  });

  ipcMain.handle('project:get', async (_event, body: { id: string }) => {
    return ProjectsService.getProject(body.id);
  });

  ipcMain.handle('project:add', async (_event, body: { name: string }) => {
    return ProjectsService.addProject(body.name);
  });

  ipcMain.handle(
    'project:select',
    async (_event, body: { projectId: string }) => {
      await ProjectsService.selectProject(body);
    },
  );

  ipcMain.handle(
    'project:addFromVCS',
    async (_event, body: { path: string; name: string }) => {
      return ProjectsService.addProjectFromVCS(body.path, body.name);
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

  ipcMain.handle('project:getDirectory', async (_event, body: Project) => {
    return ProjectsService.getDirectoryStructure(body);
  });

  ipcMain.handle('project:readFile', async (_event, body: { path: string }) => {
    return ProjectsService.readFileContent(body.path);
  });

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
    'project:createFile',
    async (
      _event,
      body: { filePath: string; name: string; content?: string },
    ) => {
      return ProjectsService.createFile(body);
    },
  );

  ipcMain.handle(
    'project:deleteItem',
    async (_event, body: { filePath: string }) => {
      await ProjectsService.deleteItem(body);
    },
  );

  ipcMain.handle('project:selected', async () => {
    return ProjectsService.getSelectedProject();
  });

  ipcMain.handle(
    'project:generateDashboardsQuery',
    async (
      _event,
      prompt: string,
    ): Promise<GenerateDashboardResponseType[]> => {
      const apiKey = (await SettingsService.loadSettings()).openAIApiKey ?? '';
      return new OpenAIService(apiKey).generateDashboardsQuery(prompt);
    },
  );

  ipcMain.handle(
    'project:enhanceModelQuery',
    async (_event, prompt: string): Promise<EnhanceModelResponseType> => {
      const apiKey = (await SettingsService.loadSettings()).openAIApiKey ?? '';
      return new OpenAIService(apiKey).enhanceModelQuery(prompt);
    },
  );
  ipcMain.handle('project:zipDir', async (_event, path: string) => {
    return ProjectsService.zipDirectory(path);
  });
};

export default registerProjectHandlers;
