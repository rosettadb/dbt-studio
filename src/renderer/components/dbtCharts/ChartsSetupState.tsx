import React from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  IconButton,
  LinearProgress,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Close,
  ContentCopy,
  Download,
  InsertChartOutlined,
  PlayArrow,
  Refresh,
} from '@mui/icons-material';
import {
  DBT_CHARTS_VERSION,
  DBT_CHARTS_PYTHON,
} from '../../../shared/dbtCharts';

export type ChartsSetupKind =
  | 'loading'
  | 'unsupported'
  | 'not-installed'
  | 'installing'
  | 'missing-extra'
  | 'parsing'
  | 'parse-failed'
  | 'starting'
  | 'stopped'
  | 'crashed';

interface Props {
  kind: ChartsSetupKind;
  adapter?: string | null;
  reason?: string;
  extra?: string;
  installLine?: string | null;
  installError?: string | null;
  lines?: string[];
  error?: string | null;
  dbtV2?: boolean;
  onInstall?: () => void;
  onCancelInstall?: () => void;
  onRunParse?: () => void;
  onRetry?: () => void;
  onStart?: () => void;
}

const buttonSx = { height: '32px' };

const LogBox: React.FC<{ lines: string[] }> = ({ lines }) => (
  <Box
    component="pre"
    sx={{
      m: 0,
      p: 1,
      width: '100%',
      maxHeight: 160,
      overflow: 'auto',
      bgcolor: 'background.default',
      border: 1,
      borderColor: 'divider',
      borderRadius: 1,
      fontFamily: 'monospace',
      fontSize: 12,
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
      textAlign: 'left',
    }}
  >
    {lines.join('\n')}
  </Box>
);

const Spinner: React.FC<{ text: string }> = ({ text }) => (
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
    <CircularProgress size={20} />
    <Typography variant="body2" color="text.secondary">
      {text}
    </Typography>
  </Box>
);

/** Everything the board pane shows before a board can render. */
export const ChartsSetupState: React.FC<Props> = ({
  kind,
  adapter,
  reason,
  extra,
  installLine,
  installError,
  lines,
  error,
  dbtV2,
  onInstall,
  onCancelInstall,
  onRunParse,
  onRetry,
  onStart,
}) => {
  const copyLog = React.useCallback(() => {
    const text = [error, ...(lines ?? [])].filter(Boolean).join('\n');
    navigator.clipboard?.writeText(text).catch(() => undefined);
  }, [error, lines]);

  const renderBody = () => {
    switch (kind) {
      case 'loading':
        return <Spinner text="Checking dbt Charts…" />;
      case 'unsupported':
        return (
          <Typography variant="body2" color="text.secondary">
            {reason ??
              `dbt Charts can't connect to ${adapter ?? 'this'} projects yet.`}
          </Typography>
        );
      case 'not-installed':
        return (
          <>
            <Typography variant="subtitle2">
              dbt Charts is not installed.
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Installs dbt-charts {DBT_CHARTS_VERSION} in its own Python{' '}
              {DBT_CHARTS_PYTHON.split('.').slice(0, 2).join('.')} environment.
              Your dbt installation is not changed.
            </Typography>
            {installError && (
              <Alert severity="error" sx={{ py: 0, width: '100%' }}>
                <Typography variant="body2">{installError}</Typography>
              </Alert>
            )}
            <Button
              variant="contained"
              size="small"
              startIcon={<Download />}
              sx={buttonSx}
              onClick={onInstall}
            >
              Install dbt Charts
            </Button>
          </>
        );
      case 'installing':
        return (
          <>
            <Typography variant="subtitle2">Installing dbt Charts…</Typography>
            <LinearProgress sx={{ width: '100%' }} />
            {installLine && (
              <Typography
                variant="caption"
                color="text.secondary"
                noWrap
                sx={{ fontFamily: 'monospace', maxWidth: '100%' }}
              >
                {installLine}
              </Typography>
            )}
            <Typography variant="caption" color="text.secondary">
              See Task Manager for the full progress.
            </Typography>
            {onCancelInstall && (
              <Button
                variant="outlined"
                size="small"
                startIcon={<Close />}
                sx={buttonSx}
                onClick={onCancelInstall}
              >
                Cancel
              </Button>
            )}
          </>
        );
      case 'missing-extra':
        return (
          <>
            <Typography variant="subtitle2">
              Add {adapter ?? extra} support to dbt Charts.
            </Typography>
            {(extra === 'sqlserver' || extra === 'fabric') && (
              <Typography variant="caption" color="text.secondary">
                Needs the Microsoft ODBC Driver for SQL Server.
              </Typography>
            )}
            {installError && (
              <Alert severity="error" sx={{ py: 0, width: '100%' }}>
                <Typography variant="body2">{installError}</Typography>
              </Alert>
            )}
            <Button
              variant="contained"
              size="small"
              startIcon={<Download />}
              sx={buttonSx}
              onClick={onInstall}
            >
              Install {adapter ?? extra} support
            </Button>
          </>
        );
      case 'parsing':
        return <Spinner text="Running dbt parse…" />;
      case 'parse-failed':
        return (
          <>
            <Alert severity="error" sx={{ py: 0, width: '100%' }}>
              <Typography variant="body2">
                dbt parse failed, so dbt Charts can&apos;t read the
                project&apos;s models.
              </Typography>
            </Alert>
            {lines && lines.length > 0 && <LogBox lines={lines} />}
            <Button
              variant="outlined"
              size="small"
              startIcon={<PlayArrow />}
              sx={buttonSx}
              onClick={onRunParse}
            >
              Run dbt parse
            </Button>
          </>
        );
      case 'starting':
        return <Spinner text="Starting dbt Charts…" />;
      case 'stopped':
        return (
          <>
            <Typography variant="body2" color="text.secondary">
              The dbt Charts server is stopped.
            </Typography>
            <Button
              variant="outlined"
              size="small"
              startIcon={<PlayArrow />}
              sx={buttonSx}
              onClick={onStart}
            >
              Start server
            </Button>
          </>
        );
      case 'crashed':
      default:
        return (
          <>
            <Alert severity="error" sx={{ py: 0, width: '100%' }}>
              <Typography variant="body2">
                {error ?? 'dbt Charts stopped.'}
              </Typography>
            </Alert>
            {lines && lines.length > 0 && <LogBox lines={lines} />}
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <Button
                variant="outlined"
                size="small"
                startIcon={<Refresh />}
                sx={buttonSx}
                onClick={onRetry}
              >
                Retry
              </Button>
              <Tooltip title="Copy log">
                <IconButton size="small" onClick={copyLog}>
                  <ContentCopy fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
          </>
        );
    }
  };

  return (
    <Box
      sx={{
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        p: 2,
        overflow: 'auto',
      }}
    >
      <Box
        sx={{
          maxWidth: 380,
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          gap: 1.5,
        }}
      >
        <InsertChartOutlined sx={{ fontSize: 32, color: 'text.secondary' }} />
        {renderBody()}
        {dbtV2 && (
          <Typography variant="caption" color="text.secondary">
            dbt Charts runs in its own environment, so it works with dbt v2
            projects. It reads target/manifest.json.
          </Typography>
        )}
      </Box>
    </Box>
  );
};
