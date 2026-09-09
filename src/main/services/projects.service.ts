/* eslint-disable no-restricted-syntax, no-await-in-loop */
import path from 'path';
import fs from 'fs';
import os from 'os';
import yaml from 'js-yaml';
import { dialog, net, IncomingMessage } from 'electron';
import AdmZip from 'adm-zip';
import * as tar from 'tar';
import {
  BigQueryConnection,
  DatabricksConnection,
  DuckDBConnection,
  KineticaConnection,
  PostgresConnection,
  Project,
  RedshiftConnection,
  SnowflakeConnection,
  Table,
} from '../../types/backend';
import {
  createNewFile,
  createNewFolder,
  asyncCreateNewFolder,
  copyPath,
  createZipArchive,
  deleteDirectory,
  deleteItem,
  getDirectoryStructure,
  loadDatabaseFile,
  readFileContent,
  saveFileContent,
  searchInFiles,
  updateDatabase,
} from '../utils/fileHelper';
import SettingsService from './settings.service';
import {
  BigQueryExtractor,
  DatabricksExtractor,
  DuckDBExtractor,
  KineticaExtractor,
  PGSchemaExtractor,
  RedshiftExtractor,
  SnowflakeExtractor,
} from '../extractor';
import SecureStorageService from './secureStorage.service';
import ConnectorsService from './connectors.service';
import MainDatabaseService from './mainDatabase.service';
import {
  extractPipelineRequiredEnvVars,
  RequiredEnvVarSource,
} from '../utils/pipelineEnvVars';

export default class ProjectsService {
  static async loadProjects(): Promise<Project[]> {
    const db = await loadDatabaseFile();
    const { connections } = db;
    const { projects } = db;

    return projects.map((project) => ({
      ...project,
      connection: connections.find(
        (connection) => connection.id === project.connectionId,
      )?.connection,
    }));
  }

  static async getProject(id?: string): Promise<Project | undefined> {
    const projects = await this.loadProjects();
    const project = projects.find((p) => p.id === id);
    if (project) {
      await this.updateProject({
        ...project,
        lastOpenedAt: Date.now(),
      });
      // Parse config files to populate rosettaConnection and dbtConnection
      // without regenerating the files
      try {
        const parsedConfig =
          await ConnectorsService.parseProjectConnectionFiles(project.path);
        return {
          ...project,
          rosettaConnection: parsedConfig.rosettaConnection,
          dbtConnection: parsedConfig.dbtConnection,
        };
      } catch {
        // If parsing fails, return project without these properties
        return project;
      }
    }
    return undefined;
  }

  static async getSelectedProject(): Promise<Project | undefined> {
    const db = await loadDatabaseFile();
    const selected = db.selectedProject;
    try {
      const project = await this.getProject(selected?.id);
      if (!project) {
        await updateDatabase<'selectedProject'>('selectedProject', undefined);
        return undefined;
      }
      return project;
    } catch (err) {
      // If loading the project or its configuration fails, clear selection
      await updateDatabase<'selectedProject'>('selectedProject', undefined);
      return undefined;
    }
  }

  static async saveProjects(projects: Project[]) {
    // Patch: For all projects, if the connection is bigquery and keyfile is a JSON string, store only the key name
    for (const project of projects) {
      if (
        project.connection &&
        project.connection.type === 'bigquery' &&
        project.connection.keyfile &&
        project.connection.keyfile.startsWith('{')
      ) {
        project.connection.keyfile = `db-bigquery-${project.connection.name}`;
      }
    }
    await updateDatabase<'projects'>('projects', projects);
  }

  static async addProject(
    projectPath: string,
    connectionId?: string,
    createTemplateFolders?: boolean,
  ) {
    const projects = await this.loadProjects();
    const name = path.basename(projectPath);

    const project: Project = {
      id: Date.now().toString(),
      name,
      createdAt: new Date().toISOString(),
      path: projectPath,
      isExtracted: false,
      connectionId,
      createTemplateFolders,
    };

    // Patch: If the project has a bigquery connection, store only the key name
    if (project.connection && project.connection.type === 'bigquery') {
      if (
        project.connection.keyfile &&
        project.connection.keyfile.startsWith('{')
      ) {
        project.connection.keyfile = `db-bigquery-${project.connection.name}`;
      }
    }
    await this.copyDbtTemplateFiles(project.path, project.name);
    // Always copy main.conf template (rosetta requires it), but profiles.yml is excluded from template
    await this.copyRosettaMainConf(project.path);
    if (createTemplateFolders) {
      await this.createDbtTemplateFolderStructure(project.path);
    }
    projects.push(project);
    await this.saveProjects(projects);

    // If connection is selected, generate config files
    if (connectionId) {
      await ConnectorsService.loadConfigurations(project.id);
    }

    return (await this.getProject(project.id)) ?? project;
  }

