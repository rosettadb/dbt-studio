import React from 'react';
import { Box, Tooltip, Typography, Divider } from '@mui/material';
import StorageIcon from '@mui/icons-material/Storage';
import CodeIcon from '@mui/icons-material/Code';
import TerminalIcon from '@mui/icons-material/Terminal';
import {
  useGetSelectedProject,
  useGetSettingsWithDatabaseInfo,
} from '../../controllers';
import { useGetRepoInfo } from '../../controllers/git.controller';
import { Icon } from '../icon';
import { icons } from '../../../../assets';

const FS = 12; // base font size for all items

const Item: React.FC<{
  icon?: React.ReactNode;
  label: string;
  value: string;
  tooltip?: string;
}> = ({ icon, label, value, tooltip }) => (
  <Tooltip title={tooltip ?? label} placement="top">
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        px: 1,
        cursor: 'default',
        '&:hover': { bgcolor: 'action.hover' },
        borderRadius: 0.5,
      }}
    >
      {icon && (
        <Box sx={{ display: 'flex', alignItems: 'center', opacity: 0.7 }}>
          {icon}
        </Box>
      )}
      <Typography variant="caption" sx={{ fontSize: FS, lineHeight: 1 }}>
        {label}:&nbsp;
        <Box component="span" sx={{ opacity: 0.85, fontWeight: 500 }}>
          {value}
        </Box>
      </Typography>
    </Box>
  </Tooltip>
);

const Sep: React.FC = () => (
  <Divider orientation="vertical" flexItem sx={{ mx: 0.25, my: 0.75 }} />
);

export const StatusBar: React.FC = () => {
  const { data: settings } = useGetSettingsWithDatabaseInfo();
  const { data: project } = useGetSelectedProject();
  const { data: repoInfo } = useGetRepoInfo(project?.path ?? '', {
    enabled: !!project?.path,
  });

  const appVersion = window.electron?.app?.version ?? '—';
  const duckdbPkgVersion = settings?.duckdbVersion || '—';
  const dbtVersion = settings?.dbtVersion || '—';
  const pythonVersion = settings?.pythonVersion || '—';
  const rosettaVersion = settings?.rosettaVersion || '—';
  const currentBranch = repoInfo?.currentBranch;

  return (
    <Box
      sx={{
        height: 24,
        display: 'flex',
        alignItems: 'center',
        px: 1,
        bgcolor: 'background.paper',
        borderTop: '2px solid',
        borderColor: 'divider',
        flexShrink: 0,
        overflow: 'hidden',
        gap: 0.25,
      }}
    >
      {/* Left — version */}
      <Tooltip title="Application version" placement="top">
        <Typography
          variant="caption"
          sx={{
            fontSize: FS,
            lineHeight: 1,
            px: 1,
            fontWeight: 500,
            cursor: 'default',
            '&:hover': { bgcolor: 'action.hover' },
            borderRadius: 0.5,
          }}
        >
          v{appVersion}
        </Typography>
      </Tooltip>

      {/* Git branch */}
      {currentBranch && (
        <>
          <Sep />
          <Tooltip title="Current git branch" placement="top">
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                px: 1,
                cursor: 'default',
                '&:hover': { bgcolor: 'action.hover' },
                borderRadius: 0.5,
              }}
            >
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  opacity: 0.75,
                  mt: '-12px',
                }}
              >
                <Icon src={icons.gitBranch} width={11} height={11} />
              </Box>
              <Typography
                variant="caption"
                sx={{ fontSize: FS, lineHeight: 1 }}
              >
                {currentBranch}
              </Typography>
            </Box>
          </Tooltip>
        </>
      )}

      <Box sx={{ flex: 1 }} />

      {/* Right */}
      <Item
        icon={<TerminalIcon sx={{ fontSize: FS }} />}
        label="dbt"
        value={dbtVersion}
        tooltip="dbt Core version"
      />

      <Sep />
      <Item
        icon={<CodeIcon sx={{ fontSize: FS }} />}
        label="Python"
        value={pythonVersion}
        tooltip="Python version"
      />

      <Sep />
      <Item
        icon={<StorageIcon sx={{ fontSize: FS }} />}
        label="DuckDB"
        value={duckdbPkgVersion}
        tooltip="DuckDB node-api version"
      />

      {rosettaVersion && rosettaVersion !== '—' && (
        <>
          <Sep />
          <Item
            label="Rosetta"
            value={rosettaVersion}
            tooltip="Rosetta CLI version"
          />
        </>
      )}
    </Box>
  );
};
