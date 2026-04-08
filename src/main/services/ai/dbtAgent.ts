/* eslint-disable no-console */
// dbt Agent - ToolLoopAgent for dbt Studio
// Factory function that creates a configured ToolLoopAgent for dbt operations

import { ToolLoopAgent, stepCountIs } from 'ai';
import { getVercelModel } from './agentAdapter';
import { dbtTools } from './tools/dbt.tools';
import { filesystemTools } from './tools/filesystem.tools';

/**
 * Options for creating a dbt agent
 */
export interface DbtAgentOptions {
  skills?: string;
  extraTools?: Record<string, any>;
  enabledTools?: Record<string, any>; // filtered tool set from AI settings
  requestedModel?: string;
  maxSteps?: number;
  projectPath?: string;
}

/**
 * Factory that creates a configured ToolLoopAgent for dbt Studio.
 * Called at agent run time to get the current active provider model.
 */
export async function createDbtAgent(options?: DbtAgentOptions) {
  console.log('[dbtAgent] Creating dbt agent with options:', {
    requestedModel: options?.requestedModel,
    projectPath: options?.projectPath,
    maxSteps: options?.maxSteps ?? 20,
    hasExtraTools: !!options?.extraTools,
    hasSkills: !!options?.skills,
  });

  const model = await getVercelModel(options?.requestedModel);
  console.log('[dbtAgent] Model resolved:', {
    modelId: model.modelId,
    provider: model.provider,
  });

  const systemInstructions = `You are an expert dbt Studio AI assistant.
You help users with dbt model development, debugging, documentation, and data operations.
You have access to the dbt project filesystem and can read, write, and run dbt commands.

${options?.skills ?? ''}

## Guidelines

1. **Always read before writing**: Use readDbtModel or readFile to understand existing code before making changes
2. **Verify commands**: After running dbt commands, check logs with getDbtLogs to verify success
3. **Be cautious with writes**: Confirm with the user before overwriting existing files
4. **Use selectors**: When running dbt commands, use --select to target specific models when appropriate
5. **Explain your actions**: Describe what you're doing and why before executing tools
6. **Handle errors gracefully**: If a command fails, read the logs and suggest fixes

## Available Tools

### dbt Tools
- readDbtModel: Read model SQL, schema YAML, or config files
- writeDbtModel: Write or update model files (SQL/YAML only)
- runDbtCommand: Execute dbt CLI commands (run, test, compile, docs, etc.)
- listDbtModels: List all models in the project
- getDbtLogs: Read recent dbt logs for debugging

### Filesystem Tools
- listDirectory: Explore project structure
- readFile: Read any text file
- writeFile: Write any text file
- pathExists: Check if a file or directory exists

Always confirm before making destructive changes.`;

  // Use enabledTools if provided, otherwise fall back to all tools
  const baseTools = options?.enabledTools ?? {
    ...dbtTools,
    ...filesystemTools,
  };

  const toolCount = Object.keys({
    ...baseTools,
    ...(options?.extraTools ?? {}),
  }).length;

  console.log('[dbtAgent] Initializing ToolLoopAgent with:', {
    toolCount,
    maxSteps: options?.maxSteps ?? 20,
  });

  return new ToolLoopAgent({
    model: model as any,
    instructions: systemInstructions,
    tools: {
      ...baseTools,
      ...(options?.extraTools ?? {}),
    },
    stopWhen: stepCountIs(options?.maxSteps ?? 20),

    onStepFinish: async ({ stepNumber, usage, finishReason, toolCalls }) => {
      console.log(`[dbtAgent] Step ${stepNumber} finished:`, {
        finishReason,
        tokensUsed: usage?.totalTokens,
        toolsUsed: toolCalls?.map((tc) => tc.toolName),
        toolCallCount: toolCalls?.length || 0,
      });
    },
  });
}