  static async addProjectFromVCS({
    path: projectPath,
    name,
    connectionId,
  }: {
    path: string;
    name: string;
    connectionId?: string;
  }) {
    const dbtProjectYmlPath = path.join(projectPath, 'dbt_project.yml');

    let newName: string;

    try {
      await fs.promises.access(dbtProjectYmlPath);
      const content = await fs.promises.readFile(dbtProjectYmlPath, 'utf8');
      const parsed = yaml.load(content) as { name?: string; profile?: string };

      // Always use the repository name for GitHub imports, but convert hyphens to underscores
      newName = name.replace(/-/g, '_');

      // Update dbt_project.yml to use the repository name and correct profile
      if (parsed) {
        parsed.name = newName;
        parsed.profile = newName; // Set profile to match the project name
        await fs.promises.writeFile(
          dbtProjectYmlPath,
          yaml.dump(parsed),
          'utf8',
        );
      }
    } catch (error) {
      // If we can't read dbt_project.yml, use the repository name
      newName = name;
    }

    const projects = await this.loadProjects();

    // Check if project name already exists and make it unique if needed
    let finalProjectName = newName;
    const isNameTaken = (projectName: string) =>
      projects.some((p) => p.name === projectName && p.path !== projectPath);

    while (isNameTaken(finalProjectName)) {
      // Generate a random 6-digit number
      const randomNumber = Math.floor(100000 + Math.random() * 900000);
      finalProjectName = `${newName}_${randomNumber}`;
    }

    if (finalProjectName !== newName) {
      // eslint-disable-next-line no-console
      console.log(
        `Project name changed from "${newName}" to "${finalProjectName}" to avoid conflict`,
      );
    }

    const project: Project = {
      id: Date.now().toString(),
      name: finalProjectName,
      createdAt: new Date().toISOString(),
      path: projectPath,
      isExtracted: false,
      connectionId,
    };

    // Patch: If the project has a bigquery connection, store only the key name
    if (project.connection && project.connection.type === 'bigquery') {
      if (
        project.connection.keyfile &&
        project.connection.keyfile.startsWith('{')
      ) {
        project.connection.keyfile = `db-bigquery-${project.connection.name}`;
      }
    }

    const rosettaPath = path.join(projectPath, 'rosetta');

    try {
      await fs.promises.access(rosettaPath);
    } catch {
      // Always copy main.conf template (rosetta requires it)
      await this.copyRosettaMainConf(projectPath);
    }

    projects.push(project);
    await this.saveProjects(projects);

    // If connection is selected, generate config files
    if (connectionId) {
      await ConnectorsService.loadConfigurations(project.id);
    } else {
      // Don't create empty profiles.yml - it will be generated when connection is configured
      // For existing profiles.yml, update project name if needed
      const profilesYmlPath = path.join(projectPath, 'profiles.yml');
      if (fs.existsSync(profilesYmlPath)) {
        await this.updateProfilesYmlProjectName(projectPath, finalProjectName);
      }
    }

    return project;
  }

  static async detectFileType(
    filePath: string,
  ): Promise<'folder' | 'zip' | 'tar'> {
    const stats = await fs.promises.stat(filePath);

    if (stats.isDirectory()) {
      return 'folder';
    }

    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.zip') return 'zip';
    if (ext === '.tar' || ext === '.tgz' || filePath.endsWith('.tar.gz'))
      return 'tar';

    throw new Error(
      'Unsupported file type. Please select a folder, ZIP, or TAR file.',
    );
  }

  static async extractCompressedFile(filePath: string): Promise<string> {
    const fileType = await this.detectFileType(filePath);
    const extractPath = path.join(os.tmpdir(), `dbt-extract-${Date.now()}`);

    // Create extraction directory
    await fs.promises.mkdir(extractPath, { recursive: true });

    try {
      switch (fileType) {
        case 'zip':
          return await this.extractZip(filePath, extractPath);
        case 'tar':
          return await this.extractTar(filePath, extractPath);
        default:
          throw new Error('Unsupported file type');
      }
    } catch (error) {
      // Clean up extraction directory on error
      try {
        await fs.promises.rm(extractPath, { recursive: true, force: true });
      } catch (cleanupError) {
        // eslint-disable-next-line no-console
        console.error('Failed to clean up extraction directory:', cleanupError);
      }
      throw error;
    }
  }

  static async extractZip(
    filePath: string,
    extractPath: string,
  ): Promise<string> {
    const zip = new AdmZip(filePath);
    zip.extractAllTo(extractPath, true);

    // Find the dbt project directory (could be nested)
    const projectDir = await this.findDbtProjectDirectory(extractPath);
    if (!projectDir) {
      throw new Error('No valid dbt project found in the ZIP file');
    }

    return projectDir;
  }

