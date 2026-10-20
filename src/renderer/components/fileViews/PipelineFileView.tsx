import React from 'react';
import { Box, IconButton, Tooltip, Typography } from '@mui/material';
import { AccountTree } from '@mui/icons-material';
import { Editor } from '../editor';
import { PushToCloudModal, RunWithEnvModal } from '../modals';
import {
  PipelineView,
  isPipelineFile,
  parsePipelineConfig,
  getPipelineCloudFile,
  getPipelineRelativePath,
} from '../pipelineView';
import { useTabs } from '../../context/TabsProvider';
import {
  useCloudRunActionId,
  useCloudRuns,
} from '../../context/CloudRunProvider';
import { useTaskManager } from '../../context/TaskManagerProvider';
import { buildRunnerTaskId } from '../../context/RunnerProvider';
import { useTaskChannel } from '../../hooks/useTaskChannel';
import { useRefreshProjectFiles } from '../../hooks/useRefreshProjectFiles';
import { useGetConnectionById, useGetSettings } from '../../controllers';
import { usePipelineActionId } from '../../controllers/rosettaCloud.controller';
import { projectsServices } from '../../services';
import type { FileViewDefinition, FileViewProps } from './types';

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

  const runDisabledReason = React.useMemo(() => {
    if (isDbtV2) {
      return 'dbt Core v2 is in alpha and not yet supported for pipeline runs. Support will be added after the first official v2 release.';
    }
    if (!isCloud && !settings?.runnerPath) {
      return 'Install the local runner first (Settings > Local Runner)';
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
            onRunWithEnv={!isCloud ? () => setEnvModalOpen(true) : undefined}
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
  matches: (tab) => isPipelineFile(tab.path),
  Component: PipelineFileView,
};
