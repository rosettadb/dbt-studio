import React from 'react';
import {
  Box,
  Typography,
  Button,
  Alert,
  CircularProgress,
  Chip,
  Tabs,
  Tab,
} from '@mui/material';
import {
  Add,
  Refresh,
  DeleteSweep,
  StorageOutlined,
  SmartToyOutlined,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  useGetAIProviders,
  useGetActiveAIProvider,
} from '../../controllers/aiProviders.controller';
import type { AIProvider } from '../../controllers/aiProviders.controller';
import { CreateProviderDialog, ProviderCard } from '../ai';
import { useGetSettingsWithDatabaseInfo } from '../../controllers';
import { useCleanupOrphanedChats } from '../../controllers/chat.controller';
import { AISettingsTab } from './AISettingsTab';
import { MCPServersTab } from './MCPServersTab';
import { SkillsTab } from './SkillsTab';
import { SecondBrainTab } from './SecondBrainTab';
import {
  SettingsRow,
  SettingsSection,
  SettingsStack,
  settingsTabsSx,
} from './SettingsLayout';

const TABS = [
  'Providers',
  'Settings',
  'Agent Memory',
  'MCP Servers',
  'Skills',
] as const;
type TabLabel = (typeof TABS)[number];

export const AIProvidersSettings: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const tabParam = searchParams.get('tab') as TabLabel | null;
  const activeTab: TabLabel =
    tabParam && (TABS as readonly string[]).includes(tabParam)
      ? tabParam
      : 'Providers';

  const setActiveTab = (tab: TabLabel) =>
    navigate(`/app/settings/ai-providers?tab=${encodeURIComponent(tab)}`, {
      replace: true,
    });

  const [createDialogOpen, setCreateDialogOpen] = React.useState(false);
  const [selectedProvider, setSelectedProvider] =
    React.useState<AIProvider | null>(null);

  const { data: settingsWithDbInfo } = useGetSettingsWithDatabaseInfo();

  const { mutate: cleanupOrphanedChats, isLoading: isCleaningUp } =
    useCleanupOrphanedChats({
      onSuccess: (data) => {
        if (data.deletedCount > 0) {
          toast.success(
            `Successfully cleaned up ${data.deletedCount} orphaned chat sessions.`,
          );
        } else {
          toast.info('No orphaned chat sessions found.');
        }
      },
      onError: (error) => {
        toast.error(`Failed to clean up orphaned chats: ${error.message}`);
      },
    });

  const {
    data: providers = [],
    isLoading: isLoadingProviders,
    error: providersError,
    refetch: refetchProviders,
  } = useGetAIProviders({
    onError: (error) => {
      toast.error(`Failed to load AI providers: ${error?.message}`);
    },
  });

  const {
    data: activeProvider,
    isLoading: isLoadingActiveProvider,
    refetch: refetchActiveProvider,
  } = useGetActiveAIProvider({
    onError: (error) => {
      toast.error(`Failed to load active AI provider: ${error?.message}`);
    },
  });

  const handleRefreshAll = () => {
    refetchProviders();
    refetchActiveProvider();
  };

  const handleCreateProvider = () => {
    setSelectedProvider(null);
    setCreateDialogOpen(true);
  };

  const handleEditProvider = (provider: AIProvider) => {
    setSelectedProvider(provider);
    setCreateDialogOpen(true);
  };

  const handleDialogClose = () => {
    setCreateDialogOpen(false);
    setSelectedProvider(null);
    setTimeout(() => {
      refetchProviders();
      refetchActiveProvider();
    }, 100);
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'connected':
        return 'success';
      case 'disconnected':
        return 'warning';
      case 'error':
        return 'error';
      default:
        return 'default';
    }
  };

  const isLoading = isLoadingProviders || isLoadingActiveProvider;

  if (isLoading) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        minHeight="400px"
      >
        <CircularProgress />
        <Typography variant="body1" sx={{ ml: 2 }}>
          Loading providers...
        </Typography>
      </Box>
    );
  }

  if (providersError) {
    return (
      <Alert severity="error" sx={{ mb: 2 }}>
        Failed to load AI providers: {(providersError as any).message}
        <Button size="small" onClick={handleRefreshAll} sx={{ ml: 2 }}>
          Retry
        </Button>
      </Alert>
    );
  }

  return (
    <Box>
      {/* Tabs — tight gap below header */}
      <Tabs
        value={activeTab}
        onChange={(_, v) => setActiveTab(v as TabLabel)}
        sx={{ ...settingsTabsSx, mb: 2.25 }}
      >
        {TABS.map((tab) => (
          <Tab key={tab} label={tab} value={tab} />
        ))}
      </Tabs>

      {/* MCP Servers */}
      {activeTab === 'MCP Servers' && <MCPServersTab />}

      {/* Skills */}
      {activeTab === 'Skills' && <SkillsTab />}

      {/* User-owned long-term memory */}
      {activeTab === 'Agent Memory' && <SecondBrainTab />}

      {/* General (was AI Settings) — includes DB info */}
      {activeTab === 'Settings' && (
        <SettingsStack>
          <SettingsSection title="Database" icon={<StorageOutlined />}>
            <SettingsRow
              label="AI database"
              description={`SQLite ${settingsWithDbInfo?.sqliteVersion || 'Unknown'} · ${settingsWithDbInfo?.mainDatabaseSize || 'Unknown'}`}
            >
              <Chip
                size="small"
                label={settingsWithDbInfo?.mainDatabaseStatus || 'Unknown'}
                color={getStatusColor(settingsWithDbInfo?.mainDatabaseStatus)}
                variant="outlined"
              />
              <Button
                variant="outlined"
                color="warning"
                size="small"
                startIcon={
                  isCleaningUp ? (
                    <CircularProgress size={14} color="inherit" />
                  ) : (
                    <DeleteSweep />
                  )
                }
                onClick={() => cleanupOrphanedChats()}
                disabled={isCleaningUp}
              >
                Clean up old history
              </Button>
            </SettingsRow>
            <SettingsRow
              label="Database location"
              description="SQLite file storing AI providers, conversations, and templates"
            >
              <Typography
                variant="caption"
                color="text.secondary"
                title={settingsWithDbInfo?.mainDatabasePath}
                sx={{
                  maxWidth: 320,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {settingsWithDbInfo?.mainDatabasePath || 'Loading...'}
              </Typography>
            </SettingsRow>
          </SettingsSection>

          <AISettingsTab />
        </SettingsStack>
      )}

      {/* Providers */}
      {activeTab === 'Providers' && (
        <SettingsStack>
          <SettingsSection
            title="Providers"
            icon={<SmartToyOutlined />}
            description="Use the switch to choose which provider is active."
            action={
              <>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<Refresh />}
                  onClick={handleRefreshAll}
                >
                  Refresh
                </Button>
                <Button
                  size="small"
                  variant="contained"
                  startIcon={<Add />}
                  onClick={handleCreateProvider}
                >
                  Add Provider
                </Button>
              </>
            }
          >
            {providers.length === 0 ? (
              <SettingsRow
                label="No AI Providers Configured"
                description="Add your first AI provider to enable enhanced dbt functionality."
              />
            ) : (
              providers.map((provider) => (
                <ProviderCard
                  key={provider.id}
                  provider={provider}
                  isActive={activeProvider?.id === provider.id}
                  onEdit={handleEditProvider}
                  onRefresh={handleRefreshAll}
                />
              ))
            )}
          </SettingsSection>

          <CreateProviderDialog
            open={createDialogOpen}
            onClose={handleDialogClose}
            provider={selectedProvider}
          />
        </SettingsStack>
      )}
    </Box>
  );
};
