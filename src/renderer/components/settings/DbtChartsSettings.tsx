import React from 'react';
import { Button, CircularProgress, Typography } from '@mui/material';
import {
  CloudDownload,
  Delete,
  InsertChartOutlined,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import {
  useDbtChartsInstallProgress,
  useDbtChartsStatus,
  useInstallDbtCharts,
  useUninstallDbtCharts,
} from '../../controllers';
import { ConfirmationModal } from '../modals';
import {
  SettingsRow,
  SettingsSection,
  SettingsStack,
  SettingsStatus,
} from './SettingsLayout';

export const DbtChartsSettings: React.FC = () => {
  const { data: status, isLoading } = useDbtChartsStatus();
  const progress = useDbtChartsInstallProgress();
  const { mutateAsync: install, isLoading: installing } = useInstallDbtCharts();
  const { mutateAsync: uninstall, isLoading: uninstalling } =
    useUninstallDbtCharts();
  const [confirmUninstall, setConfirmUninstall] = React.useState(false);

  const runInstall = async () => {
    const res = await install();
    if (res.ok) toast.success('dbt Charts installed');
    else toast.error(res.error ?? 'Install failed');
  };

  return (
    <SettingsStack>
      <SettingsSection
        title="dbt Charts"
        icon={<InsertChartOutlined />}
        description="YAML dashboards from your dbt models, served locally."
      >
        <SettingsRow label="Installation status">
          {isLoading && <CircularProgress size={14} />}
          {status &&
            (status.installed ? (
              <SettingsStatus tone="success">Installed</SettingsStatus>
            ) : (
              <SettingsStatus tone="neutral">Not installed</SettingsStatus>
            ))}
        </SettingsRow>
        {status?.installed && (
          <>
            <SettingsRow label="Version">
              <Typography variant="body2">{status.version}</Typography>
            </SettingsRow>
            <SettingsRow label="Python">
              <Typography variant="body2">{status.pythonVersion}</Typography>
            </SettingsRow>
            <SettingsRow label="Adapters">
              <Typography variant="body2">
                {status.extras.length
                  ? status.extras.join(', ')
                  : 'built-in only'}
              </Typography>
            </SettingsRow>
          </>
        )}
        <SettingsRow label="Actions">
          <Button
            size="small"
            variant="contained"
            startIcon={<CloudDownload />}
            disabled={installing || uninstalling}
            onClick={runInstall}
            data-testid="dbt-charts-settings-install"
          >
            {status?.installed ? 'Reinstall' : 'Install'}
          </Button>
          {status?.installed && (
            <Button
              size="small"
              color="error"
              startIcon={<Delete />}
              disabled={installing || uninstalling}
              onClick={() => setConfirmUninstall(true)}
              sx={{ ml: 1 }}
            >
              Uninstall
            </Button>
          )}
        </SettingsRow>
        {installing && progress && (
          <SettingsRow label="Progress">
            <Typography variant="body2">{progress.message}</Typography>
          </SettingsRow>
        )}
      </SettingsSection>
      <ConfirmationModal
        isOpen={confirmUninstall}
        onClose={() => setConfirmUninstall(false)}
        onConfirm={async () => {
          setConfirmUninstall(false);
          await uninstall();
          toast.info('dbt Charts uninstalled');
        }}
        title="Uninstall dbt Charts"
        question="This removes the dbt Charts environment. Project files in charts/ are not touched."
      />
    </SettingsStack>
  );
};
