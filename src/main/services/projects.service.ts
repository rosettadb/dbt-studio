import path from 'path';
import fs from 'fs';
import yaml from 'js-yaml';
import { dialog } from 'electron';
import {
  PostgresDBTConnection,
  Project,
  SnowflakeDBTConnection,
  Table,
} from '../../types/backend';
import {
  createNewFile,
  createNewFolder,
  createZipArchive,
  deleteDirectory,
  deleteItem,
  getDirectoryStructure,
  loadDatabaseFile,
  readFileContent,
  saveFileContent,
  updateDatabase,
} from '../utils/fileHelper';
import SettingsService from './settings.service';
import { PGSchemaExtractor, SnowflakeExtractor } from '../extractor';

export default class ProjectsService {
  static async loadProjects() {
    return (await loadDatabaseFile()).projects;
  }

  static async getProject(id: string): Promise<Project | undefined> {
    let projects = await this.loadProjects();
    const project = projects.find((p) => p.id === id);
    if (project) {
      projects = (await this.updateProject({
        ...project,
        lastOpenedAt: Date.now(),
      })) as Project[];
      return projects?.find((p) => p.id === id);
    }
    return project;
  }

  static async getSelectedProject(): Promise<Project | undefined> {
    return (await loadDatabaseFile()).selectedProject;
  }

  static async saveProjects(projects: Project[]) {
    await updateDatabase<'projects'>('projects', projects);
  }

  static async addProject(projectPath: string) {
    const projects = await this.loadProjects();
    const name = path.basename(projectPath);

    const project: Project = {
      id: Date.now().toString(),
      name,
      createdAt: new Date().toISOString(),
      path: projectPath,
      isExtracted: false,
    };

    await this.copyDbtTemplateFiles(project.path, project.name);
    await this.copyRosettaMainConf(project.path);
    projects.push(project);
    await this.saveProjects(projects);
    return project;
  }

  static async addProjectFromVCS(projectPath: string, name: string) {
    const dbtProjectYmlPath = path.join(projectPath, 'dbt_project.yml');

    let newName: string;

    try {
      await fs.promises.access(dbtProjectYmlPath);
      const content = await fs.promises.readFile(dbtProjectYmlPath, 'utf8');
      const parsed = yaml.load(content) as { name?: string };

      if (!parsed?.name) {
        newName = name;
        await this.copyDbtTemplateFiles(projectPath, newName);
      } else {
        newName = parsed?.name as string;
      }
    } catch (error) {
      newName = name;
      await this.copyDbtTemplateFiles(projectPath, newName);
    }

    const projects = await this.loadProjects();

    const project: Project = {
      id: Date.now().toString(),
      name: newName,
      createdAt: new Date().toISOString(),
      path: projectPath,
      isExtracted: false,
    };

    const rosettaPath = path.join(projectPath, 'rosetta');

    try {
      await fs.promises.access(rosettaPath);
    } catch {
      await this.copyRosettaMainConf(projectPath);
    }

    projects.push(project);
    await this.saveProjects(projects);
    return project;
  }

