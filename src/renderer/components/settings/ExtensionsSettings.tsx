import React from 'react';
import { Box, Button, IconButton, Switch, Tooltip } from '@mui/material';
import {
  DeleteOutline,
  ExtensionOutlined,
  FolderOpenOutlined,
  RestartAlt,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { useExtensions } from '../../../extensionHost/renderer/ExtensionHostProvider.renderer';
import type { ExtensionStatus } from '../../../extensionHost/renderer/index.renderer';
import type { ExtensionInstallResult } from '../../../extensionHost/shared/protocol.shared';
import {
  SettingsRow,
  SettingsSection,
  SettingsStack,
  SettingsStatus,
} from './SettingsLayout';

type Tone = 'neutral' | 'info' | 'success' | 'error' | 'warning';

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

// One status per extension, worst news first: a pending restart, then a
// failure of either half, then the plain state.
const statusOf = (
  extension: ExtensionStatus,
): { tone: Tone; label: string; detail?: string } => {
  if (extension.restartPending) {
    return { tone: 'warning', label: 'Restart to apply' };
  }
  if (extension.state === 'failed') {
    return { tone: 'error', label: 'Failed', detail: extension.error };
  }
  if (extension.state === 'blocked') {
    return { tone: 'warning', label: 'Cannot start', detail: extension.error };
  }
  if (extension.uiError) {
    return { tone: 'error', label: 'Failed', detail: extension.uiError };
  }
  if (extension.state === 'active') {
    return { tone: 'success', label: 'Enabled' };
  }
  return { tone: 'neutral', label: 'Disabled' };
};

const describe = (extension: ExtensionStatus, detail?: string): string =>
  [
    extension.manifest.description,
    `${extension.id} · ${extension.manifest.version}`,
    detail,
  ]
    .filter(Boolean)
    .join(' · ');

export const ExtensionsSettings: React.FC = () => {
  const extensions = useExtensions();
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const internal = extensions.filter((ext) => ext.source === 'builtin');
  const installed = extensions.filter((ext) => ext.source !== 'builtin');
  const isRestartNeeded = extensions.some((ext) => ext.restartPending);

  const { invoke } = window.electron.ipcRenderer;

  const run = async (id: string, action: () => Promise<unknown>) => {
    setBusyId(id);
    try {
      await action();
    } catch (error) {
      toast.error(messageOf(error));
    } finally {
      setBusyId(null);
    }
  };

  const install = (kind: 'folder' | 'file') =>
    run('install', async () => {
      const result = (await invoke('extensions:install', {
        kind,
      })) as ExtensionInstallResult;
      if (result.status === 'installed') {
        toast.success(`Installed ${result.id}`);
      } else if (result.status === 'failed') {
        toast.error(result.error);
      }
    });

  const renderExtension = (extension: ExtensionStatus) => {
    const status = statusOf(extension);
    return (
      <SettingsRow
        key={extension.id}
        label={extension.manifest.displayName ?? extension.manifest.name}
        description={describe(extension, status.detail)}
      >
        <SettingsStatus tone={status.tone}>{status.label}</SettingsStatus>
        <Tooltip title={extension.enabled ? 'Disable' : 'Enable'}>
          <Switch
            size="small"
            checked={extension.enabled}
            disabled={busyId !== null}
            inputProps={{
              'aria-label': `Enable ${extension.manifest.displayName ?? extension.id}`,
            }}
            onChange={(_event, enabled) =>
              run(extension.id, () =>
                invoke('extensions:setEnabled', { id: extension.id, enabled }),
              )
            }
          />
        </Tooltip>
        {extension.source !== 'builtin' && (
          <Tooltip title="Uninstall">
            <span>
              <IconButton
                size="small"
                disabled={busyId !== null}
                aria-label={`Uninstall ${extension.id}`}
                onClick={() =>
                  run(extension.id, () =>
                    invoke('extensions:uninstall', { id: extension.id }),
                  )
                }
              >
                <DeleteOutline fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        )}
      </SettingsRow>
    );
  };

  return (
    <SettingsStack>
      <SettingsSection
        title="Installed"
        icon={<ExtensionOutlined fontSize="small" />}
        description="Extensions you added. They run with the same access as Studio."
        action={
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            {isRestartNeeded && (
              <Button
                size="small"
                color="warning"
                variant="outlined"
                startIcon={<RestartAlt fontSize="small" />}
                onClick={() => invoke('extensions:restart')}
              >
                Restart Studio
              </Button>
            )}
            <Tooltip title="Open extensions folder">
              <IconButton
                size="small"
                aria-label="Open extensions folder"
                onClick={() => invoke('extensions:openFolder')}
              >
                <FolderOpenOutlined fontSize="small" />
              </IconButton>
            </Tooltip>
            <Button
              size="small"
              variant="outlined"
              disabled={busyId !== null}
              onClick={() => install('folder')}
            >
              Install from folder
            </Button>
            <Button
              size="small"
              variant="contained"
              disabled={busyId !== null}
              onClick={() => install('file')}
            >
              Install from file
            </Button>
          </Box>
        }
      >
        {installed.length > 0 ? (
          installed.map(renderExtension)
        ) : (
          <SettingsRow
            label="No extensions installed"
            description="Install one from a folder or a .zip package."
          />
        )}
      </SettingsSection>

      {internal.length > 0 && (
        <SettingsSection
          title="Included with Studio"
          icon={<ExtensionOutlined fontSize="small" />}
          description="Tools that ship with Studio as extensions. They can be switched off but not removed."
        >
          {internal.map(renderExtension)}
        </SettingsSection>
      )}
    </SettingsStack>
  );
};
