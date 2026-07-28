import {
  discardAgentChanges,
  mergeAgentChangedFile,
} from '../../../../../src/renderer/components/chat/discardAgentChanges';
import {
  gitServices,
  projectsServices,
} from '../../../../../src/renderer/services';

jest.mock('../../../../../src/renderer/services', () => ({
  gitServices: {
    discardChanges: jest.fn(),
  },
  projectsServices: {
    getFileContent: jest.fn(),
    saveFileContent: jest.fn(),
    deleteItem: jest.fn(),
  },
}));

describe('discardAgentChanges', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('restores existing files but deletes and closes newly created files', async () => {
    const trackedPath = '/project/models/orders.sql';
    const untrackedPath = '/project/models/new_model.sql';
    const syncEditorContent = jest.fn();
    const closeFile = jest.fn();

    (gitServices.discardChanges as jest.Mock).mockResolvedValue({
      success: true,
    });
    (projectsServices.deleteItem as jest.Mock).mockResolvedValue(true);
    (projectsServices.saveFileContent as jest.Mock).mockResolvedValue(true);
    (projectsServices.getFileContent as jest.Mock).mockImplementation(
      async ({ path }: { path: string }) => {
        if (path === trackedPath) return 'select * from restored_orders';
        throw new Error('File not found');
      },
    );

    await expect(
      discardAgentChanges(
        '/project',
        [
          {
            path: trackedPath,
            added: 1,
            removed: 1,
            created: false,
            originalContent: 'select * from restored_orders',
          },
          {
            path: untrackedPath,
            added: 1,
            removed: 0,
            created: true,
          },
        ],
        syncEditorContent,
        closeFile,
      ),
    ).resolves.toEqual({
      restoredPaths: [trackedPath],
      deletedPaths: [untrackedPath],
    });

    expect(gitServices.discardChanges).not.toHaveBeenCalled();
    expect(projectsServices.saveFileContent).toHaveBeenCalledWith({
      path: trackedPath,
      content: 'select * from restored_orders',
    });
    expect(projectsServices.deleteItem).toHaveBeenCalledWith({
      filePath: untrackedPath,
    });
    expect(closeFile).toHaveBeenCalledWith(untrackedPath);
    expect(closeFile).not.toHaveBeenCalledWith(trackedPath);
    expect(syncEditorContent).toHaveBeenCalledWith(
      trackedPath,
      'select * from restored_orders',
    );
  });

  it('keeps a file classified as created after later writes in the same run', () => {
    const created = {
      path: '/project/.rosetta/new.yml',
      added: 10,
      removed: 0,
      created: true,
      originalContent: undefined,
    };
    const laterEdit = {
      ...created,
      added: 2,
      removed: 1,
      created: false,
    };

    expect(mergeAgentChangedFile(created, laterEdit)).toMatchObject({
      path: created.path,
      created: true,
      added: 2,
      removed: 1,
    });
  });

  it('keeps the first rollback snapshot after later writes', () => {
    const firstWrite = {
      path: '/project/.rosetta/existing.yml',
      added: 1,
      removed: 1,
      created: false,
      originalContent: 'name: Before agent',
    };
    const laterWrite = {
      ...firstWrite,
      added: 2,
      originalContent: undefined,
    };

    expect(mergeAgentChangedFile(firstWrite, laterWrite)).toMatchObject({
      originalContent: 'name: Before agent',
      created: false,
    });
  });
});
