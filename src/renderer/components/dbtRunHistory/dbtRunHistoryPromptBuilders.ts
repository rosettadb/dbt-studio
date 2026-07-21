import {
  DbtRunHistoryEntry,
  DbtRunHistoryResult,
} from '../../../types/dbtRunHistory';

export const buildRunFailurePrompt = (entry: DbtRunHistoryEntry): string => {
  return `The following dbt command failed during execution:
**Command:** \`${entry.fullCommand}\`
**Status:** \`${entry.status}\`

${entry.errorMessage ? `**Error Message:**\n\`\`\`\n${entry.errorMessage}\n\`\`\`\n` : ''}
${entry.rawOutputExcerpt ? `**Output Excerpt:**\n\`\`\`\n${entry.rawOutputExcerpt}\n\`\`\`\n` : ''}

Please analyze this failure and suggest how to fix it. If the issue is related to a specific model or test, let me know.
`;
};

export const buildResultFailurePrompt = (
  entry: DbtRunHistoryEntry,
  result: DbtRunHistoryResult,
): string => {
  return `A specific dbt resource failed during a run.
**Command Run:** \`${entry.fullCommand}\`
**Resource Name:** \`${result.name}\`
**Resource Type:** \`${result.resourceType || 'unknown'}\`
**Status:** \`${result.status}\`

${result.message ? `**Message:**\n\`\`\`\n${result.message}\n\`\`\`\n` : ''}
${result.compiledSql ? `**Compiled SQL:**\n\`\`\`sql\n${result.compiledSql}\n\`\`\`\n` : ''}

Please explain why this resource failed and how I can fix it.
`;
};
