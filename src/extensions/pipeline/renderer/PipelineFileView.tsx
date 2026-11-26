import React from 'react';
import { Box, IconButton, Tooltip, Typography } from '@mui/material';
import { AccountTree } from '@mui/icons-material';
import { Editor } from '../../../extensionApi/studio/editor';
import { PushToCloudModal } from '../../../extensionApi/studio/modals';
import { RunWithEnvModal } from './runWithEnvModal';
import {
  PipelineView,
  isPipelineFile,
  parsePipelineConfig,
  getPipelineCloudFile,
  getPipelineRelativePath,
} from './pipelineExports';
import { useTabs } from '../../../extensionApi/studio/tabs';
import {
  useCloudRunActionId,
  useCloudRuns,
} from '../../../extensionApi/studio/cloudRunContext';
import { useTaskManager } from '../../../extensionApi/studio/taskManager';
import { buildRunnerTaskId } from './RunnerProvider';
import { useTaskChannel } from '../../../extensionApi/studio/taskChannel';
import { useRefreshProjectFiles } from '../../../extensionApi/studio/refreshProjectFiles';
import {
  useGetConnectionById,
  useGetSettings,
} from '../../../extensionApi/studio/controllers';
import { usePipelineActionId } from '../../../extensionApi/studio/cloudRunController';
import { projectsServices } from '../../../extensionApi/studio/services';
import { usePipelineMacros } from './usePipelineMacros';
import type {
  FileViewDefinition,
  FileViewProps,
} from '../../../extensionApi/renderer';

// Visual pipeline editor over a pipeline YAML tab, with an inline code mode
// that edits the very same tab (so the unsaved-changes dialog, Cmd+S and
// disk refresh all behave exactly like any other file).
const PipelineFileView: React.FC<FileViewProps> = ({ tab, project }) => {
  const {
    updateTabContent,
    updateTabContentByPath,
    markTabSaved,
    setTabError,
    openFile,
  } = useTabs();
  const refreshProjectFiles = useRefreshProjectFiles();
  const { data: settings } = useGetSettings();
  const { data: connection } = useGetConnectionById(project.connectionId);
  const { publishViewed } = useCloudRuns();
  const { cancel: cancelTask } = useTaskManager();

  const isCloud = settings?.env === 'cloud';
  const isDbtV2 = !!settings?.dbtVersion?.startsWith('2.');

  const cloudFile = getPipelineCloudFile(tab.path, project.path);
  const localFile = getPipelineRelativePath(tab.path, project.path);

  // --- Cloud run for this pipeline -------------------------------------
  const recordedActionId = project.pipelineRuns?.[cloudFile] ?? null;
  const resolvedActionId = usePipelineActionId(
    project.externalId ? project.id : null,
    cloudFile,
    recordedActionId,
  );
  const publishedActionId = useCloudRunActionId(project.id, cloudFile);
  const actionId = publishedActionId ?? resolvedActionId;

  // Tell the workspace which run is on screen; the cloud-logs panel follows.
  React.useEffect(() => {
    publishViewed(
      actionId
        ? { actionId, projectId: project.id, pipelineFile: cloudFile }
        : null,
    );
  }, [actionId, project.id, cloudFile, publishViewed]);

  // --- Local run for this pipeline -------------------------------------
  const runnerTask = useTaskChannel(buildRunnerTaskId(project.path, localFile));
  const isLocalRunning =
    runnerTask?.status === 'running' || runnerTask?.status === 'pending';

  const [cloudModalOpen, setCloudModalOpen] = React.useState(false);
  const [envModalOpen, setEnvModalOpen] = React.useState(false);
  const macros = usePipelineMacros(project, connection?.connection);

  const runDisabledReason = React.useMemo(() => {
    if (isDbtV2) {
      return 'dbt Core v2 is in alpha and not yet supported for pipeline runs. Support will be added after the first official v2 release.';
    }
    if (!isCloud && !settings?.runnerPath) {
      return 'The local runner is not available on this machine';
    }
    return undefined;
  }, [isDbtV2, isCloud, settings?.runnerPath]);

  const handleRun = React.useCallback(() => {
    if (isCloud) {
      setCloudModalOpen(true);
      return;
    }
    if (!settings?.runnerPath) return;
    setEnvModalOpen(true);
  }, [isCloud, settings?.runnerPath]);

  // --- Code / visual toggle --------------------------------------------
  const [codeMode, setCodeMode] = React.useState(false);
  React.useEffect(() => {
    setCodeMode(false);
  }, [tab.path]);

  const handleVisualSave = React.useCallback(
    async (content: string) => {
      await projectsServices.saveFileContent({ path: tab.path, content });
      updateTabContentByPath(tab.path, content, { markModified: false });
      await refreshProjectFiles();
    },
    [tab.path, updateTabContentByPath, refreshProjectFiles],
  );

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      <Box sx={{ flex: 1, minHeight: 0 }}>
        {codeMode ? (
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
                {parsePipelineConfig(tab.savedContent ?? tab.content) ===
                  null && (
                  <Typography
                    variant="caption"
                    sx={{
                      bgcolor: 'warning.main',
                      color: 'warning.contrastText',
                      px: 1,
                      py: 0.25,
                      borderRadius: 1,
                      mr: 1,
                    }}
                  >
                    Pipeline YAML is invalid — check syntax and required fields.
                  </Typography>
                )}
                <Tooltip title="Visual editor">
                  <IconButton size="small" onClick={() => setCodeMode(false)}>
                    <AccountTree fontSize="small" />
                  </IconButton>
                </Tooltip>
              </>
            }
          />
        ) : (
          <PipelineView
            content={tab.content}
            onEdit={() => setCodeMode(true)}
            actionId={actionId}
            onSave={handleVisualSave}
            onRun={handleRun}
            runDisabledReason={runDisabledReason}
            isRunning={!isCloud && isLocalRunning}
            onStop={
              !isCloud && runnerTask
                ? () => cancelTask(runnerTask.id)
                : undefined
            }
            onRunWithEnv={!isCloud ? handleRun : undefined}
            macros={macros}
            projectPath={project.path}
          />
        )}
      </Box>

      {cloudModalOpen && (
        <PushToCloudModal
          isOpen={cloudModalOpen}
          onClose={() => setCloudModalOpen(false)}
          project={project}
          command="pipeline"
          initialDbtArguments={`--pipeline_name ${cloudFile.replace(/\.yml$/, '')}`}
        />
      )}
      {envModalOpen && (
        <RunWithEnvModal
          isOpen={envModalOpen}
          onClose={() => setEnvModalOpen(false)}
          project={project}
          pipelineRelativePath={localFile}
          connectionName={connection?.connection?.name}
        />
      )}
    </Box>
  );
};

export const pipelineFileView: FileViewDefinition = {
  id: 'pipeline',
  // Between the preview view (300) and the charts view (100): a YAML file
  // under rosetta/pipelines/ is a pipeline even inside a `charts` folder.
  priority: 200,
  matches: (tab) => isPipelineFile(tab.path),
  Component: PipelineFileView,
};
