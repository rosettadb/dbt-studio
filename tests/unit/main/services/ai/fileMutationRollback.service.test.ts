import fs from 'fs';
import os from 'os';
import path from 'path';
import FileMutationRollbackService from '../../../../../src/main/services/ai/fileMutationRollback.service';

describe('FileMutationRollbackService', () => {
  let tempPath: string;

  beforeEach(() => {
    tempPath = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-rollback-'));
  });

  afterEach(() => {
    FileMutationRollbackService.clear();
    fs.rmSync(tempPath, { recursive: true, force: true });
  });

  it('returns an opaque identifier and restores without exposing content', () => {
    const filePath = path.join(tempPath, '.env');
    fs.writeFileSync(filePath, 'SECRET=original\n', 'utf8');

    const state = FileMutationRollbackService.capture(filePath);

    expect(state).toEqual({
      created: false,
      mutationId: expect.any(String),
    });
    expect(state).not.toHaveProperty('previousContent');
    fs.writeFileSync(filePath, 'SECRET=updated\n', 'utf8');
    FileMutationRollbackService.restore(state.mutationId!);
    expect(fs.readFileSync(filePath, 'utf8')).toBe('SECRET=original\n');
  });

  it('retains rollback data when restoration fails so it can be retried', () => {
    const directory = path.join(tempPath, 'nested');
    const filePath = path.join(directory, 'model.sql');
    fs.mkdirSync(directory);
    fs.writeFileSync(filePath, 'select 1\n', 'utf8');
    const state = FileMutationRollbackService.capture(filePath);
    fs.rmSync(directory, { recursive: true });

    expect(() =>
      FileMutationRollbackService.restore(state.mutationId!),
    ).toThrow();

    fs.mkdirSync(directory);
    FileMutationRollbackService.restore(state.mutationId!);
    expect(fs.readFileSync(filePath, 'utf8')).toBe('select 1\n');
  });
});
