import React from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  LinearProgress,
  Typography,
} from '@mui/material';
import { toast } from 'react-toastify';
import { dlog } from '../../../shared/dbtChartsDebug'; // DBT-CHARTS-DEBUG
import type { Project } from '../../../types/backend';
import {
  useDbtChartsInstallProgress,
  useDbtChartsProjectState,
  useDbtChartsStatus,
  useEnsureManifest,
  useInstallDbtCharts,
  useSetupDbtCharts,
} from '../../controllers';

const Centered: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Box
    sx={{
      p: 2,
      display: 'flex',
      flexDirection: 'column',
      gap: 1.5,
      alignItems: 'flex-start',
    }}
  >
    {children}
  </Box>
);

export const UnsupportedState: React.FC<{ reason?: string; type?: string }> = ({
  reason,
  type,
}) => (
  <Centered>
    <Typography variant="subtitle2">dbt Charts unavailable</Typography>
    <Typography variant="body2" color="text.secondary">
      {reason ??
        `dbt Charts does not support ${type ?? 'this'} connections yet.`}
    </Typography>
  </Centered>
);

export const NoConnectionState: React.FC = () => (
  <Centered>
    <Typography variant="subtitle2">No connection</Typography>
    <Typography variant="body2" color="text.secondary">
      Add a database connection to this project to use dbt Charts.
    </Typography>
  </Centered>
);

export const ManifestBanner: React.FC<{
  projectId: string;
  error: string;
  onFixed?: () => void;
}> = ({ projectId, error, onFixed }) => {
  const { mutateAsync: ensure, isLoading } = useEnsureManifest();
  return (
    <Alert
      severity="warning"
      sx={{ borderRadius: 0 }}
      action={
        <Button
          color="inherit"
          size="small"
          disabled={isLoading}
          onClick={async () => {
            const res = await ensure(projectId);
            if (res.ok) onFixed?.();
            else toast.error(res.error ?? 'dbt parse failed');
          }}
        >
          Run dbt parse
        </Button>
      }
    >
      dbt parse failed: {error}
    </Alert>
  );
};

/**
 * Renders the setup state for a project (unsupported, not installed, adapter
 * missing, no dbt_charts.yml) and calls `children` once dbt Charts is ready.
 */
export const ChartsStateGate: React.FC<{
  project?: Project;
  /** Called with the absolute path of the created index board after setup. */
  onSetupDone?: (indexPath: string) => void;
  children: React.ReactNode;
}> = ({ project, onSetupDone, children }) => {
  const projectId = project?.id;
  const { data: status, isLoading: statusLoading } = useDbtChartsStatus();
  const { data: state, isLoading: stateLoading } =
    useDbtChartsProjectState(projectId);
  const progress = useDbtChartsInstallProgress();
  const { mutateAsync: install, isLoading: installing } = useInstallDbtCharts();
  const { mutateAsync: setup, isLoading: settingUp } = useSetupDbtCharts();

  React.useEffect(() => {
    // DBT-CHARTS-DEBUG
    dlog('renderer:gate', 'status/state', {
      projectId,
      connection: project?.connection?.type,
      status,
      state,
      progress,
    }); // DBT-CHARTS-DEBUG
  }, [projectId, project?.connection?.type, status, state, progress]); // DBT-CHARTS-DEBUG

  if (!project?.connection?.type) return <NoConnectionState />;
  if (statusLoading || stateLoading || !status || !state) {
    return (
      <Centered>
        <CircularProgress size={18} />
      </Centered>
    );
  }
  if (!state.support.supported) {
    return (
      <UnsupportedState
        reason={state.support.reason}
        type={project.connection.type}
      />
    );
  }

  const needsInstall = !status.installed;
  const needsExtra =
    status.installed && !!state.support.extra && !state.extraInstalled;

  if (needsInstall || needsExtra) {
    const label = needsInstall
      ? 'Install dbt Charts'
      : `Install ${state.support.extra} support`;
    return (
      <Centered>
        <Typography variant="subtitle2">
          {needsInstall ? 'dbt Charts is not installed' : 'Adapter missing'}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {needsInstall
            ? 'Installs dbt Charts in its own Python environment, separate from dbt.'
            : `The ${state.support.extra} adapter is needed for this connection.`}
        </Typography>
        {installing && progress && (
          <Box sx={{ width: '100%' }}>
            <Typography variant="caption">{progress.message}</Typography>
            <LinearProgress
              variant={
                progress.percentage != null ? 'determinate' : 'indeterminate'
              }
              value={progress.percentage}
            />
          </Box>
        )}
        <Button
          variant="contained"
          size="small"
          disabled={installing}
          data-testid="dbt-charts-install-btn"
          onClick={async () => {
            const res = await install();
            if (!res.ok) toast.error(res.error ?? 'Install failed');
          }}
        >
          {label}
        </Button>
      </Centered>
    );
  }

  if (!state.configExists) {
    return (
      <Centered>
        <Typography variant="subtitle2">Set up dbt Charts</Typography>
        <Typography variant="body2" color="text.secondary">
          Creates dbt_charts.yml and a starter board in charts/.
        </Typography>
        <Button
          variant="contained"
          size="small"
          disabled={settingUp}
          data-testid="dbt-charts-setup-btn"
          onClick={async () => {
            try {
              const res = await setup(project.id);
              onSetupDone?.(res.indexPath);
            } catch (e: any) {
              toast.error(e?.message ?? 'Setup failed');
            }
          }}
        >
          Set up dbt Charts
        </Button>
      </Centered>
    );
  }

  // eslint-disable-next-line react/jsx-no-useless-fragment
  return <>{children}</>;
};
