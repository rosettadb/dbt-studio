import React from 'react';
import { AccountTree } from '@mui/icons-material';
import { toast } from 'react-toastify';
import type { ProjectMenuItem } from '../../../extensionApi/renderer';
import { pipelineRunStore } from './pipelineRunStore';

const PipelineMenuIcon: React.FC = () => <AccountTree sx={{ fontSize: 16 }} />;

// "Run Pipeline" in the project run menu, when Studio runs things on the
// cloud: pick a pipeline, then run it.
export const pipelineRunOnCloudItem: ProjectMenuItem = {
  id: 'pipeline.run-cloud',
  order: 100,
  name: 'Run Pipeline',
  subTitle: 'Run a pipeline on the cloud',
  icon: PipelineMenuIcon,
  cloudOnly: true,
  dividerBefore: true,
  onSelect: () => pipelineRunStore.openSelector('cloud'),
};

// The same for a run on this machine.
export const pipelineRunLocallyItem: ProjectMenuItem = {
  id: 'pipeline.run-local',
  order: 200,
  name: 'Run Pipeline (Local Runner)',
  subTitle: 'Run a pipeline on this machine',
  icon: PipelineMenuIcon,
  localOnly: true,
  dividerBefore: true,
  onSelect: ({ settings }) => {
    if (!settings?.runnerPath) {
      toast.info('The local runner is not available on this machine');
      return;
    }
    pipelineRunStore.openSelector('local');
  },
};
