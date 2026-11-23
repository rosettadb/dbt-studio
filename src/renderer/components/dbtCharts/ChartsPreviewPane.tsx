import React from 'react';
import {
  Alert,
  Box,
  Button,
  IconButton,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  InsertChartOutlined,
  OpenInNew,
  Refresh,
  TerminalOutlined,
  Visibility,
} from '@mui/icons-material';
import {
  DBT_CHARTS_WEBVIEW_PARTITION,
  type ChartsServerState,
} from '../../../shared/dbtCharts';
import { requestChartsServerPanelFocus } from './chartsServerStore';

interface Props {
  // `/sales/`: the board's path on the dct server.
  boardPath: string;
  // The folder index for a partial or meta.yml (`/a/`).
  folderPath: string;
  isPartial: boolean;
  serverState: ChartsServerState;
  serverUrl?: string;
  reloadKey: number;
  errorCount: number;
  // Shown instead of the board until it can render.
  setup: React.ReactNode | null;
  onReload: () => void;
}

const STATE_LABEL: Record<ChartsServerState, string> = {
  stopped: 'Stopped',
  parsing: 'Running dbt parse…',
  'parse-failed': 'dbt parse failed',
  starting: 'Starting…',
  running: 'Running',
  crashed: 'Crashed',
};

const STATE_COLOR: Record<ChartsServerState, string> = {
  stopped: 'text.disabled',
  parsing: 'warning.main',
  'parse-failed': 'error.main',
  starting: 'warning.main',
  running: 'success.main',
  crashed: 'error.main',
};

const openExternal = (url: string) =>
  window.electron.ipcRenderer.invoke('open:external', url);

/** The live board: a 32px header strip over `dct serve` in an iframe. */
export const ChartsPreviewPane: React.FC<Props> = ({
  boardPath,
  folderPath,
  isPartial,
  serverState,
  serverUrl,
  reloadKey,
  errorCount,
  setup,
  onReload,
}) => {
  const [showFolder, setShowFolder] = React.useState(false);
  React.useEffect(() => {
    setShowFolder(false);
  }, [boardPath]);

  const path = isPartial ? folderPath : boardPath;
  const frameUrl = serverUrl ? `${serverUrl}${path}` : undefined;
  const running = serverState === 'running' && !!frameUrl && !setup;

  const renderBody = () => {
    if (setup) return setup;
    if (!running) return null;
    if (isPartial && !showFolder) {
      return (
        <Box
          sx={{
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 1.5,
            p: 2,
            textAlign: 'center',
          }}
        >
          <Typography variant="body2" color="text.secondary">
            This file is shared by other boards. It has no page of its own.
          </Typography>
          <Button
            variant="outlined"
            size="small"
            startIcon={<Visibility />}
            sx={{ height: '32px' }}
            onClick={() => setShowFolder(true)}
          >
            Preview folder
          </Button>
        </Box>
      );
    }
    // A <webview>, not an <iframe>: the main window's will-frame-navigate
    // guard (main/windows/main/index.ts) cancels every subframe navigation
    // that isn't the Studio page, so an iframe stays blank. A webview is its
    // own webContents (webviewTag is enabled) and keeps that guard intact.
    // Its own partition keeps the board's zoom, cookies and storage apart
    // from Studio's; main/utils/dbtChartsWebview.ts guards that partition.
    return (
      <Box
        component="webview"
        key={`${frameUrl}#${reloadKey}`}
        src={frameUrl}
        partition={DBT_CHARTS_WEBVIEW_PARTITION}
        title="dbt Charts board"
        sx={{
          width: '100%',
          height: '100%',
          border: 'none',
          display: 'flex',
          bgcolor: 'common.white',
          // The webview gets its own mouse events, so a divider drag
          // (split-pane-react listens on window) stalls once the cursor
          // crosses the board. split-pane-react puts this class on <body>
          // for the length of every drag.
          'body.react-split--disabled &': { pointerEvents: 'none' },
        }}
      />
    );
  };

  return (
    <Box
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        bgcolor: 'background.paper',
      }}
    >
      <Box
        sx={{
          height: 32,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 1,
          borderBottom: 1,
          borderColor: 'divider',
          bgcolor: 'action.hover',
        }}
      >
        <InsertChartOutlined sx={{ fontSize: 16, color: 'text.secondary' }} />
        <Typography
          variant="caption"
          color="text.secondary"
          noWrap
          sx={{ fontFamily: 'monospace', flex: 1, minWidth: 0 }}
        >
          {path}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Box
            sx={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              bgcolor: STATE_COLOR[serverState],
            }}
          />
          <Typography variant="caption" color="text.secondary" noWrap>
            {STATE_LABEL[serverState]}
          </Typography>
        </Box>
        <Tooltip title="Show server log">
          <IconButton size="small" onClick={requestChartsServerPanelFocus}>
            <TerminalOutlined fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Reload board">
          <span>
            <IconButton size="small" onClick={onReload} disabled={!running}>
              <Refresh fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Open in browser">
          <span>
            <IconButton
              size="small"
              disabled={!running}
              onClick={() => frameUrl && openExternal(frameUrl)}
            >
              <OpenInNew fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </Box>
      {running && errorCount > 0 && (
        <Alert
          severity="warning"
          variant="standard"
          sx={{ py: 0, borderRadius: 0, flexShrink: 0 }}
        >
          <Typography variant="body2">
            Board has {errorCount} {errorCount === 1 ? 'error' : 'errors'}. See
            the marked lines.
          </Typography>
        </Alert>
      )}
      <Box sx={{ flex: 1, minHeight: 0 }}>{renderBody()}</Box>
    </Box>
  );
};
