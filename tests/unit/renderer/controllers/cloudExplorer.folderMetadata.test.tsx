import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from 'react-query';
import {
  cloudExplorerKeys,
  useFolderMetadata,
  useInvalidateFolderMetadata,
  useUploadFile,
  useUploadFolder,
  useDeleteObject,
  useCreateFolder,
  useDeleteBucket,
} from '../../../../src/renderer/controllers/cloudExplorer.controller';
import { cloudExplorerService } from '../../../../src/renderer/services';
import type {
  CloudFolderMetadata,
  StorageObject,
} from '../../../../src/types/frontend';

jest.mock('../../../../src/renderer/services', () => ({
  cloudExplorerService: {
    getFolderMetadata: jest.fn(),
    uploadFile: jest.fn(),
    uploadFolder: jest.fn(),
    deleteObject: jest.fn(),
    createFolder: jest.fn(),
    deleteBucket: jest.fn(),
  },
}));

const config = {
  authMode: 'public' as const,
  bucket: 'public-data',
  region: 'us-east-1',
};
const folder = (name: string): StorageObject => ({
  name,
  size: 0,
  isDirectory: true,
  folderMetadataStatus: 'pending',
});
const file: StorageObject = {
  name: 'file.bin',
  size: 1024 ** 3,
  isDirectory: false,
};
const getFolderMetadata = cloudExplorerService.getFolderMetadata as jest.Mock;

function deferred() {
  let resolve!: (value: CloudFolderMetadata) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<CloudFolderMetadata>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

let queryClient: QueryClient;
const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

beforeEach(() => {
  jest.clearAllMocks();
  getFolderMetadata.mockReset();
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, cacheTime: Infinity } },
  });
});
afterEach(() => {
  queryClient.clear();
  jest.restoreAllMocks();
});

describe('Background folder metadata', () => {
  it('keeps files and folders available while totals are pending and applies each result independently', async () => {
    const a = deferred();
    const b = deferred();
    getFolderMetadata.mockImplementation(
      (_provider, _config, _bucket, prefix) =>
        prefix === 'a/' ? a.promise : b.promise,
    );
    const objects = [folder('a/'), folder('b/'), file];
    const { result } = renderHook(
      () => useFolderMetadata('aws', config, 'bucket', objects),
      { wrapper: Wrapper },
    );
    expect(result.current).toEqual(objects);
    await act(async () =>
      a.resolve({ size: 42, updated: new Date('2026-10-06') }),
    );
    await waitFor(() =>
      expect(result.current[0]).toMatchObject({
        size: 42,
        folderMetadataStatus: 'ready',
      }),
    );
    expect(result.current[1].folderMetadataStatus).toBe('pending');
    expect(result.current[2]).toEqual(file);
    await act(async () => b.resolve({ size: 0 }));
    await waitFor(() =>
      expect(result.current[1]).toMatchObject({
        size: 0,
        folderMetadataStatus: 'ready',
      }),
    );
  });

  it('marks failed totals unavailable without losing the directory listing', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    getFolderMetadata.mockRejectedValueOnce(new Error('AccessDenied'));
    const { result } = renderHook(
      () => useFolderMetadata('aws', config, 'bucket', [folder('a/'), file]),
      { wrapper: Wrapper },
    );
    await waitFor(() =>
      expect(result.current[0].folderMetadataStatus).toBe('error'),
    );
    expect(result.current[0].name).toBe('a/');
    expect(result.current[1]).toEqual(file);
  });

  it('reuses fresh totals when navigating back to a folder', async () => {
    getFolderMetadata.mockResolvedValue({ size: 50 });
    const { result, rerender } = renderHook(
      ({ objects }) => useFolderMetadata('aws', config, 'bucket', objects),
      {
        wrapper: Wrapper,
        initialProps: { objects: [folder('a/')] },
      },
    );
    await waitFor(() =>
      expect(result.current[0].folderMetadataStatus).toBe('ready'),
    );
    await act(async () => {
      rerender({ objects: [folder('b/')] });
    });
    await waitFor(() =>
      expect(result.current[0].folderMetadataStatus).toBe('ready'),
    );
    await act(async () => {
      rerender({ objects: [folder('a/')] });
    });
    expect(result.current[0]).toMatchObject({
      name: 'a/',
      size: 50,
      folderMetadataStatus: 'ready',
    });
    expect(getFolderMetadata).toHaveBeenCalledTimes(2);
  });

  it('prevents an older in-flight scan from restoring stale totals after refresh', async () => {
    const old = deferred();
    getFolderMetadata
      .mockReturnValueOnce(old.promise)
      .mockResolvedValue({ size: 99 });
    const { result } = renderHook(
      () => ({
        objects: useFolderMetadata('aws', config, 'bucket', [folder('a/')]),
        invalidate: useInvalidateFolderMetadata(),
      }),
      { wrapper: Wrapper },
    );
    await waitFor(() => expect(getFolderMetadata).toHaveBeenCalledTimes(1));
    await act(async () => {
      await result.current.invalidate('aws', config, 'bucket');
    });
    await waitFor(() => expect(result.current.objects[0].size).toBe(99));
    await act(async () => old.resolve({ size: 1 }));
    expect(result.current.objects[0].size).toBe(99);
  });

  it.each([
    ['uploadFile', useUploadFile],
    ['uploadFolder', useUploadFolder],
    ['deleteObject', useDeleteObject],
    ['createFolder', useCreateFolder],
    ['deleteBucket', useDeleteBucket],
  ] as const)(
    '%s invalidates ancestor totals in the affected bucket',
    async (method, hook) => {
      (cloudExplorerService[method] as jest.Mock).mockResolvedValue({
        success: true,
      });
      const ancestorKey = cloudExplorerKeys.folderMetadata(
        'aws',
        config,
        'bucket',
        'outer/',
      );
      const childKey = cloudExplorerKeys.folderMetadata(
        'aws',
        config,
        'bucket',
        'outer/inner/',
      );
      const otherKey = cloudExplorerKeys.folderMetadata(
        'aws',
        config,
        'other-bucket',
        'outer/',
      );
      [ancestorKey, childKey, otherKey].forEach((key) =>
        queryClient.setQueryData(key, { size: 1 }),
      );
      const { result } = renderHook(() => hook(), { wrapper: Wrapper });
      await act(async () => {
        await result.current.mutateAsync({
          provider: 'aws',
          config,
          bucketName: 'bucket',
          prefix: 'outer/inner/',
        } as any);
      });
      await waitFor(() =>
        expect(queryClient.getQueryState(ancestorKey)?.isInvalidated).toBe(
          true,
        ),
      );
      expect(queryClient.getQueryState(childKey)?.isInvalidated).toBe(true);
      expect(queryClient.getQueryState(otherKey)?.isInvalidated).toBe(false);
    },
  );
});
