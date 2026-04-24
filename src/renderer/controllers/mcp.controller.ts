import { useQuery, useMutation, useQueryClient } from 'react-query';
import * as mcpService from '../services/mcp.service';
import type { MCPServerFileEntry } from '../../types/backend';

const SERVERS_KEY = ['mcp', 'servers'];

export const useMCPServers = () => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: SERVERS_KEY,
    queryFn: mcpService.listMCPServers,
  });

  const connectMutation = useMutation({
    mutationFn: (serverId: string) => mcpService.connectMCPServer(serverId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SERVERS_KEY }),
  });

  const disconnectMutation = useMutation({
    mutationFn: (serverId: string) => mcpService.disconnectMCPServer(serverId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SERVERS_KEY }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({
      serverId,
      disabled,
    }: {
      serverId: string;
      disabled: boolean;
    }) => mcpService.toggleMCPServer(serverId, disabled),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SERVERS_KEY }),
  });

  const addMutation = useMutation({
    mutationFn: ({ id, entry }: { id: string; entry: MCPServerFileEntry }) =>
      mcpService.addMCPServer(id, entry),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SERVERS_KEY }),
  });

  const removeMutation = useMutation({
    mutationFn: (serverId: string) => mcpService.removeMCPServer(serverId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SERVERS_KEY }),
  });

  return {
    servers: query.data ?? [],
    isLoading: query.isLoading,
    connect: connectMutation.mutate,
    isConnecting: connectMutation.isLoading,
    connectingId: connectMutation.isLoading
      ? (connectMutation.variables as string)
      : null,
    disconnect: disconnectMutation.mutate,
    isDisconnecting: disconnectMutation.isLoading,
    toggle: toggleMutation.mutate,
    addServer: addMutation.mutate,
    isAdding: addMutation.isLoading,
    removeServer: removeMutation.mutate,
    error:
      connectMutation.error || disconnectMutation.error || toggleMutation.error,
  };
};

export const useMCPServerTools = (serverId: string, connected: boolean) =>
  useQuery({
    queryKey: ['mcp', 'tools', serverId],
    queryFn: () => mcpService.listMCPServerTools(serverId),
    enabled: connected,
    staleTime: 30_000,
  });

export const useMCPConfigFilePath = () =>
  useQuery({
    queryKey: ['mcp', 'config', 'file-path'],
    queryFn: mcpService.getMCPConfigFilePath,
    staleTime: Infinity,
  });
