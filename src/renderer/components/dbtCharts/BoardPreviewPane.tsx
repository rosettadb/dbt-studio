import React from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  IconButton,
  Tooltip,
  Typography,
} from '@mui/material';
import { Fullscreen, FullscreenExit } from '@mui/icons-material';
import { dlog } from '../../../shared/dbtChartsDebug'; // DBT-CHARTS-DEBUG
import { boardUrlPath } from '../../../shared/dbtCharts';
import type { DbtChartsDiagnostic, Project } from '../../../types/backend';
import { useBoardServer, useValidateBoard } from '../../controllers';
import { ChartsStateGate, ManifestBanner } from './ChartsSetupStates';
import { toProjectRelativePath } from './boardFiles';

type Props = {
  project?: Project;
  filePath: string;
  /** Increments each time the board file is saved. */
  saveTick: number;
  isFull: boolean;
  onToggleFull: () => void;
  onDiagnostics: (diagnostics: DbtChartsDiagnostic[]) => void;
};

const ServerView: React.FC<Props> = ({
  project,
  filePath,
  saveTick,
  isFull,
  onToggleFull,
  onDiagnostics,
}) => {
  const projectId = project!.id;
  const { status, start, isStarting } = useBoardServer(projectId);
  const { mutateAsync: validate } = useValidateBoard();
  const [reloadKey, setReloadKey] = React.useState(0);
  const [errorCount, setErrorCount] = React.useState(0);
  const [parseError, setParseError] = React.useState<string | null>(null);
  const requested = React.useRef(false);
  const lastTick = React.useRef(saveTick);

  const rel = toProjectRelativePath(project!.path, filePath) ?? filePath;

  React.useEffect(() => {
    // DBT-CHARTS-DEBUG
    dlog('renderer:pane', 'server status', {
      projectId,
      rel,
      status,
      isStarting,
    }); // DBT-CHARTS-DEBUG
  }, [projectId, rel, status, isStarting]); // DBT-CHARTS-DEBUG

  // Lazy start: the first board view asks for the server.
  React.useEffect(() => {
    if (requested.current) return;
    if (status.state === 'stopped') {
      requested.current = true;
      dlog('renderer:pane', 'lazy start requested', { projectId }); // DBT-CHARTS-DEBUG
      start()
        .then(
          (r) => dlog('renderer:pane', 'start resolved', r),
          (e) => dlog('renderer:pane', 'start REJECTED', e?.message ?? e),
        )
        .catch(() => {}); // DBT-CHARTS-DEBUG
    }
  }, [status.state, start, projectId]);

  // Validate on save; reload only when the board has no errors.
  React.useEffect(() => {
    if (saveTick === lastTick.current) return;
    lastTick.current = saveTick;
    dlog('renderer:pane', 'save tick -> validate', { rel, saveTick }); // DBT-CHARTS-DEBUG
    (async () => {
      try {
        const diagnostics = await validate({ projectId, filePath: rel });
        dlog('renderer:pane', 'validate result', diagnostics); // DBT-CHARTS-DEBUG
        onDiagnostics(diagnostics);
        setParseError(null);
        const errors = diagnostics.filter((d) => d.severity === 'error');
        setErrorCount(errors.length);
        if (errors.length === 0) setReloadKey((k) => k + 1);
      } catch (e: any) {
        dlog('renderer:pane', 'validate FAILED', e?.message ?? e); // DBT-CHARTS-DEBUG
        setParseError(e?.message ?? 'Validation failed');
      }
    })();
  }, [saveTick, validate, projectId, rel, onDiagnostics]);

  const retry = () => {
    requested.current = true;
    dlog('renderer:pane', 'Retry clicked'); // DBT-CHARTS-DEBUG
    start()
      .then(
        (r) => dlog('renderer:pane', 'retry resolved', r),
        (e) => dlog('renderer:pane', 'retry REJECTED', e?.message ?? e),
      )
      .catch(() => {}); // DBT-CHARTS-DEBUG
  };

  let body: React.ReactNode;
  if (status.state === 'crashed') {
    body = (
      <Box sx={{ p: 2 }}>
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={retry}>
              Retry
            </Button>
          }
        >
          dbt Charts failed to start or stopped.
          {status.error && (
            <Box
              component="pre"
              sx={{ mt: 1, mb: 0, fontSize: 11, whiteSpace: 'pre-wrap' }}
            >
              {status.error}
            </Box>
          )}
        </Alert>
      </Box>
    );
  } else if (status.state === 'running' && status.url) {
    const src = `${status.url.replace(/\/$/, '')}${boardUrlPath(rel)}`;
    dlog('renderer:pane', 'render iframe', { src, reloadKey }); // DBT-CHARTS-DEBUG
    body = (
      <iframe
        key={reloadKey}
        onLoad={() => dlog('renderer:pane', 'iframe onLoad', { src })} // DBT-CHARTS-DEBUG
        onError={() => dlog('renderer:pane', 'iframe onError', { src })} // DBT-CHARTS-DEBUG
        title="dbt Charts board"
        src={src}
        data-testid="dbt-charts-iframe"
        style={{ border: 0, width: '100%', height: '100%' }}
      />
    );
  } else {
    body = (
      <Box
        sx={{ p: 3, display: 'flex', gap: 1.5, alignItems: 'center' }}
        data-testid="dbt-charts-starting"
      >
        <CircularProgress size={18} />
        <Typography variant="body2">
          {isStarting || status.state === 'starting'
            ? 'Starting dbt Charts…'
            : 'Waiting for dbt Charts…'}
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 1,
          py: 0.25,
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <Typography variant="caption" color="text.secondary">
          Board
        </Typography>
        <Tooltip title={isFull ? 'Show editor' : 'Full preview'}>
          <IconButton size="small" onClick={onToggleFull}>
            {isFull ? (
              <FullscreenExit fontSize="small" />
            ) : (
              <Fullscreen fontSize="small" />
            )}
          </IconButton>
        </Tooltip>
      </Box>
      {errorCount > 0 && (
        <Alert severity="error" sx={{ borderRadius: 0 }}>
          Board has {errorCount} error{errorCount === 1 ? '' : 's'}, showing
          last good version
        </Alert>
      )}
      {parseError && (
        <ManifestBanner
          projectId={projectId}
          error={parseError}
          onFixed={() => setParseError(null)}
        />
      )}
      <Box sx={{ flex: 1, minHeight: 0 }}>{body}</Box>
    </Box>
  );
};

export const BoardPreviewPane: React.FC<Props> = ({
  project,
  filePath,
  saveTick,
  isFull,
  onToggleFull,
  onDiagnostics,
}) => (
  <ChartsStateGate project={project}>
    <ServerView
      project={project}
      filePath={filePath}
      saveTick={saveTick}
      isFull={isFull}
      onToggleFull={onToggleFull}
      onDiagnostics={onDiagnostics}
    />
  </ChartsStateGate>
);
