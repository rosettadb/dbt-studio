import { useQuery } from 'react-query';
import * as memoryService from '../services/memory.service';

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
