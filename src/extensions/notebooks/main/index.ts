import type {
  ExtensionMainApi,
  ExtensionMainModule,
} from '../../../extensionApi/main';
import { toDisposable } from '../../../extensionApi/shared';
import AgentService from '../../../extensionApi/studioMain/agentService';
import { setNotebookLister } from '../../../extensionApi/studioMain/notebookCatalog';
import NotebookKernelService from './notebookKernel.service';
import { NotebooksService } from './notebooks.service';
import { registerNotebooksHandlers } from './notebooksHandlers';
import { registerPythonNotebooksHandlers } from './pythonNotebooksHandlers';
import { createNotebooksAgent } from './notebooksAgent';
import { describeInspectedNotebook } from './notebookEmptyAnswer';
import {
  NotebookAgentBridge,
  rejectPendingNotebookRequests,
} from './notebookAgentBridge';

// What the open notebook answers the agent with.
const AGENT_RESPONSE_CHANNELS = [
  'agent:notebook:state-response',
  'agent:notebook:cell-read-response',
  'agent:notebook:cell-add-response',
  'agent:notebook:cell-update-response',
  'agent:notebook:cell-run-response',
  'agent:notebook:cell-result-response',
  'agent:python-notebook:response',
];

/**
 * Main-process half of the Notebooks extension: SQL notebooks, Python
 * notebooks with their environments and kernels, the managed Python
 * interpreters they run on, and the AI agent of the Notebooks screen.
 */
const activate = (api: ExtensionMainApi): void => {
  registerNotebooksHandlers(api);
  registerPythonNotebooksHandlers(api);

  // The assistant of the Notebooks screen.
  api.agents.add(
    'notebooks',
    (base, context) =>
      createNotebooksAgent(base, {
        connectionMeta: context.connectionMeta,
        notebookId: context.notebookId,
        connectionId: context.connectionId,
        enabledTools: context.enabledTools,
        disabledTools: context.disabledTools,
        skills: context.skills,
        conversationId: context.conversationId,
        toolMode: context.toolMode,
      }),
    { emptyAnswerFallback: describeInspectedNotebook },
  );
  AGENT_RESPONSE_CHANNELS.forEach((channel) =>
    api.ipc.handle(channel, async (_event, payload) =>
      NotebookAgentBridge.resolveNotebookBridgeResponse(payload),
    ),
  );
  api.subscriptions.push(
    toDisposable(AgentService.onFactoryReset(rejectPendingNotebookRequests)),
  );

  // A connection's notebooks are archived before it is deleted. If that
  // fails the deletion stops, so no notebook is left without a connection.
  api.connections.onWillDelete((connectionId) =>
    NotebooksService.archiveConnectionNotebooks(connectionId),
  );

  // Studio's second brain reports on the notebooks of a connection.
  api.subscriptions.push(
    toDisposable(
      setNotebookLister((connectionId) =>
        NotebooksService.listNotebooks(connectionId),
      ),
    ),
  );
};

// When Studio quits (or the extension is switched off) no kernel is left
// running.
const deactivate = async (): Promise<void> => {
  await NotebookKernelService.shutdownAll().catch(() => undefined);
};

export const notebooksMain: ExtensionMainModule = { activate, deactivate };
