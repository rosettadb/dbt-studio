import {
  AnalyticsPage,
  NewAnalyticsPage,
  UpdateAnalyticsPage,
} from '../../types/analyticsPages';
import databaseStore from '../database';
import MainDatabaseService from './mainDatabase.service';
import {
  createProjectPage,
  deleteProjectPage,
  getProjectPage,
  listProjectPages,
  updateProjectPage,
} from '../utils/projectAnalyticsPages';
import {
  parseProjectPageId,
  type SaveLocation,
} from '../../shared/projectFolders';

/** The project linked to a connection, whose analytics/ folder it lists. */
async function linkedProject(connectionId: string) {
  const { projects } = await databaseStore.getSnapshot();
  return projects.find((p) => p.connectionId === connectionId && !!p.path);
}

async function projectPathById(projectId: string): Promise<string> {
  const { projects } = await databaseStore.getSnapshot();
  const project = projects.find((p) => p.id === projectId);
  if (!project?.path) throw new Error('Project not found');
  return project.path;
}

/**
 * Pages live in the app database ("Local"), or as Markdown files in
 * the analytics/ folder of the project linked to the connection (plan 95d).
 * Project page ids start with `pap:` and are routed to the folder; every
 * caller (screens, the Analytics agent, the static site build) gets both.
 */
export class AnalyticsPagesService {
  static async list(connectionId: string): Promise<AnalyticsPage[]> {
    const [studioPages, project] = await Promise.all([
      MainDatabaseService.getAnalyticsPages(connectionId),
      linkedProject(connectionId),
    ]);
    if (!project) return studioPages;
    const projectPages = await listProjectPages(
      project.id,
      project.path,
      connectionId,
    ).catch((error) => {
      // eslint-disable-next-line no-console
      console.error('Failed to read project analytics pages:', error);
      return [];
    });
    return [...projectPages, ...studioPages];
  }

  static async get(
    connectionId: string,
    pageId: string,
  ): Promise<AnalyticsPage> {
    const projectPage = parseProjectPageId(pageId);
    if (projectPage) {
      return getProjectPage(
        pageId,
        await projectPathById(projectPage.projectId),
        connectionId,
      );
    }
    return MainDatabaseService.getAnalyticsPage(connectionId, pageId);
  }

  static async create(
    connectionId: string,
    data: NewAnalyticsPage,
    location: SaveLocation = 'studio',
  ): Promise<AnalyticsPage> {
    if (!data.routePath.startsWith('/')) {
      throw new Error('routePath must start with /');
    }

    if (location === 'project') {
      const project = await linkedProject(connectionId);
      if (!project) {
        throw new Error('This connection has no project to save pages in');
      }
      return createProjectPage(
        project.id,
        project.path,
        connectionId,
        data.routePath,
        data.markdownContent,
      );
    }
    return MainDatabaseService.createAnalyticsPage(connectionId, data);
  }

  static async update(
    connectionId: string,
    pageId: string,
    updates: UpdateAnalyticsPage,
  ): Promise<AnalyticsPage> {
    if (updates.routePath !== undefined && !updates.routePath.startsWith('/')) {
      throw new Error('routePath must start with /');
    }

    const projectPage = parseProjectPageId(pageId);
    if (projectPage) {
      // The title lives in the markdown's frontmatter and the route in the
      // file path, so only the markdown is written
      return updateProjectPage(
        pageId,
        await projectPathById(projectPage.projectId),
        connectionId,
        updates.markdownContent,
      );
    }
    return MainDatabaseService.updateAnalyticsPage(
      connectionId,
      pageId,
      updates,
    );
  }

  static async delete(connectionId: string, pageId: string): Promise<void> {
    const projectPage = parseProjectPageId(pageId);
    if (projectPage) {
      await deleteProjectPage(
        pageId,
        await projectPathById(projectPage.projectId),
      );
      return;
    }
    await MainDatabaseService.deleteAnalyticsPage(connectionId, pageId);
  }
}