  static async extractTar(
    filePath: string,
    extractPath: string,
  ): Promise<string> {
    await tar.extract({
      file: filePath,
      cwd: extractPath,
    });

    // Find the dbt project directory (could be nested)
    const projectDir = await this.findDbtProjectDirectory(extractPath);
    if (!projectDir) {
      throw new Error('No valid dbt project found in the TAR file');
    }

    return projectDir;
  }

  static async findDbtProjectDirectory(
    rootPath: string,
  ): Promise<string | null> {
    // First, check if the root directory itself is a dbt project
    const rootDbtProjectPath = path.join(rootPath, 'dbt_project.yml');
    if (fs.existsSync(rootDbtProjectPath)) {
      return rootPath;
    }

    // Search for dbt_project.yml in subdirectories
    const searchDbtProject = async (dir: string): Promise<string | null> => {
      try {
        const entries = await fs.promises.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          if (entry.isDirectory()) {
            const subDir = path.join(dir, entry.name);
            const dbtProjectPath = path.join(subDir, 'dbt_project.yml');

            if (fs.existsSync(dbtProjectPath)) {
              return subDir;
            }

            // Recursively search subdirectories
            const found = await searchDbtProject(subDir);
            if (found) {
              return found;
            }
          }
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Error searching directory:', error);
      }

      return null;
    };

    return searchDbtProject(rootPath);
  }

  /**
   * Find the actual dbt project root directory by searching for dbt_project.yml
   * Handles nested directory structures (e.g., from cloned repos or zips)
   * Recursively searches subdirectories
   */
  static async findDbtProjectRoot(startPath: string): Promise<string | null> {
    const searchRecursively = async (
      currentPath: string,
    ): Promise<string | null> => {
      try {
        const entries = fs.readdirSync(currentPath, { withFileTypes: true });

        // Check if dbt_project.yml exists in current directory
        const hasDbtProject = entries.some(
          (entry) => entry.isFile() && entry.name === 'dbt_project.yml',
        );

        if (hasDbtProject) {
          return currentPath;
        }

        // Search in subdirectories (skip hidden directories)
        // eslint-disable-next-line no-restricted-syntax
        for (const entry of entries) {
          if (entry.isDirectory() && !entry.name.startsWith('.')) {
            const subdirPath = path.join(currentPath, entry.name);
            // eslint-disable-next-line no-await-in-loop
            const result = await searchRecursively(subdirPath);
            if (result) {
              return result;
            }
          }
        }

        return null;
      } catch {
        // Handle permission errors or other issues
        return null;
      }
    };

    return searchRecursively(startPath);
  }

  static async validateDbtProject(projectPath: string): Promise<{
    isValid: boolean;
    projectName?: string;
    errors: string[];
  }> {
    const errors: string[] = [];
    let projectName: string | undefined;

    try {
      // Check if dbt_project.yml exists at root or in nested directory
      const dbtProjectPath = path.join(projectPath, 'dbt_project.yml');
      if (!fs.existsSync(dbtProjectPath)) {
        errors.push('dbt_project.yml file not found at expected location');
        return { isValid: false, errors };
      }

      // Parse and validate dbt_project.yml
      const fileContents = fs.readFileSync(dbtProjectPath, 'utf8');
      let dbtConfig;
      try {
        dbtConfig = yaml.load(fileContents) as { name?: string };
      } catch (err) {
        errors.push('Failed to parse dbt_project.yml');
        return { isValid: false, errors };
      }

      if (!dbtConfig?.name) {
        errors.push('Project name not found in dbt_project.yml');
        return { isValid: false, errors };
      }

      projectName = dbtConfig.name;

      // Check for common dbt directories (optional but recommended)
      const commonDirs = ['models', 'macros', 'tests', 'seeds'];
      const missingDirs = commonDirs.filter(
        (dir) => !fs.existsSync(path.join(projectPath, dir)),
      );

      if (missingDirs.length === commonDirs.length) {
        errors.push(
          'No common dbt directories found (models, macros, tests, seeds). This might not be a valid dbt project.',
        );
      }

      return { isValid: true, projectName, errors };
    } catch (error: unknown) {
      if (error instanceof Error) {
        errors.push(`Validation error: ${error.message}`);
      } else {
        errors.push('Validation error: Unknown error');
      }
      return { isValid: false, errors };
    }
  }

