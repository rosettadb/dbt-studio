import React from 'react';
import { Box, IconButton, Tooltip, Typography } from '@mui/material';
import {
  CloseFullscreen,
  OpenInFull,
  VerticalSplit,
} from '@mui/icons-material';
import SplitPane, { Pane } from 'split-pane-react';
import 'split-pane-react/esm/themes/default.css';
import { Editor } from '../editor';
import {
  ChartsPreviewPane,
  ChartsSetupState,
  useChartsMarkers,
} from '../dbtCharts';
import { useTabs } from '../../context/TabsProvider';
import { useTaskManager } from '../../context/TaskManagerProvider';
import { useRefreshProjectFiles } from '../../hooks/useRefreshProjectFiles';
import { useGetSettings } from '../../controllers';
import {
  chartsErrorMessage,
  useChartsInstallLine,
  useChartsServer,
  useChartsValidation,
  useInstallDbtCharts,
  useProjectChartsState,
  useRunChartsDbtParse,
} from '../../controllers/dbtCharts.controller';
import { subscribeToToolResult } from '../../services/agentEvents.service';
import {
  DBT_CHARTS_INSTALL_TASK,
  DBT_CHARTS_REFRESH_MUTATION,
  boardUrlPath,
  chartsRelativePath,
  folderUrlPath,
  isChartsBoardPath,
  isChartsPartial,
  looksLikeChartsPath,
} from '../../../shared/dbtCharts';
import { codeFileView } from './CodeFileView';
import type { FileViewDefinition, FileViewProps } from './types';

type Layout = 'split' | 'editor' | 'preview';

const LAYOUT_KEY = 'dbt-studio:charts-layout';
const VALIDATE_DEBOUNCE_MS = 400;

const readLayout = (): Layout => {
  try {
    const stored = window.localStorage.getItem(LAYOUT_KEY);
    return stored === 'editor' || stored === 'preview' ? stored : 'split';
  } catch {
    return 'split';
  }
};

const writeLayout = (layout: Layout) => {
  try {
    window.localStorage.setItem(LAYOUT_KEY, layout);
  } catch {
    // Storage unavailable: the layout just isn't remembered.
  }
};

const Sash = (_: number, active: boolean) => (
  <Box
    sx={{
      width: '4px',
      height: '100%',
      cursor: 'col-resize',
      bgcolor: active ? 'primary.main' : 'divider',
      opacity: active ? 0.6 : 1,
    }}
  />
);

// The refresh tool result: { ok: true, mutation, relativePath }.
const refreshedPath = (toolName: string, result: unknown): string | null => {
  if (toolName !== 'studio_charts_refresh_preview') return null;
  if (!result || typeof result !== 'object') return null;
  const value = result as Record<string, unknown>;
  if (value.ok !== true || value.mutation !== DBT_CHARTS_REFRESH_MUTATION) {
    return null;
  }
  return typeof value.relativePath === 'string' ? value.relativePath : null;
};

const ValidationStatus: React.FC<{
  checking: boolean;
  errorCount: number;
  warningCount: number;
  failed?: boolean;
  visible: boolean;
}> = ({ checking, errorCount, warningCount, failed, visible }) => {
  if (!visible) return null;
  let color = 'success.main';
  let text = 'Valid';
  if (checking) {
    color = 'warning.main';
    text = 'Checking…';
  } else if (failed) {
    color = 'error.main';
    text = 'Validation failed';
  } else if (errorCount > 0) {
    color = 'error.main';
    text = `${errorCount} ${errorCount === 1 ? 'error' : 'errors'}`;
  } else if (warningCount > 0) {
    color = 'warning.main';
    text = `${warningCount} ${warningCount === 1 ? 'warning' : 'warnings'}`;
  }
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mr: 1 }}>
      <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: color }} />
      <Typography variant="caption" color="text.secondary" noWrap>
        {text}
      </Typography>
    </Box>
  );
};

