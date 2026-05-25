import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import * as memoryService from '../services/memory.service';
import type {
  ScanProgress,
  ScanResult,
} from '../../main/services/ai/memory/memoryScanner';

export const useGetMemoryTree = () =>
  useQuery(['memory', 'tree'], memoryService.getMemoryTree);

export const useGetMemoryStats = () =>
  useQuery(['memory', 'stats'], memoryService.getMemoryStats);

export const useSearchMemory = (query: string) =>
  useQuery(
    ['memory', 'search', query],
    () => memoryService.searchMemory(query),
    { enabled: query.length > 0 },
  );

export const useReadMemoryFile = (path: string) =>
  useQuery(['memory', 'read', path], () => memoryService.readMemoryFile(path), {
    enabled: path.length > 0,
  });

export const useWriteMemoryFile = () => {
  const queryClient = useQueryClient();
  return useMutation(
    ({ path, content }: { path: string; content: string }) =>
      memoryService.writeMemoryFile(path, content),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['memory', 'read']);
        queryClient.invalidateQueries(['memory', 'stats']);
      },
    },
  );
};

export const useMemoryScan = () => {
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);

  const startScan = useCallback(
    async (projectPath?: string) => {
      setIsScanning(true);
      setProgress(null);
      setResult(null);
      const res = await memoryService.startMemoryScan(projectPath, setProgress);
      setResult(res);
      setIsScanning(false);
      queryClient.invalidateQueries(['memory', 'tree']);
      queryClient.invalidateQueries(['memory', 'stats']);
      queryClient.invalidateQueries(['memory', 'read']);
      return res;
    },
    [queryClient],
  );

  const cancelScan = useCallback(async () => {
    await memoryService.cancelMemoryScan();
  }, []);

  const reset = useCallback(() => {
    setProgress(null);
    setIsScanning(false);
    setResult(null);
  }, []);

  return { startScan, cancelScan, isScanning, progress, result, reset };
};
