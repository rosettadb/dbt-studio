import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import simpleGit from 'simple-git';
import GitService from '../../../src/main/services/git.service';

// Define path constants
const TEST_DIR_NAME = 'dbt-studio-git-test';
const TEST_DIR = path.join(os.tmpdir(), TEST_DIR_NAME);

// Mock electron app
jest.mock('electron', () => ({
  app: {
    getPath: jest.fn(() =>
      path.join(os.tmpdir(), 'dbt-studio-git-test', 'userData'),
    ),
    getName: jest.fn().mockReturnValue('Rosetta DBT Studio Test'),
    getVersion: jest.fn().mockReturnValue('1.0.0'),
  },
}));

describe('Git Service Integration', () => {
  let gitService: GitService;
  let testRepoPath: string;

  beforeAll(() => {
    // Clean up any existing test directory
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  beforeEach(async () => {
    // Create a unique test repo for each test
    testRepoPath = path.join(TEST_DIR, `repo-${Date.now()}`);
    fs.mkdirSync(testRepoPath, { recursive: true });

    gitService = new GitService();

    // Initialize git repo
    const git = simpleGit(testRepoPath);
    await git.init(['--initial-branch=main']);
    await git.addConfig('user.email', 'test@test.com');
    await git.addConfig('user.name', 'Test User');

    // Create initial file and commit
    const readmePath = path.join(testRepoPath, 'README.md');
    fs.writeFileSync(readmePath, '# Test Repository\n');
    await git.add('.');
    await git.commit('Initial commit');
  });

  afterEach(() => {
    // Clean up test repo
    if (fs.existsSync(testRepoPath)) {
      fs.rmSync(testRepoPath, { recursive: true, force: true });
    }
  });

  afterAll(() => {
    // Clean up test directory
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe('isRepoInitialized', () => {
    it('should return true for initialized repo', async () => {
      const result = await gitService.isRepoInitialized(testRepoPath);
      expect(result).toBe(true);
    });

    it('should return false for non-initialized directory', async () => {
      const nonGitPath = path.join(TEST_DIR, 'non-git');
      fs.mkdirSync(nonGitPath, { recursive: true });

      const result = await gitService.isRepoInitialized(nonGitPath);
      expect(result).toBe(false);

      fs.rmSync(nonGitPath, { recursive: true, force: true });
    });
  });

  describe('initRepo', () => {
    it('should initialize a new git repository', async () => {
      const newRepoPath = path.join(TEST_DIR, 'new-repo');
      fs.mkdirSync(newRepoPath, { recursive: true });

      await gitService.initRepo(newRepoPath);

      const isInitialized = await gitService.isRepoInitialized(newRepoPath);
      expect(isInitialized).toBe(true);

      // Check that .git directory exists
      const gitDir = path.join(newRepoPath, '.git');
      expect(fs.existsSync(gitDir)).toBe(true);

      fs.rmSync(newRepoPath, { recursive: true, force: true });
    });
  });

  describe('getFileStatusList', () => {
    it('should detect modified files', async () => {
      // Modify README.md
      const readmePath = path.join(testRepoPath, 'README.md');
      fs.appendFileSync(readmePath, '\nNew content');

      const statuses = await gitService.getFileStatusList(testRepoPath);

      expect(statuses).toHaveLength(1);
      expect(statuses[0].status).toBe('modified');
      expect(statuses[0].path).toBe(readmePath);
    });

    it('should detect untracked files', async () => {
      // Create new file
      const newFilePath = path.join(testRepoPath, 'new-file.txt');
      fs.writeFileSync(newFilePath, 'New file content');

      const statuses = await gitService.getFileStatusList(testRepoPath);

      expect(statuses).toHaveLength(1);
      expect(statuses[0].status).toBe('untracked');
      expect(statuses[0].path).toBe(newFilePath);
    });

    it('should detect staged files', async () => {
      // Create and stage a new file
      const newFilePath = path.join(testRepoPath, 'staged-file.txt');
      fs.writeFileSync(newFilePath, 'Staged content');

      const git = simpleGit(testRepoPath);
      await git.add('staged-file.txt');

      const statuses = await gitService.getFileStatusList(testRepoPath);

      expect(statuses).toHaveLength(1);
      expect(statuses[0].status).toBe('staged');
      expect(statuses[0].path).toBe(newFilePath);
    });

    it('should detect deleted files', async () => {
      // Delete README.md
      const readmePath = path.join(testRepoPath, 'README.md');
      fs.unlinkSync(readmePath);

      const statuses = await gitService.getFileStatusList(testRepoPath);

      expect(statuses).toHaveLength(1);
      expect(statuses[0].status).toBe('deleted');
    });

    it('should return empty array for clean repo', async () => {
      const statuses = await gitService.getFileStatusList(testRepoPath);
      expect(statuses).toHaveLength(0);
    });
  });

  describe('add', () => {
    it('should stage a single file', async () => {
      // Create new file
      const newFilePath = path.join(testRepoPath, 'to-stage.txt');
      fs.writeFileSync(newFilePath, 'Content to stage');

      await gitService.add(testRepoPath, [newFilePath]);

      const statuses = await gitService.getFileStatusList(testRepoPath);
      expect(statuses).toHaveLength(1);
      expect(statuses[0].status).toBe('staged');
    });

    it('should stage all files with dot notation', async () => {
      // Create multiple files
      fs.writeFileSync(path.join(testRepoPath, 'file1.txt'), 'Content 1');
      fs.writeFileSync(path.join(testRepoPath, 'file2.txt'), 'Content 2');

      await gitService.add(testRepoPath, ['.']);

      const statuses = await gitService.getFileStatusList(testRepoPath);
      expect(statuses).toHaveLength(2);
      expect(statuses.every((s) => s.status === 'staged')).toBe(true);
    });
  });

  describe('stageAll', () => {
    it('should stage all changes', async () => {
      // Create multiple files and modify existing
      fs.writeFileSync(path.join(testRepoPath, 'new1.txt'), 'New 1');
      fs.writeFileSync(path.join(testRepoPath, 'new2.txt'), 'New 2');
      fs.appendFileSync(path.join(testRepoPath, 'README.md'), '\nModified');

      await gitService.stageAll(testRepoPath);

      const statuses = await gitService.getFileStatusList(testRepoPath);
      expect(statuses).toHaveLength(3);
      expect(statuses.every((s) => s.status === 'staged')).toBe(true);
    });
  });

  describe('unstage', () => {
    it('should unstage a staged file', async () => {
      // Create and stage a file
      const newFilePath = path.join(testRepoPath, 'staged.txt');
      fs.writeFileSync(newFilePath, 'Staged content');

      const git = simpleGit(testRepoPath);
      await git.add('staged.txt');

      // Verify it's staged
      let statuses = await gitService.getFileStatusList(testRepoPath);
      expect(statuses[0].status).toBe('staged');

      // Unstage it
      await gitService.unstage(testRepoPath, [newFilePath]);

      // Verify it's untracked
      statuses = await gitService.getFileStatusList(testRepoPath);
      expect(statuses[0].status).toBe('untracked');
    });
  });

  describe('unstageAll', () => {
    it('should unstage all staged files', async () => {
      // Create and stage multiple files
      fs.writeFileSync(path.join(testRepoPath, 'file1.txt'), 'Content 1');
      fs.writeFileSync(path.join(testRepoPath, 'file2.txt'), 'Content 2');

      const git = simpleGit(testRepoPath);
      await git.add('.');

      // Verify they're staged
      let statuses = await gitService.getFileStatusList(testRepoPath);
      expect(statuses.every((s) => s.status === 'staged')).toBe(true);

      // Unstage all
      await gitService.unstageAll(testRepoPath);

      // Verify they're untracked
      statuses = await gitService.getFileStatusList(testRepoPath);
      expect(statuses.every((s) => s.status === 'untracked')).toBe(true);
    });
  });

  describe('commit', () => {
    it('should commit staged changes', async () => {
      // Create and stage a file
      const newFilePath = path.join(testRepoPath, 'to-commit.txt');
      fs.writeFileSync(newFilePath, 'Content to commit');
      await gitService.add(testRepoPath, [newFilePath]);

      await gitService.commit(testRepoPath, 'Add new file');

      // Verify no changes after commit
      const statuses = await gitService.getFileStatusList(testRepoPath);
      expect(statuses).toHaveLength(0);

      // Verify commit exists
      const git = simpleGit(testRepoPath);
      const log = await git.log();
      expect(log.latest?.message).toBe('Add new file');
    });

    it('should commit with custom message', async () => {
      const newFilePath = path.join(testRepoPath, 'feature.txt');
      fs.writeFileSync(newFilePath, 'Feature content');
      await gitService.add(testRepoPath, [newFilePath]);

      await gitService.commit(testRepoPath, 'feat: add new feature');

      const git = simpleGit(testRepoPath);
      const log = await git.log();
      expect(log.latest?.message).toBe('feat: add new feature');
    });
  });

  describe('listBranches', () => {
    it('should list local branches', async () => {
      const branches = await gitService.listBranches(testRepoPath);

      expect(branches).toHaveLength(1);
      expect(branches[0].name).toBe('main');
      expect(branches[0].checkedOut).toBe(true);
      expect(branches[0].isLocal).toBe(true);
    });

    it('should list multiple branches', async () => {
      // Create additional branches
      const git = simpleGit(testRepoPath);
      await git.checkoutLocalBranch('feature-1');
      await git.checkout('main');
      await git.checkoutLocalBranch('feature-2');
      await git.checkout('main');

      const branches = await gitService.listBranches(testRepoPath);

      expect(branches).toHaveLength(3);
      expect(branches.map((b) => b.name).sort()).toEqual([
        'feature-1',
        'feature-2',
        'main',
      ]);
      expect(branches.find((b) => b.name === 'main')?.checkedOut).toBe(true);
    });
  });

  describe('createBranch', () => {
    it('should create a new branch', async () => {
      const result = await gitService.createBranch(testRepoPath, 'new-feature');

      expect(result.success).toBe(true);
      expect(result.branchName).toBe('new-feature');

      const branches = await gitService.listBranches(testRepoPath);
      expect(branches.find((b) => b.name === 'new-feature')).toBeDefined();
    });
  });

  describe('checkoutBranch', () => {
    it('should checkout existing branch', async () => {
      // Create a new branch
      const git = simpleGit(testRepoPath);
      await git.checkoutLocalBranch('feature');
      await git.checkout('main');

      // Checkout the feature branch
      const result = await gitService.checkoutBranch(testRepoPath, 'feature');

      expect(result.success).toBe(true);
      expect(result.checkedOut).toBe('feature');

      const branches = await gitService.listBranches(testRepoPath);
      expect(branches.find((b) => b.name === 'feature')?.checkedOut).toBe(true);
    });

    it('should create and checkout new branch if it does not exist', async () => {
      const result = await gitService.checkoutBranch(
        testRepoPath,
        'new-branch',
      );

      expect(result.success).toBe(true);
      expect(result.checkedOut).toBe('new-branch');

      const branches = await gitService.listBranches(testRepoPath);
      expect(branches.find((b) => b.name === 'new-branch')?.checkedOut).toBe(
        true,
      );
    });
  });

  describe('deleteBranch', () => {
    it('should delete a branch', async () => {
      // Create a branch
      const git = simpleGit(testRepoPath);
      await git.checkoutLocalBranch('to-delete');
      await git.checkout('main');

      // Delete it
      const result = await gitService.deleteBranch(testRepoPath, 'to-delete');

      expect(result.success).toBe(true);
      expect(result.branchName).toBe('to-delete');

      const branches = await gitService.listBranches(testRepoPath);
      expect(branches.find((b) => b.name === 'to-delete')).toBeUndefined();
    });
  });

  describe('renameBranch', () => {
    it('should rename a branch', async () => {
      // Create a branch
      const git = simpleGit(testRepoPath);
      await git.checkoutLocalBranch('old-name');
      await git.checkout('main');

      // Rename it
      const result = await gitService.renameBranch(
        testRepoPath,
        'old-name',
        'new-name',
      );

      expect(result.success).toBe(true);
      expect(result.oldName).toBe('old-name');
      expect(result.newName).toBe('new-name');

      const branches = await gitService.listBranches(testRepoPath);
      expect(branches.find((b) => b.name === 'old-name')).toBeUndefined();
      expect(branches.find((b) => b.name === 'new-name')).toBeDefined();
    });
  });

  describe('addRemote', () => {
    it('should add a remote', async () => {
      const result = await gitService.addRemote(
        testRepoPath,
        'https://github.com/test/repo.git',
      );

      expect(result.success).toBe(true);

      const remotes = await gitService.getRemotes(testRepoPath);
      expect(remotes).toHaveLength(1);
      expect(remotes[0].name).toBe('origin');
    });

    it('should update existing remote', async () => {
      // Add initial remote
      await gitService.addRemote(
        testRepoPath,
        'https://github.com/test/repo1.git',
      );

      // Update it
      await gitService.addRemote(
        testRepoPath,
        'https://github.com/test/repo2.git',
      );

      const remotes = await gitService.getRemotes(testRepoPath);
      expect(remotes).toHaveLength(1);
      expect(remotes[0].refs.fetch).toContain('repo2.git');
    });
  });

  describe('getRemotes', () => {
    it('should return empty array for repo without remotes', async () => {
      const remotes = await gitService.getRemotes(testRepoPath);
      expect(remotes).toHaveLength(0);
    });

    it('should return remotes with details', async () => {
      await gitService.addRemote(
        testRepoPath,
        'https://github.com/test/repo.git',
      );

      const remotes = await gitService.getRemotes(testRepoPath);
      expect(remotes).toHaveLength(1);
      expect(remotes[0]).toHaveProperty('name');
      expect(remotes[0]).toHaveProperty('refs');
    });
  });

  describe('discardChanges', () => {
    it('should discard changes to modified file', async () => {
      // Modify README.md
      const readmePath = path.join(testRepoPath, 'README.md');
      const originalContent = fs.readFileSync(readmePath, 'utf-8');
      fs.appendFileSync(readmePath, '\nModified content');

      // Discard changes
      await gitService.discardChanges(testRepoPath, [readmePath]);

      // Verify content is restored
      const restoredContent = fs.readFileSync(readmePath, 'utf-8');
      expect(restoredContent).toBe(originalContent);
    });

    it('should delete untracked file', async () => {
      // Create untracked file
      const newFilePath = path.join(testRepoPath, 'untracked.txt');
      fs.writeFileSync(newFilePath, 'Untracked content');

      // Discard changes
      await gitService.discardChanges(testRepoPath, [newFilePath]);

      // Verify file is deleted
      expect(fs.existsSync(newFilePath)).toBe(false);
    });
  });

  describe('getDiffForFile', () => {
    it('should return diff for modified file', async () => {
      // Modify README.md
      const readmePath = path.join(testRepoPath, 'README.md');
      fs.appendFileSync(readmePath, '\nNew line added');

      const result = await gitService.getDiffForFile(testRepoPath, readmePath);

      expect(result.filePath).toBe(readmePath);
      expect(result.diff).toContain('New line added');
      expect(result.diff).toContain('@@'); // Diff hunk marker
    });

    it('should return empty diff for unchanged file', async () => {
      const readmePath = path.join(testRepoPath, 'README.md');

      const result = await gitService.getDiffForFile(testRepoPath, readmePath);

      expect(result.filePath).toBe(readmePath);
      expect(result.diff).toBe('');
    });
  });

  describe('clearLockFile', () => {
    it('should clear lock file if it exists', async () => {
      // Create a lock file
      const lockFilePath = path.join(testRepoPath, '.git', 'index.lock');
      fs.writeFileSync(lockFilePath, '');

      await gitService.clearLockFile(testRepoPath);

      expect(fs.existsSync(lockFilePath)).toBe(false);
    });

    it('should not throw if lock file does not exist', async () => {
      await expect(
        gitService.clearLockFile(testRepoPath),
      ).resolves.not.toThrow();
    });
  });
});
