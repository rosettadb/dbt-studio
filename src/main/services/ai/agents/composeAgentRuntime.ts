import type { BaseAgentConfig } from './baseAgentConfig';

export const composeAgentRuntime = (
  base: BaseAgentConfig,
  instructions: string,
  agentTools: Record<string, any>,
): { instructions: string; tools: Record<string, any> } => ({
  instructions: [instructions, base.secondBrainContext]
    .filter(Boolean)
    .join('\n\n'),
  tools: {
    ...agentTools,
    ...base.mcpTools,
    loadSkill: base.loadSkillTool,
    ...base.secondBrainTools,
  },
});
