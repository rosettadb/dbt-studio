import { ExtensionHostRenderer } from '../../../src/extensionHost/renderer/ExtensionHost.renderer';
import { listPipelineTemplates } from '../../../src/extensions/pipeline/renderer/pipelineTemplates.service';
import {
  appProviders,
  dashboardCards,
  fileTreeHoverPreviews,
  fileTreeRowActions,
  projectMenuItems,
  settingsPages,
  slotRegistry,
} from '../../../src/extensionHost/renderer/contributions.renderer';
import { listFileViews } from '../../../src/renderer/components/fileViews/registry';
import { listTerminalPanels } from '../../../src/renderer/components/terminal/panels/registry';
import { runCommand } from '../../../src/renderer/components/commandPalette/commands';
import { STUDIO_SLOTS } from '../../../src/extensionApi/renderer';
import { parseExtensionManifest } from '../../../src/extensionHost/shared/manifest.shared';
import { pipelineManifest } from '../../../src/extensions/pipeline/manifest.shared';
import { pipelineRenderer } from '../../../src/extensions/pipeline/renderer';
import { pipelineRunStore } from '../../../src/extensions/pipeline/renderer/pipelineRunStore';

// ESM-only packages somewhere below Studio's components; not under test.
jest.mock('react-markdown', () => ({ __esModule: true, default: () => null }));
jest.mock('remark-gfm', () => () => undefined);
jest.mock('rehype-raw', () => () => undefined);
jest.mock('rehype-highlight', () => () => undefined);
jest.mock('rehype-sanitize', () => () => undefined);

const ids = (list: ReadonlyArray<{ id: string }>) =>
  list.map((item) => item.id);

// What the Pipelines extension adds to Studio, read back from the places
// Studio's screens read.
const contributed = () => ({
  provider: ids(appProviders.list()).includes('pipeline.runner'),
  fileView: ids(listFileViews()).includes('pipeline'),
  panel: ids(listTerminalPanels()).includes('runnerLogs'),
  settingsPage: ids(settingsPages.list()).includes('runner'),
  rowActions: ids(fileTreeRowActions.list()).filter((id) =>
    id.startsWith('pipeline.'),
  ),
  hoverPreview: ids(fileTreeHoverPreviews.list()).includes(
    'pipeline.thumbnail',
  ),
  menuItems: projectMenuItems.list().map((item) => item.name),
  explorerFooter: ids(slotRegistry(STUDIO_SLOTS.projectExplorerFooter).list()),
  projectOverlays: ids(slotRegistry(STUDIO_SLOTS.projectOverlays).list()),
  homeOverlays: ids(slotRegistry(STUDIO_SLOTS.homeOverlays).list()),
  card: dashboardCards.list().find((card) => card.id === 'pipeline')?.order,
});

const description = (state: 'active' | 'disabled') => {
  const parsed = parseExtensionManifest(pipelineManifest);
  if (!parsed.ok) throw new Error(parsed.errors.join('; '));
  return {
    id: 'rosetta.pipeline',
    manifest: parsed.manifest,
    source: 'builtin' as const,
    enabled: state === 'active',
    state,
  };
};

describe('Pipelines extension', () => {
  it('has a valid manifest', () => {
    expect(parseExtensionManifest(pipelineManifest)).toMatchObject({
      ok: true,
    });
  });

  it('adds its pieces through the extension API and takes them all back', async () => {
    const host = new ExtensionHostRenderer();
    host.registerBuiltin(pipelineManifest, pipelineRenderer);

    await host.apply([description('active')]);

    expect(contributed()).toEqual({
      provider: true,
      fileView: true,
      panel: true,
      settingsPage: true,
      rowActions: ['pipeline.run-cloud', 'pipeline.run-local'],
      hoverPreview: true,
      menuItems: ['Run Pipeline', 'Run Pipeline (Local Runner)'],
      explorerFooter: ['pipeline.create-button'],
      projectOverlays: ['pipeline.dialogs'],
      homeOverlays: ['pipeline.project-choice'],
      // Between Object Explorer (600) and ETL (800)
      card: 700,
    });
    expect(host.getSnapshot()).toMatchObject([{ uiActive: true }]);

    // The command the Home card hands to the project list
    expect(runCommand('pipeline.create')).toBe(true);
    expect(pipelineRunStore.getState().isCreateOpen).toBe(true);

    // Its own code reaches the main process through `api.ipc`, bound when
    // the extension is activated.
    const invoke = jest
      .spyOn(window.electron.ipcRenderer, 'invoke')
      .mockResolvedValue([] as never);
    await listPipelineTemplates();
    expect(invoke).toHaveBeenCalledWith('pipeline-templates:list');
    invoke.mockRestore();

    await host.apply([description('disabled')]);

    expect(contributed()).toEqual({
      provider: false,
      fileView: false,
      panel: false,
      settingsPage: false,
      rowActions: [],
      hoverPreview: false,
      menuItems: [],
      explorerFooter: [],
      projectOverlays: [],
      homeOverlays: [],
      card: undefined,
    });
    expect(runCommand('pipeline.create')).toBe(false);
    expect(pipelineRunStore.getState().isCreateOpen).toBe(false);
  });

  it('opens pipeline files ahead of the charts view and behind the preview view', async () => {
    const host = new ExtensionHostRenderer();
    host.registerBuiltin(pipelineManifest, pipelineRenderer);
    await host.apply([description('active')]);

    const pipelineView = listFileViews().find((view) => view.id === 'pipeline');

    expect(pipelineView?.priority).toBe(200);
    expect(
      pipelineView?.matches({
        path: '/p/rosetta/pipelines/charts/load.yml',
      } as never),
    ).toBe(true);

    await host.apply([description('disabled')]);
  });
});
