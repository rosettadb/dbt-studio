import {
  addProject,
  getProjectById,
  getProjects,
  updateProjectQuery,
} from '../../../../src/renderer/services/projects.service';

jest.mock('../../../../src/renderer/config/client', () => {
  return {
    client: {
      get: jest.fn(),
      post: jest.fn(),
    },
  };
});

describe('renderer/services/projects.service', () => {
  const { client } = require('../../../../src/renderer/config/client');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getProjects', () => {
    it('should call client.get with project:list and return data', async () => {
      const projects = [{ id: '1', name: 'P1' }];
      client.get.mockResolvedValue({ data: projects });

      const result = await getProjects();

      expect(client.get).toHaveBeenCalledWith('project:list');
      expect(result).toEqual(projects);
    });

    it('should propagate errors', async () => {
      const err = new Error('boom');
      client.get.mockRejectedValue(err);

      await expect(getProjects()).rejects.toThrow('boom');
    });
  });

  describe('getProjectById', () => {
    it('should call client.post with project:get and body', async () => {
      const project = { id: 'p1', name: 'Project 1' };
      client.post.mockResolvedValue({ data: project });

      const body = { id: 'p1' };
      const result = await getProjectById(body);

      expect(client.post).toHaveBeenCalledWith('project:get', body);
      expect(result).toEqual(project);
    });
  });

  describe('addProject', () => {
    it('should call client.post with project:add and body', async () => {
      const project = { id: 'p1', name: 'My Project' };
      client.post.mockResolvedValue({ data: project });

      const body = {
        name: 'My Project',
        connectionId: 'c1',
        createTemplateFolders: true,
      };

      const result = await addProject(body);

      expect(client.post).toHaveBeenCalledWith('project:add', body);
      expect(result).toEqual(project);
    });
  });

  describe('updateProjectQuery', () => {
    it('should call client.post with project:updateQuery and body', async () => {
      client.post.mockResolvedValue({ data: undefined });

      const body = { projectId: 'p1', query: 'select 1' };
      await updateProjectQuery(body);

      expect(client.post).toHaveBeenCalledWith('project:updateQuery', body);
    });

    it('should propagate errors', async () => {
      const err = new Error('cannot update');
      client.post.mockRejectedValue(err);

      await expect(updateProjectQuery({ projectId: 'p1', query: 'x' })).rejects.toThrow(
        'cannot update',
      );
    });
  });
});
