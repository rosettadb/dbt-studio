import TerminalIcon from '@mui/icons-material/Terminal';
import { STUDIO_SLOTS } from '../../../extensionApi/renderer';
import {
  appProviders,
  dashboardCards,
  fileTreeHoverPreviews,
  fileTreeRowActions,
  projectMenuItems,
  settingsPages,
  slotRegistry,
} from '../../../extensionHost/renderer/contributions.renderer';
import { registerCommand } from '../commandPalette/commands';
import { registerFileView } from '../fileViews/registry';
import { pipelineFileView } from '../fileViews/PipelineFileView';
import { registerTerminalPanel } from '../terminal/panels/registry';
import { runnerLogsPanel } from '../terminal/panels/RunnerLogsPanel';
import { RunnerProvider } from '../../context/RunnerProvider';
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

/**
 * Everything the pipeline tool adds to Studio's screens. Registered straight
 * into the registries for now; it becomes the `activate(api)` of the
 * pipeline extension when the code moves to `src/extensions/pipeline`
 * (docs/extensions/PLAN.md, phase 2).
 */
// State of the local runner, around the whole app: the pipeline view, the
// run dialogs and the runner logs panel all read it.
appProviders.add({ id: 'pipeline.runner', Component: RunnerProvider });
registerFileView(pipelineFileView);
// Between the cloud logs panel (700) and the charts server panel (900).
registerTerminalPanel({ ...runnerLogsPanel, order: 800 });
settingsPages.add({
  id: 'runner',
  label: 'Local Runner',
  description:
    'Run pipelines on this machine and manage their tool dependencies.',
  icon: TerminalIcon,
  category: 'Plugins',
  Component: RunnerSettingsPage,
});
fileTreeRowActions.add(pipelineCloudRunRowAction);
fileTreeRowActions.add(pipelineLocalRunRowAction);
fileTreeHoverPreviews.add(pipelineHoverPreview);
projectMenuItems.add(pipelineRunOnCloudItem);
projectMenuItems.add(pipelineRunLocallyItem);
slotRegistry(STUDIO_SLOTS.projectExplorerFooter).add({
  id: 'pipeline.create-button',
  Component: PipelineExplorerFooter,
});
slotRegistry(STUDIO_SLOTS.projectOverlays).add({
  id: 'pipeline.dialogs',
  Component: PipelineOverlays,
});
dashboardCards.add(pipelineDashboardCard);
slotRegistry(STUDIO_SLOTS.homeOverlays).add({
  id: 'pipeline.project-choice',
  Component: PipelineProjectChoiceDialog,
});
// Opens the Create Pipeline dialog. The Home card asks the project list to
// run it once the project is open.
registerCommand({
  id: PIPELINE_CREATE_COMMAND,
  label: 'Pipeline: Create pipeline',
  hidden: true,
  run: () => pipelineRunStore.openCreate(),
});
