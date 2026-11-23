import React from 'react';
import { toast } from 'react-toastify';
import {
  CreatePipelineModal,
  PipelineSelectorModal,
  PushToCloudModal,
  RunWithEnvModal,
} from '../modals';
import {
  useGetConnectionById,
  useGetSettings,
  useListPipelines,
} from '../../controllers';
import { useTabs } from '../../context/TabsProvider';
import { useRefreshProjectFiles } from '../../hooks/useRefreshProjectFiles';
import type { Project } from '../../../types/backend';
import { pipelineRunStore, usePipelineRunState } from './pipelineRunStore';

// The pipeline dialogs of the project screen: create a pipeline, pick one
// to run, run it on the cloud, run it on this machine. Which one shows is
// decided by `pipelineRunStore`.
export const PipelineOverlays: React.FC<{ project: Project }> = ({
  project,
}) => {
  const state = usePipelineRunState();
  const { openFile } = useTabs();
  const { data: settings } = useGetSettings();
  const { data: connection } = useGetConnectionById(project.connectionId);
  const refreshProjectFiles = useRefreshProjectFiles();
  const { refetch: refetchPipelines } = useListPipelines(project.id);

  // Nothing stays open when the project screen is left.
  React.useEffect(() => () => pipelineRunStore.reset(), []);

  const handlePipelineCreated = React.useCallback(
    async (filePath: string) => {
      await refetchPipelines();
      await refreshProjectFiles();
      openFile(filePath);
    },
    [refetchPipelines, refreshProjectFiles, openFile],
  );

  return (
    <>
      <CreatePipelineModal
        isOpen={state.isCreateOpen}
        onClose={pipelineRunStore.closeCreate}
        project={project}
        onCreated={(filePath) => handlePipelineCreated(filePath)}
        onApplied={async () => {
          await refetchPipelines();
          await refreshProjectFiles();
        }}
      />
      {state.selectorMode === 'cloud' && (
        <PipelineSelectorModal
          isOpen
          onClose={pipelineRunStore.closeSelector}
          mode="cloud"
          project={project}
          onCreated={openFile}
          onSelect={(pipeline) => {
            pipelineRunStore.closeSelector();
            pipelineRunStore.requestCloudRun(
              `--pipeline_name ${pipeline.name}`,
            );
          }}
        />
      )}
      {state.selectorMode === 'local' && (
        <PipelineSelectorModal
          isOpen
          onClose={pipelineRunStore.closeSelector}
          mode="local"
          project={project}
          onCreated={openFile}
          onSelect={(pipeline) => {
            pipelineRunStore.closeSelector();
            if (!settings?.runnerPath) {
              toast.error('Local runner is not installed.');
              return;
            }
            const ext = pipeline.path.slice(pipeline.path.lastIndexOf('.'));
            pipelineRunStore.requestLocalRun(`${pipeline.name}${ext}`);
          }}
        />
      )}
      {state.cloudRunArgs !== null && (
        <PushToCloudModal
          isOpen
          onClose={pipelineRunStore.clearCloudRun}
          project={project}
          command="pipeline"
          initialDbtArguments={state.cloudRunArgs}
        />
      )}
      {state.localRunFile && (
        <RunWithEnvModal
          isOpen
          onClose={pipelineRunStore.clearLocalRun}
          project={project}
          pipelineRelativePath={state.localRunFile}
          connectionName={connection?.connection?.name}
        />
      )}
    </>
  );
};
