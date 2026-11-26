import TerminalIcon from '@mui/icons-material/Terminal';
import {
  STUDIO_SLOTS,
  type ExtensionRendererApi,
  type ExtensionRendererModule,
} from '../../../extensionApi/renderer';
import { pipelineFileView } from './PipelineFileView';
import { runnerLogsPanel } from './RunnerLogsPanel';
import { RunnerProvider } from './RunnerProvider';
import { RunnerSettingsPage } from './RunnerSettingsPage';
import { PipelineExplorerFooter } from './PipelineExplorerFooter';
import { PipelineOverlays } from './PipelineOverlays';
import {
  pipelineCloudRunRowAction,
  pipelineHoverPreview,
  pipelineLocalRunRowAction,
} from './PipelineTreeContributions';
import {
  pipelineRunLocallyItem,
  pipelineRunOnCloudItem,
} from './pipelineMenuItems';
import { pipelineRunStore } from './pipelineRunStore';
import {
  PIPELINE_CREATE_COMMAND,
  PipelineProjectChoiceDialog,
  pipelineDashboardCard,
} from './PipelineHomeContributions';
import { ipc } from './ipc';

/**
 * UI half of the Pipelines extension: everything the pipeline tool adds to
 * Studio's screens.
 */
const activate = (api: ExtensionRendererApi): void => {
  // The extension's own code reaches the main process through `api.ipc`.
  ipc.bind(api.ipc);

  // State of the local runner, around the whole app: the pipeline view, the
  // run dialogs and the runner logs panel all read it.
  api.app.addProvider({ id: 'pipeline.runner', Component: RunnerProvider });

  // A YAML file under rosetta/pipelines/ opens in the pipeline designer.
  api.fileViews.add(pipelineFileView);

  // Between the cloud logs panel (700) and the charts server panel (900).
  api.panels.add({ ...runnerLogsPanel, order: 800 });

  api.settings.addPage({
    id: 'runner',
    label: 'Local Runner',
    description:
      'Run pipelines on this machine and manage their tool dependencies.',
    icon: TerminalIcon,
    category: 'Plugins',
    Component: RunnerSettingsPage,
  });

  // Run buttons and the thumbnail on pipeline rows of the file tree.
  api.fileTree.addRowAction(pipelineCloudRunRowAction);
  api.fileTree.addRowAction(pipelineLocalRunRowAction);
  api.fileTree.addHoverPreview(pipelineHoverPreview);

  // "Run Pipeline" in the project run menu.
  api.projectMenu.addItem(pipelineRunOnCloudItem);
  api.projectMenu.addItem(pipelineRunLocallyItem);

  // The Create Pipeline button under the file tree, and the dialogs.
  api.slots.add(STUDIO_SLOTS.projectExplorerFooter, {
    id: 'pipeline.create-button',
    Component: PipelineExplorerFooter,
  });
  api.slots.add(STUDIO_SLOTS.projectOverlays, {
    id: 'pipeline.dialogs',
    Component: PipelineOverlays,
  });

  // The Pipeline card on Home and its "which project" dialog.
  api.dashboard.addCard(pipelineDashboardCard);
  api.slots.add(STUDIO_SLOTS.homeOverlays, {
    id: 'pipeline.project-choice',
    Component: PipelineProjectChoiceDialog,
  });

  // Opens the Create Pipeline dialog. The Home card asks the project list
  // to run it once the project is open.
  api.commands.add({
    id: PIPELINE_CREATE_COMMAND,
    label: 'Pipeline: Create pipeline',
    hidden: true,
    run: () => pipelineRunStore.openCreate(),
  });
};

const deactivate = (): void => {
  pipelineRunStore.reset();
};

export const pipelineRenderer: ExtensionRendererModule = {
  activate,
  deactivate,
};
