/* eslint-disable import/first */
// Shared jest.mock block for the characterization suite. Import this file
// FIRST in every test so the mocks are registered before any service loads.
// Only package boundaries (and DB/keytar/service seams that never move) are
// mocked, never internal paths that C4 relocates.

jest.mock('@aws-sdk/client-s3', () => {
  const Dummy = class {};
  return {
    S3Client: Dummy,
    ListBucketsCommand: Dummy,
    ListObjectsV2Command: Dummy,
    ListObjectsCommand: Dummy,
    GetObjectCommand: Dummy,
    PutObjectCommand: Dummy,
    CreateMultipartUploadCommand: Dummy,
    UploadPartCommand: Dummy,
    CompleteMultipartUploadCommand: Dummy,
    AbortMultipartUploadCommand: Dummy,
    DeleteObjectCommand: Dummy,
    DeleteObjectsCommand: Dummy,
    CreateBucketCommand: Dummy,
    DeleteBucketCommand: Dummy,
    ListObjectVersionsCommand: Dummy,
    HeadBucketCommand: Dummy,
  };
});

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));

jest.mock('openai', () => ({ OpenAI: jest.fn() }));

export const credentialStore = new Map<string, string>();
export const getCredential = jest.fn(async (key: string) =>
  credentialStore.get(key),
);
export const setCredential = jest.fn(async (key: string, value: string) => {
  credentialStore.set(key, value);
});
export const cleanupConnectionCredentials = jest.fn(async () => undefined);
export const deleteCredential = jest.fn(async (key: string) => {
  credentialStore.delete(key);
});

jest.mock('../../../../src/main/database', () => ({
  __esModule: true,
  default: {
    getField: jest.fn((key: string) =>
      Promise.resolve(
        key === 'connections' || key === 'projects' ? [] : undefined,
      ),
    ),
    updateField: jest.fn(
      (key: string, updater: (current: unknown) => unknown) =>
        Promise.resolve(
          updater(key === 'connections' || key === 'projects' ? [] : undefined),
        ),
    ),
  },
}));

jest.mock('../../../../src/main/services/index', () => ({
  ProjectsService: {
    loadProjects: jest.fn().mockResolvedValue([]),
    updateProject: jest.fn(),
  },
}));

jest.mock('../../../../src/main/services/secureStorage.service', () => ({
  __esModule: true,
  default: {
    setCredential: (...a: any[]) =>
      (jest.requireActual('./mocks') as any).setCredential(...a),
    getCredential: (...a: any[]) =>
      (jest.requireActual('./mocks') as any).getCredential(...a),
    deleteCredential: (...a: any[]) =>
      (jest.requireActual('./mocks') as any).deleteCredential(...a),
    cleanupConnectionCredentials: (...a: any[]) =>
      (jest.requireActual('./mocks') as any).cleanupConnectionCredentials(
        ...a,
      ),
  },
}));

jest.mock('../../../../src/main/services/duckLake.service', () => ({
  __esModule: true,
  default: { getInstance: jest.fn() },
}));

jest.mock(
  '../../../../src/main/services/duckLake/instanceStore.service',
  () => ({
    __esModule: true,
    default: { retrieveCredentials: jest.fn() },
  }),
);

jest.mock('@duckdb/node-api', () => ({
  __esModule: true,
  DuckDBInstance: { create: jest.fn() },
  DuckDBConnection: jest.fn(),
}));
jest.mock('../../../../release/app/node_modules/@duckdb/node-api', () => ({
  __esModule: true,
  DuckDBInstance: { create: jest.fn() },
  DuckDBConnection: jest.fn(),
}));

jest.mock('better-sqlite3', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('../../../../release/app/node_modules/better-sqlite3', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('../../../../src/main/lib/GPUdb', () => ({
  __esModule: true,
  default: jest.fn(),
  GPUdb: jest.fn(),
}));