// YAML editor + live dct board for one board file under <project>/charts/.
const ChartsBoardView: React.FC<FileViewProps> = ({ tab, project }) => {
  const { updateTabContent, markTabSaved, setTabError, openFile } = useTabs();
  const refreshProjectFiles = useRefreshProjectFiles();
  const { data: settings } = useGetSettings();
  const { tasks, cancel: cancelTask } = useTaskManager();
  const installLine = useChartsInstallLine();
  const installMutation = useInstallDbtCharts();
  const parseMutation = useRunChartsDbtParse();
  const stateQuery = useProjectChartsState(project.path);
  const state = stateQuery.data;

  const relativePath = chartsRelativePath(project.path, tab.path);
  const isPartial = isChartsPartial(tab.path);
  const installTask = tasks.find(
    (task) =>
      task.type === DBT_CHARTS_INSTALL_TASK &&
      (task.status === 'pending' || task.status === 'running'),
  );
  const ready =
    !!state && state.support.supported && state.extraInstalled && !installTask;

  // An install started from any board tab: re-read the state when it ends.
  const installing = !!installTask;
  const { refetch } = stateQuery;
  React.useEffect(() => {
    if (!installing) refetch();
  }, [installing, refetch]);

  const {
    status: server,
    startError,
    retry,
  } = useChartsServer(project.path, ready);
  const { result, checking, validate } = useChartsValidation(
    project.path,
    tab.path,
  );
  useChartsMarkers(project.id, tab.path, relativePath, result?.diagnostics);

  // Validate on open and after every save or agent write (both change
  // savedContent). dct's own live reload refreshes the board itself.
  React.useEffect(() => {
    if (!state?.extraInstalled || installTask) return undefined;
    const timer = window.setTimeout(() => {
      validate().catch(() => undefined);
    }, VALIDATE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [
    state?.extraInstalled,
    installTask,
    tab.path,
    tab.savedContent,
    validate,
  ]);

  // The agent's studio_charts_refresh_preview reloads this board explicitly.
  const [reloadKey, setReloadKey] = React.useState(0);
  const reload = React.useCallback(() => setReloadKey((key) => key + 1), []);
  React.useEffect(
    () =>
      subscribeToToolResult((payload) => {
        const refreshed = refreshedPath(payload.toolName, payload.result);
        if (!refreshed || refreshed !== relativePath) return;
        validate().catch(() => undefined);
        reload();
      }),
    [relativePath, validate, reload],
  );

  const [layout, setLayout] = React.useState<Layout>(readLayout);
  const changeLayout = (next: Layout) => {
    setLayout(next);
    writeLayout(next);
  };
  const [sizes, setSizes] = React.useState<(string | number)[]>(['50%', '50%']);

  const [installError, setInstallError] = React.useState<string | null>(null);
  const install = () => {
    setInstallError(null);
    installMutation
      .mutateAsync(project.path)
      .catch((error) => setInstallError(chartsErrorMessage(error)));
  };
  const runParse = () => {
    parseMutation
      .mutateAsync(project.path)
      .then((parsed) => (parsed.ok ? retry() : undefined))
      .catch(() => undefined);
  };

  const dbtV2 = !!settings?.dbtVersion?.startsWith('2.');

  const renderSetup = (): React.ReactNode | null => {
    if (stateQuery.isLoading || !state) {
      return <ChartsSetupState kind="loading" />;
    }
    if (!state.support.supported) {
      return (
        <ChartsSetupState
          kind="unsupported"
          adapter={state.adapter}
          reason={state.support.reason}
        />
      );
    }
    if (installTask) {
      return (
        <ChartsSetupState
          kind="installing"
          installLine={installLine}
          onCancelInstall={
            installTask.cancellable
              ? () => cancelTask(installTask.id)
              : undefined
          }
        />
      );
    }
    if (!state.extraInstalled) {
      return (
        <ChartsSetupState
          kind={state.installed ? 'missing-extra' : 'not-installed'}
          adapter={state.adapter}
          extra={state.support.extra}
          installError={installError}
          dbtV2={dbtV2}
          onInstall={install}
        />
      );
    }
    if (parseMutation.isLoading || server.state === 'parsing') {
      return <ChartsSetupState kind="parsing" dbtV2={dbtV2} />;
    }
    if (server.state === 'parse-failed') {
      return (
        <ChartsSetupState
          kind="parse-failed"
          lines={
            parseMutation.data && !parseMutation.data.ok
              ? parseMutation.data.lines
              : server.lines
          }
          dbtV2={dbtV2}
          onRunParse={runParse}
        />
      );
    }
    if (startError || server.state === 'crashed') {
      return (
        <ChartsSetupState
          kind="crashed"
          error={startError ?? server.error}
          lines={server.lines}
          onRetry={() => {
            retry().catch(() => undefined);
          }}
        />
      );
    }
    if (server.state === 'stopped' && server.userStopped) {
      return (
        <ChartsSetupState
          kind="stopped"
          onStart={() => {
            retry().catch(() => undefined);
          }}
        />
      );
    }
    if (server.state !== 'running') {
      return <ChartsSetupState kind="starting" />;
    }
    return null;
  };

  const editor = (
    <Editor
      projectId={project.id}
      projectPath={project.path}
      tabs={[tab]}
      activeTabId={tab.id}
      onTabContentChange={updateTabContent}
      onTabSaved={(tabId) => {
        markTabSaved(tabId);
        refreshProjectFiles();
      }}
      onTabError={setTabError}
      onGitStatusRefresh={refreshProjectFiles}
      onOpenFile={openFile}
      extraActions={
        <>
          <ValidationStatus
            visible={ready}
            checking={checking}
            errorCount={result?.errorCount ?? 0}
            warningCount={result?.warningCount ?? 0}
            failed={result?.failed}
          />
          <Tooltip
            title={layout === 'editor' ? 'Show preview' : 'Hide preview'}
          >
            <IconButton
              size="small"
              onClick={() =>
                changeLayout(layout === 'editor' ? 'split' : 'editor')
              }
            >
              <VerticalSplit fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Preview only">
            <IconButton size="small" onClick={() => changeLayout('preview')}>
              <OpenInFull fontSize="small" />
            </IconButton>
          </Tooltip>
        </>
      }
    />
  );

  const preview = (
    <Box sx={{ height: '100%', position: 'relative' }}>
      {layout === 'preview' && (
        <Tooltip title="Show editor">
          <IconButton
            size="small"
            onClick={() => changeLayout('split')}
            sx={{
              position: 'absolute',
              left: 4,
              bottom: 4,
              zIndex: 1,
              bgcolor: 'background.paper',
              border: 1,
              borderColor: 'divider',
            }}
          >
            <CloseFullscreen fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
      <ChartsPreviewPane
        boardPath={boardUrlPath(project.path, tab.path)}
        folderPath={folderUrlPath(project.path, tab.path)}
        isPartial={isPartial}
        serverState={server.state}
        serverUrl={server.url}
        reloadKey={reloadKey}
        errorCount={result?.errorCount ?? 0}
        setup={renderSetup()}
        onReload={reload}
      />
    </Box>
  );

  return (
    <Box sx={{ height: '100%', overflow: 'hidden' }}>
      {layout === 'editor' && editor}
      {layout === 'preview' && preview}
      {layout === 'split' && (
        <SplitPane
          split="vertical"
          sizes={sizes}
          onChange={setSizes}
          sashRender={Sash}
        >
          <Pane minSize={240}>{editor}</Pane>
          <Pane minSize={280}>{preview}</Pane>
        </SplitPane>
      )}
    </Box>
  );
};

const ChartsFileView: React.FC<FileViewProps> = ({ tab, project }) => {
  if (!isChartsBoardPath(project.path, tab.path)) {
    // A `charts` folder that is not the project-root one (models/charts/…).
    const CodeView = codeFileView.Component;
    return <CodeView tab={tab} project={project} />;
  }
  return <ChartsBoardView tab={tab} project={project} />;
};

export const chartsFileView: FileViewDefinition = {
  id: 'dbt-charts',
  matches: (tab) => looksLikeChartsPath(tab.path),
  Component: ChartsFileView,
};
