import { useQuery, useMutation, useQueryClient } from 'react-query';
import * as activeMemoryService from '../services/activeMemory.service';

export const useActiveMemoryDiagnostics = () =>
  useQuery(['active-memory', 'diagnostics'], () =>
    activeMemoryService.listActiveMemoryDiagnostics(10),
  );

export const useClearActiveMemoryDiagnostics = () => {
  const qc = useQueryClient();
  return useMutation(activeMemoryService.clearActiveMemoryDiagnostics, {
    onSuccess: () => qc.invalidateQueries(['active-memory', 'diagnostics']),
  });
};