  static async importProjectFromFolder(): Promise<Project> {
    const { projectsDirectory } = await SettingsService.loadSettings();
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'openDirectory'],
      filters: [
        { name: 'All Supported', extensions: ['*'] },
        { name: 'Folders', extensions: [''] },
        { name: 'ZIP Files', extensions: ['zip'] },
        { name: 'TAR Files', extensions: ['tar', 'tar.gz', 'tgz'] },
      ],
      defaultPath: projectsDirectory,
    });

    if (result.canceled || result.filePaths.length === 0) {
      throw new Error('No file or folder selected');
    }

    const selectedPath = result.filePaths[0];
    let projectPath: string = '';
    let isExtracted = false;

    try {
      // Handle compressed files
      const fileType = await this.detectFileType(selectedPath);
      if (fileType === 'folder') {
        projectPath = selectedPath;
      } else {
        projectPath = await this.extractCompressedFile(selectedPath);
        isExtracted = true;
      }

      // Find the actual dbt project root (handles nested directories)
      const dbtRoot = await this.findDbtProjectRoot(projectPath);
      if (!dbtRoot) {
        throw new Error(
          'No dbt_project.yml found. Please ensure this is a valid dbt project.',
        );
      }
      projectPath = dbtRoot;

      // Validate the dbt project
      const validation = await this.validateDbtProject(projectPath);
      if (!validation.isValid) {
        throw new Error(`Invalid dbt project: ${validation.errors.join(', ')}`);
      }

      // Use the folder name as the primary source, with fallback to dbt_project.yml
      const folderName = path.basename(projectPath);
      let projectName = folderName.replace(/-/g, '_');

      // Only use dbt_project.yml name if folder name is generic (like 'my_new_project')
      if (
        validation.projectName &&
        (folderName === 'my_new_project' ||
          folderName === 'my_dbt_project' ||
          folderName.startsWith('dbt_project'))
      ) {
        projectName = validation.projectName.replace(/-/g, '_');
      }

      const projects = await this.loadProjects();

      // Check if project is already imported (by path)
      if (projects.find((p) => p.path === projectPath)) {
        throw new Error('This project is already imported.');
      }

      // Check if project name already exists and make it unique if needed
      let finalProjectName = projectName;
      const isNameTaken = (name: string) =>
        projects.some((p) => p.name === name && p.path !== projectPath);

      while (isNameTaken(finalProjectName)) {
        // Generate a random 6-digit number
        const randomNumber = Math.floor(100000 + Math.random() * 900000);
        finalProjectName = `${projectName}_${randomNumber}`;
      }

      if (finalProjectName !== projectName) {
        // eslint-disable-next-line no-console
        console.log(
          `Project name changed from "${projectName}" to "${finalProjectName}" to avoid conflict`,
        );
      }

      // Update dbt_project.yml to use the correct project name and profile
      const dbtProjectYmlPath = path.join(projectPath, 'dbt_project.yml');
      try {
        const content = await fs.promises.readFile(dbtProjectYmlPath, 'utf8');
        const parsed = yaml.load(content) as {
          name?: string;
          profile?: string;
        };

        if (parsed) {
          parsed.name = finalProjectName;
          parsed.profile = finalProjectName; // Set profile to match the project name
          await fs.promises.writeFile(
            dbtProjectYmlPath,
            yaml.dump(parsed),
            'utf8',
          );
          // eslint-disable-next-line no-console
          console.log(
            `Updated dbt_project.yml: name='${finalProjectName}', profile='${finalProjectName}'`,
          );
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to update dbt_project.yml:', error);
      }

      const newProject: Project = {
        id: Date.now().toString(),
        name: finalProjectName,
        createdAt: new Date().toISOString(),
        path: projectPath,
        isExtracted,
      };

      // Always copy main.conf template if rosetta folder doesn't exist (rosetta requires it)
      const rosettaPath = path.join(projectPath, 'rosetta');
      if (!fs.existsSync(rosettaPath)) {
        await this.copyRosettaMainConf(projectPath);
      }

      projects.push(newProject);
      await this.saveProjects(projects);

      // Don't create empty profiles.yml - it will be generated when connection is configured
      // For existing profiles.yml, update project name if needed
      const profilesYmlPath = path.join(projectPath, 'profiles.yml');
      if (fs.existsSync(profilesYmlPath)) {
        await this.updateProfilesYmlProjectName(projectPath, finalProjectName);
      }

      return newProject;
    } catch (error) {
      // Clean up extracted files if there was an error
      if (
        typeof projectPath !== 'undefined' &&
        typeof projectPath === 'string' &&
        isExtracted &&
        projectPath.startsWith(os.tmpdir())
      ) {
        try {
          await fs.promises.rm(projectPath, { recursive: true, force: true });
        } catch (cleanupError) {
          // eslint-disable-next-line no-console
          console.error('Failed to clean up extracted files:', cleanupError);
        }
      }
      throw error;
    }
  }

  static async updateProject(project: Project) {
    const projects = await this.loadProjects();
    const index = projects.findIndex((p) => p.id === project.id);
    if (index === -1) return null;

    // Check if connectionId is changing
    const oldConnectionId = projects[index].connectionId;
    const newConnectionId = project.connectionId;
    const connectionChanged = oldConnectionId !== newConnectionId;

    const updatedProject = { ...projects[index], ...project };

    // Patch: If the project has a bigquery connection, store only the key name
    if (
      updatedProject.connection &&
      updatedProject.connection.type === 'bigquery'
    ) {
      if (
        updatedProject.connection.keyfile &&
        updatedProject.connection.keyfile.startsWith('{')
      ) {
        updatedProject.connection.keyfile = `db-bigquery-${updatedProject.connection.name}`;
      }
    }

    projects[index] = updatedProject;
    await updateDatabase<'selectedProject'>('selectedProject', updatedProject);
    await this.saveProjects(projects);

    // Only regenerate config files if the connection changed
    // This is a full regeneration because it's switching to a different connection
    if (connectionChanged && newConnectionId) {
      await ConnectorsService.loadConfigurations(project.id);
    }

    return projects;
  }

  static async deleteProject(id: string) {
    const projects = await this.loadProjects();
    const projectToDelete = projects.find((p) => p.id === id);
    if (projectToDelete) {
      if (projectToDelete.path) {
        deleteDirectory(projectToDelete.path);
      }
      const selectedProject = await this.getSelectedProject();
      if (selectedProject) {
        if (selectedProject.id === id) {
          await updateDatabase('selectedProject', undefined);
        }
      }

      const filteredProjects = projects.filter((p) => p.id !== id);
      await this.saveProjects(filteredProjects);

      // Only clean up AI chats after the project deletion is persisted.
      try {
        const projectIdNum = parseInt(id, 10);
        if (!Number.isNaN(projectIdNum)) {
          await MainDatabaseService.deleteConversationsByProject(projectIdNum);
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('[ProjectsService] Failed to clean up AI chats:', error);
      }

      return true;
    }
    return false;
  }

  // Removes a project from Studio's known-projects list without touching
  // its folder on disk — unlike deleteProject, which also deletes the
  // folder and the project's AI chat history.
  static async removeProjectFromList(id: string) {
    const projects = await this.loadProjects();
    const projectToRemove = projects.find((p) => p.id === id);
    if (projectToRemove) {
      const selectedProject = await this.getSelectedProject();
      if (selectedProject && selectedProject.id === id) {
        await updateDatabase('selectedProject', undefined);
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

  static async getDirectoryStructure(body: { path: string }) {
    return getDirectoryStructure(body.path);
  }

  static readFileContent(filePath: string) {
    return readFileContent(filePath);
  }

  static searchInFiles(body: {
    path: string;
    query: string;
    caseSensitive?: boolean;
    useRegex?: boolean;
  }) {
    return searchInFiles(body.path, body.query, {
      caseSensitive: body.caseSensitive,
      useRegex: body.useRegex,
    });
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

    // Copy template files excluding profiles.yml (will be generated when connection is configured)
    fs.cpSync(templatePath, targetPath, {
      recursive: true,
      filter: (source) => {
        // Exclude profiles.yml from template copy
        return !source.endsWith('profiles.yml');
      },
    });

    const dbtProjectYmlPath = path.join(targetPath, 'dbt_project.yml');
    const dbtProjectContent = fs.readFileSync(dbtProjectYmlPath, 'utf8');
    const updatedContent = dbtProjectContent.replace(
      /my_dbt_project/g,
      projectName,
    );
    fs.writeFileSync(dbtProjectYmlPath, updatedContent, 'utf8');
  }

  static async createDbtTemplateFolderStructure(projectPath: string) {
    const dbtFoldersToCreate = [
      'analysis',
      'seeds',
      'macros',
      'models',
      'snapshots',
      'tests',
    ];
    for (const folderName of dbtFoldersToCreate) {
      await createNewFolder(projectPath, folderName);
    }
  }

  static async copyRosettaMainConf(projectPath: string) {
    const templatePath = (await SettingsService.loadSettings())
      .sampleRosettaMainConf;
    fs.cpSync(templatePath, path.join(projectPath, 'rosetta', 'main.conf'));
  }

  static async createEmptyProfilesYml(
    projectPath: string,
    projectName: string,
  ) {
    const profilesYmlPath = path.join(projectPath, 'profiles.yml');

    const emptyProfilesConfig = {
      config: {
        send_anonymous_usage_stats: false,
        partial_parse: true,
      },
      [projectName]: {
        target: 'dev',
        outputs: {
          dev: {
            type: '',
            host: '',
            port: '',
            user: '',
            password: '',
            dbname: '',
            schema: '',
            _comment: 'Add your database connection details here',
            _example:
              'Example for PostgreSQL: type: postgres, host: localhost, port: 5432, user: your_username, password: your_password, dbname: your_database, schema: public',
          },
        },
      },
    };

    await fs.promises.writeFile(
      profilesYmlPath,
      yaml.dump(emptyProfilesConfig),
      'utf8',
    );
  }

  static async updateProfilesYmlProjectName(
    projectPath: string,
    projectName: string,
  ) {
    const profilesYmlPath = path.join(projectPath, 'profiles.yml');

    try {
      const profilesYmlContent = await fs.promises.readFile(
        profilesYmlPath,
        'utf8',
      );
      const profilesYmlConfig = yaml.load(profilesYmlContent) as {
        [key: string]: {
          target: string;
          outputs: {
            [key: string]: any;
          };
        };
      };

      // Find the old profile name (any key that's not 'config')
      const oldProfileName = Object.keys(profilesYmlConfig).find(
        (key) => key !== 'config',
      );

      if (oldProfileName && oldProfileName !== projectName) {
        // Create new config with updated profile name
        const updatedConfig = {
          config: profilesYmlConfig.config,
          [projectName]: profilesYmlConfig[oldProfileName],
        };

        await fs.promises.writeFile(
          profilesYmlPath,
          yaml.dump(updatedConfig),
          'utf8',
        );
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to update profiles.yml:', error);
    }
  }

  static async postRosettaDBTCopy(project: Project) {
    const baseRosettaDbtPath = path.join(project.path, 'rosetta', project.name);
    const modelYamlFilePath = path.join(baseRosettaDbtPath, 'model.yaml');
    const generatedModelsPath = path.join(baseRosettaDbtPath, 'dbt', 'models');
    const targetPath = path.join(project.path, 'models');

    if (fs.existsSync(targetPath)) {
      await fs.promises.rm(targetPath, {
        recursive: true,
        force: true,
        maxRetries: 3,
        retryDelay: 100,
      });
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

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        await fs.promises.mkdir(destPath, { recursive: true });
        await this.copyRecursive(srcPath, destPath);
      } else if (entry.isFile()) {
        await fs.promises.copyFile(srcPath, destPath);
      }
    }
  }

  static createFolder({ filePath, name }: { filePath: string; name: string }) {
    createNewFolder(filePath, name);
  }

  // Awaitable counterpart to createFolder — use when the folder must exist
  // on disk before a subsequent write into it (e.g. writing a file right
  // after creating its parent directory).
  static async createFolderAsync({
    filePath,
    name,
  }: {
    filePath: string;
    name: string;
  }) {
    await asyncCreateNewFolder(filePath, name);
  }

  static copyPath({ source, target }: { source: string; target: string }) {
    copyPath(source, target);
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
  }): string | undefined {
    return createNewFile(filePath, name, content);
  }

  static async renamePath({
    path: source,
    newName,
  }: {
    path: string;
    newName: string;
  }): Promise<string> {
    const { renamePath } = await import('../utils/fileHelper');
    return renamePath(source, newName);
  }

  static async selectProject({ projectId }: { projectId: string }) {
    const project = await this.getProject(projectId);
    await updateDatabase<'selectedProject'>('selectedProject', project);
  }

  static async extractPgSchema(connection: PostgresConnection) {
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

  static async extractSnowflakeSchema(connection: SnowflakeConnection) {
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

  static async extractSchemaDatabricks(connection: DatabricksConnection) {
    const extractor = new DatabricksExtractor({
      token: connection.token,
      host: connection.host,
      path: connection.httpPath,
      catalog: connection.database || 'default',
      schema: connection.schema,
    });

    await extractor.connect();
    const schema = await extractor.extractSchema();
    await extractor.disconnect();
    return schema.tables;
  }

  static async extractBigQuerySchema(connection: BigQueryConnection) {
    const config: any = {
      projectId: connection.project,
    };

    let keyfileValue = connection.keyfile;
    if (
      typeof keyfileValue === 'string' &&
      keyfileValue.startsWith('db-bigquery-')
    ) {
      // Fetch from secure storage
      const stored = await SecureStorageService.getCredential(keyfileValue);
      if (!stored) {
        throw new Error(
          'BigQuery service account key not found in secure storage',
        );
      }
      keyfileValue = stored;
    }

    try {
      config.credentials = JSON.parse(keyfileValue);
    } catch (err) {
      throw new Error('Invalid service account key JSON');
    }

    if (connection.location) {
      config.location = connection.location;
    }

    const extractor = new BigQueryExtractor(config);
    await extractor.connect();
    const schema = await extractor.extractSchema();
    return schema.tables;
  }

  static async extractDuckDBSchema(connection: DuckDBConnection) {
    const extractor = new DuckDBExtractor({
      database_path: connection.database_path,
      schema: connection.schema,
    });

    const schema = await extractor.extractSchema();
    return schema.tables;
  }

  static async extractRedshiftSchema(connection: RedshiftConnection) {
    const extractor = new RedshiftExtractor({
      user: connection.username,
      host: connection.host,
      database: connection.database,
      password: connection.password,
      port: connection.port,
      ssl: connection.ssl ?? true,
      sslrootcert: connection.sslrootcert,
    });

    await extractor.connect();
    const schema = await extractor.extractSchema();
    await extractor.disconnect();
    return schema.tables;
  }

  static async extractKineticaSchema(connection: KineticaConnection) {
    const extractor = new KineticaExtractor({
      host: connection.host,
      port: connection.port,
      username: connection.username,
      password: connection.password,
      useSSL: connection.useSSL,
      timeout: connection.timeout,
      schema: connection.schema,
    });

    await extractor.connect();
    const schema = await extractor.extractSchema();
    await extractor.disconnect();
    return schema.tables;
  }

  static async extractSchema(project: Project): Promise<Table[]> {
    if (!project.connectionId) {
      throw new Error('No database connection configured for this project');
    }

    const conn = await ConnectorsService.getConnectionById(
      project.connectionId!,
    );

    if (!conn) {
      throw new Error(`Connection with id ${project.connectionId} not found`);
    }

    const { connection } = conn;

    if (!connection.type) {
      throw new Error(
        'Database connection type is not defined. Please reconfigure your connection.',
      );
    }

    const storeUser = await SecureStorageService.getCredential(
      `db-user-${connection.name}`,
    );
    const storePassword = await SecureStorageService.getCredential(
      `db-password-${connection.name}`,
    );

    if (storeUser) {
      (connection as { username: string }).username = storeUser;
    }
    if (storePassword) {
      (connection as { password: string }).password = storePassword;
    }

    const storeToken = await SecureStorageService.getCredential(
      `db-token-${project.name}`,
    );
    if (storeToken) {
      (connection as { token: string }).token = storeToken;
    }

    const bigqueryKey = await SecureStorageService.getCredential(
      `db-bigquery-${project.name}`,
    );

    if (bigqueryKey) {
      (connection as { keyfile: string }).keyfile = bigqueryKey;
    }

    switch (connection.type) {
      case 'postgres':
        return this.extractPgSchema(connection as PostgresConnection);
      case 'redshift':
        return this.extractRedshiftSchema(connection as RedshiftConnection);
      case 'snowflake':
        return this.extractSnowflakeSchema(connection as SnowflakeConnection);
      case 'databricks':
        return this.extractSchemaDatabricks(connection as DatabricksConnection);
      case 'bigquery':
        return this.extractBigQuerySchema(connection as BigQueryConnection);
      case 'duckdb':
        return this.extractDuckDBSchema(connection as DuckDBConnection);
      case 'ducklake':
        throw new Error(
          'Schema extraction is not supported for DuckLake connections. DuckLake projects use dynamic data lake catalogs.',
        );
      case 'kinetica':
        return this.extractKineticaSchema(connection as KineticaConnection);
      default:
        throw new Error(
          `Unsupported connection type: "${(connection as any).type}"`,
        );
    }
  }

  static async updateQuery({
    projectId,
    query,
  }: {
    projectId: string;
    query: string;
  }): Promise<void> {
    const db = await loadDatabaseFile();
    const queries = db.queries ?? {};
    queries[projectId] = query;
    await updateDatabase('queries', queries);
  }

  static async getQuery(project: Project): Promise<string> {
    const db = await loadDatabaseFile();
    return db.queries?.[project.id] ?? '';
  }

  static async extractSchemaFromModelYaml(project: Project): Promise<Table[]> {
    const rosettaModelYamlPath = path.join(
      project.path,
      'rosetta',
      project.name,
      'model.yaml',
    );

    try {
      // If the file does not exist, return an empty list instead of throwing
      if (!fs.existsSync(rosettaModelYamlPath)) {
        return [];
      }

      const res = await fs.promises.readFile(rosettaModelYamlPath, 'utf8');
      const data = yaml.load(res) as { tables: Table[]; views: Table[] };
      const tables = data?.tables ?? [];
      const views = data?.views ?? [];
      return [...tables, ...views];
    } catch {
      // On any error (e.g. parse, permissions), fail gracefully
      return [];
    }
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

  static async chooseDir(_path: string) {
    const result = await dialog.showOpenDialog({
      defaultPath: _path,
      properties: ['openDirectory'],
    });

    return result.canceled ? 'false' : result.filePaths[0];
  }

  static downloadSeed = async ({
    objectUrl,
    project,
  }: {
    objectUrl: string;
    project: Project;
  }) => {
    // create seeds folder if missing
    const seedFolder = path.join(project.path, 'seeds');
    if (!fs.existsSync(seedFolder)) {
      createNewFolder(project.path, 'seeds');
    }
    const downloadRequest = net.request(objectUrl);
    const response: IncomingMessage = await new Promise((resolve, reject) => {
      downloadRequest.on('response', resolve);
      downloadRequest.on('error', reject);
      downloadRequest.end();
    });
    if (response.statusCode !== 200) {
      throw new Error(`Download seed error ${response.statusCode}`);
    }
    const filename: string = path.basename(new URL(objectUrl).pathname);
    const savePath = path.join(seedFolder, filename);
    const fileStream = fs.createWriteStream(savePath);
    // Pipe stream manually with async control
    await new Promise<void>((resolve, reject) => {
      response.on('data', (chunk) => fileStream.write(chunk));
      response.on('end', () => {
        fileStream.end();
        resolve();
      });
      response.on('error', (err: Error) => {
        fileStream.destroy();
        reject(err);
      });
      fileStream.on('error', reject);
    });
    return { success: true, filePath: savePath, filename };
  };

  /**
   * Extract env_var references from a project's profiles.yml
   */
  static async extractProfileEnvVars(
    projectId: string,
  ): Promise<{ name: string; value?: string }[]> {
    const project = await this.getProject(projectId);
    if (!project) throw new Error('Project not found');

    const profilesPath = path.join(project.path, 'profiles.yml');
    if (!fs.existsSync(profilesPath)) return [];

    const content = await fs.promises.readFile(profilesPath, 'utf8');
    const envVarRegex = /env_var\(\s*["']([^"']+)["']/g;
    const vars = new Set<string>();
    let match = envVarRegex.exec(content);
    while (match) {
      vars.add(match[1]);
      match = envVarRegex.exec(content);
    }

    return Array.from(vars)
      .sort()
      .map((name) => ({ name }));
  }

  /**
   * Extract every env var a local run of a pipeline is likely to need:
   * profiles.yml env_var() references plus, when a pipeline is given,
   * TF_VAR_* names for any terraform@v1 step's declared variables and
   * shell-style var references found in any step's command.
   */
  static async extractRequiredEnvVars(
    projectId: string,
    pipelineRelativePath?: string,
  ): Promise<
    { name: string; value?: string; sources: RequiredEnvVarSource[] }[]
  > {
    const project = await this.getProject(projectId);
    if (!project) throw new Error('Project not found');

    const profileVars = await this.extractProfileEnvVars(projectId);
    const combined = new Map<
      string,
      { name: string; value?: string; sources: RequiredEnvVarSource[] }
    >();
    profileVars.forEach((v) => {
      combined.set(v.name, { ...v, sources: ['profile'] });
    });

    if (pipelineRelativePath) {
      // pipelineRelativePath is relative to the pipeline root (rosetta/pipelines/,
      // with .rosetta/ as the deprecated fallback), not the project root - it's
      // produced by getPipelineRelativeName / listPipelines, neither of which
      // include that root prefix.
      const canonicalPath = path.join(
        project.path,
        'rosetta',
        'pipelines',
        pipelineRelativePath,
      );
      const legacyPath = path.join(
        project.path,
        '.rosetta',
        pipelineRelativePath,
      );
      const pipelineAbsolutePath = fs.existsSync(canonicalPath)
        ? canonicalPath
        : legacyPath;
      const pipelineVars = await extractPipelineRequiredEnvVars(
        project.path,
        pipelineAbsolutePath,
      );
      pipelineVars.forEach((v) => {
        const existing = combined.get(v.name);
        if (existing) {
          existing.sources = Array.from(
            new Set([...existing.sources, ...v.sources]),
          );
        } else {
          combined.set(v.name, { name: v.name, sources: v.sources });
        }
      });
    }

    return Array.from(combined.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }

  /**
   * Recursively lists pipeline YAML files under a directory, ignoring
   * non-pipeline yaml files such as main.conf. `name` is the path relative to
   * `baseDir` (POSIX-style, extension stripped) so pipelines nested in
   * subdirectories keep their directory prefix, e.g. `test/test` for
   * `<baseDir>/test/test.yml`.
   */
  private static async listPipelineFilesInDir(
    dir: string,
    baseDir: string = dir,
  ): Promise<{ name: string; path: string }[]> {
    if (!fs.existsSync(dir)) return [];

    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    const results: { name: string; path: string }[] = [];

    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const nested = await this.listPipelineFilesInDir(entryPath, baseDir);
        results.push(...nested);
      } else if (
        (entry.name.endsWith('.yml') || entry.name.endsWith('.yaml')) &&
        entry.name !== 'main.conf'
      ) {
        const relative = path
          .relative(baseDir, entryPath)
          .replace(/\\/g, '/')
          .replace(/\.(yml|yaml)$/, '');
        results.push({ name: relative, path: entryPath });
      }
    }

    return results;
  }

  /**
   * List pipeline YAML files under rosetta/pipelines/ (current location) and
   * .rosetta/ (deprecated location, kept during the transition to
   * rosetta/pipelines/ — remove once existing projects have migrated).
   */
  static async listPipelines(
    projectId: string,
  ): Promise<{ name: string; path: string }[]> {
    const project = await this.getProject(projectId);
    if (!project) throw new Error('Project not found');

    const pipelinesDir = path.join(project.path, 'rosetta', 'pipelines');
    const legacyPipelinesDir = path.join(project.path, '.rosetta');

    const [current, legacy] = await Promise.all([
      this.listPipelineFilesInDir(pipelinesDir),
      this.listPipelineFilesInDir(legacyPipelinesDir),
    ]);

    const currentNames = new Set(current.map((p) => p.name));
    return [...current, ...legacy.filter((p) => !currentNames.has(p.name))];
  }
}