  static async importProjectFromFolder(): Promise<Project> {
    const { projectsDirectory } = await SettingsService.loadSettings();
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      defaultPath: projectsDirectory,
    });

    if (result.canceled || result.filePaths.length === 0) {
      throw new Error('No folder selected');
    }

    const selectedPath = result.filePaths[0];
    const dbtProjectPath = path.join(selectedPath, 'dbt_project.yml');

    if (!fs.existsSync(dbtProjectPath)) {
      throw new Error(
        'The selected folder does not contain a dbt_project.yml file.',
      );
    }

    const fileContents = fs.readFileSync(dbtProjectPath, 'utf8');
    let dbtConfig;
    try {
      dbtConfig = yaml.load(fileContents) as { name: string };
    } catch (err) {
      throw new Error('Failed to parse dbt_project.yml');
    }

    const projectName = dbtConfig.name;
    if (!projectName) {
      throw new Error('Project name not found in dbt_project.yml');
    }

    const projects = await this.loadProjects();

    // Avoid adding the same project twice
    if (projects.find((p) => p.path === selectedPath)) {
      throw new Error('This project is already imported.');
    }

    const newProject: Project = {
      id: Date.now().toString(),
      name: projectName,
      createdAt: new Date().toISOString(),
      path: selectedPath,
      isExtracted: false,
    };

    const rosettaPath = path.join(selectedPath, 'rosetta');
    if (!fs.existsSync(rosettaPath)) {
      await this.copyRosettaMainConf(selectedPath);
    }

    projects.push(newProject);
    await this.saveProjects(projects);

    return newProject;
  }

  static async updateProject(project: Project) {
    const projects = await this.loadProjects();
    const index = projects.findIndex((p) => p.id === project.id);
    if (index === -1) return null;
    const updatedProject = { ...projects[index], ...project };
    projects[index] = updatedProject;
    await updateDatabase<'selectedProject'>('selectedProject', updatedProject);
    await this.saveProjects(projects);
    return projects;
  }

  static async deleteProject(id: string) {
    const projects = await this.loadProjects();
    const projectToDelete = projects.find((p) => p.id === id);
    if (projectToDelete) {
      if (projectToDelete.path) {
        deleteDirectory(projectToDelete.path);
      }
      const filteredProjects = projects.filter((p) => p.id !== id);
      await this.saveProjects(filteredProjects);
      return true;
    }
    return false;
  }

  static async getProjectPath(name: string) {
    return path.join(
      (await SettingsService.loadSettings()).projectsDirectory,
      name,
    );
  }

  static async getDirectoryStructure(project: Project) {
    return getDirectoryStructure(project.path);
  }

  static readFileContent(filePath: string) {
    return readFileContent(filePath);
  }

  static async saveFileContent(filePath: string, content: string) {
    await saveFileContent(filePath, content);
    if (filePath.includes('/models/') && filePath.includes('/rosetta/')) {
      try {
        const chunks = filePath.split('/dbt/models/');
        let part1 = chunks[0];
        const part2 = chunks[1];
        const projectName = part1.split('/').splice(-1)[0];
        part1 = part1.replace(`/rosetta/${projectName}`, '');
        const newPath = path.join(part1, 'models', part2);
        await saveFileContent(newPath, content);
      } catch (_) {
        /* empty */
      }
    }
    if (filePath.includes('/models/') && !filePath.includes('/rosetta/')) {
      try {
        const chunks = filePath.split('/models/');
        const part1 = chunks[0];
        const part2 = chunks[1];
        const projectName = part1.split('/').splice(-1)[0];
        const newPath = path.join(
          part1,
          'rosetta',
          projectName,
          'dbt',
          'models',
          part2,
        );
        await saveFileContent(newPath, content);
      } catch (_) {
        /* empty */
      }
    }
    return true;
  }

  static async copyDbtTemplateFiles(projectPath: string, projectName: string) {
    const targetPath = path.join(projectPath);
    const templatePath = (await SettingsService.loadSettings())
      .dbtSampleDirectory;

    fs.cpSync(templatePath, targetPath, { recursive: true });

    const dbtProjectYmlPath = path.join(targetPath, 'dbt_project.yml');
    const dbtProjectContent = fs.readFileSync(dbtProjectYmlPath, 'utf8');
    const updatedContent = dbtProjectContent.replace(
      /my_dbt_project/g,
      projectName,
    );
    fs.writeFileSync(dbtProjectYmlPath, updatedContent, 'utf8');
  }

  static async copyRosettaMainConf(projectPath: string) {
    const templatePath = (await SettingsService.loadSettings())
      .sampleRosettaMainConf;
    fs.cpSync(templatePath, path.join(projectPath, 'rosetta', 'main.conf'));
  }

  static async postRosettaDBTCopy(project: Project) {
    const baseRosettaDbtPath = path.join(project.path, 'rosetta', project.name);
    const modelYamlFilePath = path.join(baseRosettaDbtPath, 'model.yaml');
    const generatedModelsPath = path.join(baseRosettaDbtPath, 'dbt', 'models');
    const targetPath = path.join(project.path, 'models');

    if (fs.existsSync(targetPath)) {
      await fs.promises.rm(targetPath, { recursive: true, force: true });
    }
    await fs.promises.mkdir(targetPath, { recursive: true });

    if (fs.existsSync(modelYamlFilePath)) {
      await fs.promises.copyFile(
        modelYamlFilePath,
        path.join(targetPath, 'model.yaml'),
      );
    }

    if (fs.existsSync(generatedModelsPath)) {
      await this.copyRecursive(generatedModelsPath, targetPath);
    }
  }

  private static async copyRecursive(src: string, dest: string) {
    const entries = await fs.promises.readdir(src, { withFileTypes: true });

    // eslint-disable-next-line no-restricted-syntax
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        // eslint-disable-next-line no-await-in-loop
        await fs.promises.mkdir(destPath, { recursive: true });
        // eslint-disable-next-line no-await-in-loop
        await this.copyRecursive(srcPath, destPath);
      } else if (entry.isFile()) {
        // eslint-disable-next-line no-await-in-loop
        await fs.promises.copyFile(srcPath, destPath);
      }
    }
  }

  static createFolder({ filePath, name }: { filePath: string; name: string }) {
    createNewFolder(filePath, name);
  }

  static async deleteItem({ filePath }: { filePath: string }) {
    await deleteItem(filePath);
  }

  static createFile({
    filePath,
    name,
    content,
  }: {
    filePath: string;
    name: string;
    content?: string;
  }) {
    createNewFile(filePath, name, content);
  }

  static async selectProject({ projectId }: { projectId: string }) {
    const project = await this.getProject(projectId);
    await updateDatabase<'selectedProject'>('selectedProject', project);
  }

  static async extractPgSchema(connection: PostgresDBTConnection) {
    const extractor = new PGSchemaExtractor({
      user: connection.username,
      host: connection.host,
      database: connection.database,
      password: connection.password,
      port: connection.port,
    });

    await extractor.connect();

    const schema = await extractor.extractSchema();
    await extractor.disconnect();
    return schema.tables;
  }

  static async extractSnowflakeSchema(connection: SnowflakeDBTConnection) {
    const extractor = new SnowflakeExtractor({
      account: connection.account.split('.')[0],
      username: connection.username,
      password: connection.password,
      warehouse: connection.warehouse,
      database: connection.database,
      schema: connection.schema,
      role: connection.role,
    });

    await extractor.connect();

    const schema = await extractor.extractSchema();
    await extractor.disconnect();
    return schema.tables;
  }

  static async extractSchema(project: Project): Promise<Table[]> {
    const connection = project.dbtConnection;
    switch (connection?.type) {
      case 'postgres':
        return this.extractPgSchema(connection as PostgresDBTConnection);
      case 'snowflake':
        return this.extractSnowflakeSchema(
          connection as SnowflakeDBTConnection,
        );
      default:
        throw new Error(`Unsupported type ${connection?.type}"`);
    }
  }

  static async extractSchemaFromModelYaml(project: Project): Promise<Table[]> {
    const rosettaModelYamlPath = path.join(
      project.path,
      'rosetta',
      project.name,
      'model.yaml',
    );
    const res = await fs.promises.readFile(rosettaModelYamlPath, 'utf8');
    const data = yaml.load(res) as { tables: Table[]; views: Table[] };
    const tables = data?.tables ?? [];
    const views = data?.views ?? [];
    return [...tables, ...views];
  }

  static zipDirectory = async (sourcePath: string) => {
    const project = await this.getSelectedProject();
    if (!fs.existsSync(sourcePath) || !project) {
      throw new Error('Source directory does not exist');
    }
    const lastDirName = path.basename(sourcePath);

    const { filePath: zipFilePath } = await dialog.showSaveDialog({
      title: 'Save Zipped Folder',
      defaultPath: path.join(project.path, `${lastDirName}.zip`),
      filters: [
        { name: 'ZIP Archives', extensions: ['zip'] },
        { name: 'All Files', extensions: ['*'] },
      ],
      properties: ['createDirectory', 'showOverwriteConfirmation'],
    });

    if (!zipFilePath) return { cancelled: true };

    await createZipArchive(sourcePath, zipFilePath);
    return { success: true, filePath: zipFilePath };
  };
}
