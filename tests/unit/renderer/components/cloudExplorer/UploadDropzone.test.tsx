/* eslint-disable react/jsx-props-no-spreading */
import React from 'react';
import { toast } from 'react-toastify';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import UploadDropzone from '../../../../../src/renderer/components/cloudExplorer/UploadDropzone';

const mockFileMutate = jest.fn();
const mockFolderMutate = jest.fn();
let mockFileCallbacks: { onSuccess: () => void };
let mockFolderCallbacks: {
  onSuccess: (data: { failedCount: number; uploadedCount: number }) => void;
};
jest.mock(
  '../../../../../src/renderer/controllers/cloudExplorer.controller',
  () => ({
    useUploadFile: (callbacks: typeof mockFileCallbacks) => {
      mockFileCallbacks = callbacks;
      return { mutate: mockFileMutate, isLoading: false };
    },
    useUploadFolder: (callbacks: typeof mockFolderCallbacks) => {
      mockFolderCallbacks = callbacks;
      return { mutate: mockFolderMutate, isLoading: false };
    },
  }),
);
jest.mock('../../../../../src/renderer/services', () => ({
  cloudExplorerService: { onUploadProgress: () => jest.fn() },
}));
jest.mock('react-toastify', () => ({
  toast: { warning: jest.fn(), success: jest.fn(), error: jest.fn() },
}));

beforeEach(() => jest.clearAllMocks());
const props = {
  provider: 'aws' as const,
  config: { region: 'us-east-1' },
  bucketName: 'bucket',
  prefix: 'target/',
};

it('uploads screen drops sequentially to the current prefix and uses the exact folder path', async () => {
  render(
    <UploadDropzone
      {...props}
      initialEntries={[
        {
          localPath: '/local/first.txt',
          name: 'first.txt',
          isDirectory: false,
        },
        { localPath: '/local/folder', name: 'folder', isDirectory: true },
      ]}
    />,
  );
  await waitFor(() => expect(mockFileMutate).toHaveBeenCalledTimes(1));
  expect(mockFolderMutate).not.toHaveBeenCalled();
  expect(mockFileMutate.mock.calls[0][0]).toMatchObject({
    bucketName: 'bucket',
    prefix: 'target/',
    localFilePath: '/local/first.txt',
  });
  await act(async () => {
    mockFileCallbacks.onSuccess();
    mockFileMutate.mock.calls[0][1].onSettled();
  });
  await waitFor(() => expect(mockFolderMutate).toHaveBeenCalledTimes(1));
  expect(mockFolderMutate.mock.calls[0][0]).toMatchObject({
    prefix: 'target/',
    localFolderPath: '/local/folder',
  });
  await act(async () => {
    mockFolderCallbacks.onSuccess({ failedCount: 0, uploadedCount: 1 });
    mockFolderMutate.mock.calls[0][1].onSettled();
  });
  expect(screen.getByText('2 done')).toBeInTheDocument();
});

it('captures every file during the drop event before asynchronous uploads begin', async () => {
  render(<UploadDropzone {...props} />);
  const dropArea = screen.getByText(
    'Drag & drop files or folders here',
  ).parentElement!;
  const transfer = {
    items: [
      {
        kind: 'file',
        getAsFile: () => ({ name: 'one.txt', path: '/local/one.txt' }),
        webkitGetAsEntry: () => ({ isDirectory: false }),
      },
      {
        kind: 'file',
        getAsFile: () => ({ name: 'two.txt', path: '/local/two.txt' }),
        webkitGetAsEntry: () => ({ isDirectory: false }),
      },
    ],
  };
  fireEvent.drop(dropArea, { dataTransfer: transfer });
  transfer.items = [];
  await waitFor(() => expect(mockFileMutate).toHaveBeenCalledTimes(1));
  await act(async () => {
    mockFileCallbacks.onSuccess();
    mockFileMutate.mock.calls[0][1].onSettled();
  });
  await waitFor(() => expect(mockFileMutate).toHaveBeenCalledTimes(2));
  expect(mockFileMutate.mock.calls[1][0].localFilePath).toBe('/local/two.txt');
  await act(async () => {
    mockFileCallbacks.onSuccess();
    mockFileMutate.mock.calls[1][1].onSettled();
  });
});

it('pairs a folder with its file item when a text item comes first', async () => {
  render(<UploadDropzone {...props} />);
  const dropArea = screen.getByText(
    'Drag & drop files or folders here',
  ).parentElement!;
  fireEvent.drop(dropArea, {
    dataTransfer: {
      items: [
        { kind: 'string', getAsFile: () => null },
        {
          kind: 'file',
          getAsFile: () => ({ name: 'folder', path: '/local/folder' }),
          webkitGetAsEntry: () => ({ isDirectory: true }),
        },
      ],
    },
  });
  await waitFor(() => expect(mockFolderMutate).toHaveBeenCalledTimes(1));
  expect(mockFileMutate).not.toHaveBeenCalled();
  expect(mockFolderMutate.mock.calls[0][0].localFolderPath).toBe(
    '/local/folder',
  );
  fireEvent.drop(dropArea, {
    dataTransfer: {
      items: [
        {
          kind: 'file',
          getAsFile: () => ({ name: 'later.txt', path: '/local/later.txt' }),
          webkitGetAsEntry: () => ({ isDirectory: false }),
        },
      ],
    },
  });
  expect(toast.warning).toHaveBeenCalledWith(
    'An upload is in progress. Drop these files again when it finishes.',
  );
  expect(mockFileMutate).not.toHaveBeenCalled();
  await act(async () => {
    mockFolderCallbacks.onSuccess({ failedCount: 0, uploadedCount: 1 });
    mockFolderMutate.mock.calls[0][1].onSettled();
  });
});

it('uploads a new initial batch when the dialog reopens without remounting', async () => {
  const firstBatch = [
    { localPath: '/local/first.txt', name: 'first.txt', isDirectory: false },
  ];
  const secondBatch = [
    { localPath: '/local/second.txt', name: 'second.txt', isDirectory: false },
  ];
  const { rerender } = render(
    <UploadDropzone {...props} initialEntries={firstBatch} />,
  );
  await waitFor(() => expect(mockFileMutate).toHaveBeenCalledTimes(1));
  await act(async () => {
    mockFileCallbacks.onSuccess();
    mockFileMutate.mock.calls[0][1].onSettled();
  });
  rerender(<UploadDropzone {...props} initialEntries={firstBatch} />);
  expect(mockFileMutate).toHaveBeenCalledTimes(1);
  rerender(<UploadDropzone {...props} initialEntries={secondBatch} />);
  await waitFor(() => expect(mockFileMutate).toHaveBeenCalledTimes(2));
  expect(mockFileMutate.mock.calls[1][0].localFilePath).toBe(
    '/local/second.txt',
  );
  await act(async () => {
    mockFileCallbacks.onSuccess();
    mockFileMutate.mock.calls[1][1].onSettled();
  });
});
