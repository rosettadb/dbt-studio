import type {
  ExtensionMainApi,
  ExtensionMainModule,
} from '../../../extensionApi/main';
import { toDisposable } from '../../../extensionApi/shared';
import AgentService from '../../../extensionApi/studioMain/agentService';
import { registerAnalyticsPagesHandlers } from './analyticsPagesHandlers';
import { registerStaticSiteHandlers } from './staticSiteHandlers';
import { createAnalyticsAgent } from './analyticsAgent';
import {
  AnalyticsAgentBridge,
  rejectPendingAnalyticsRequests,
} from './analyticsAgentBridge';

// What the Analytics editor answers the agent with.
const AGENT_RESPONSE_CHANNELS = [
  'agent:analytics:read-response',
  'agent:analytics:update-response',
  'agent:analytics:run-response',
  'agent:analytics:query-results-response',
];

/**
 * Main-process half of the Analytics extension: the Analytics pages of each
 * connection, their export as a static site, and the AI agent of the
 * Analytics tab.
 */
const activate = (api: ExtensionMainApi): void => {
  registerAnalyticsPagesHandlers(api);
  registerStaticSiteHandlers(api);

  // The assistant of the Analytics tab.
  api.agents.add('analytics', (base, context) =>
    createAnalyticsAgent(base, {
      connectionMeta: context.connectionMeta,
      connectionId: context.connectionId,
      pageId: context.pageId,
      enabledTools: context.enabledTools,
      skills: context.skills,
      conversationId: context.conversationId,
      toolMode: context.toolMode,
    }),
  );
  AGENT_RESPONSE_CHANNELS.forEach((channel) =>
    api.ipc.handle(channel, async (_event, payload) =>
      AnalyticsAgentBridge.resolveAnalyticsBridgeResponse(payload),
    ),
  );
  api.subscriptions.push(
    toDisposable(AgentService.onFactoryReset(rejectPendingAnalyticsRequests)),
  );
};

export const analyticsMain: ExtensionMainModule = { activate };
