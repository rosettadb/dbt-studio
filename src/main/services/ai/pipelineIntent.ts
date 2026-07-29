const PIPELINE_EXECUTION_VERB =
  '(?:run|execute|start|trigger|launch|rerun|re-run)';
const PIPELINE_QUALIFIER =
  '(?:(?:the|this|that|my|our|new|active|selected|current|updated|created)\\s+)*';

const PIPELINE_EXECUTION_PATTERNS = [
  /\bnot\s+dbt\s+run\b[^.!?]*\b(?:the\s+)?pipeline\b/i,
  new RegExp(
    `\\b${PIPELINE_EXECUTION_VERB}\\s+${PIPELINE_QUALIFIER}pipeline\\b`,
    'i',
  ),
  new RegExp(
    `\\b${PIPELINE_EXECUTION_VERB}\\s+(?:\\.rosetta\\/)?[^\\s]+\\.ya?ml\\b`,
    'i',
  ),
];

const NON_EXECUTION_PREFIXES = [
  /\b(?:do not|don't|dont|never)\s+(?:run|execute|start|trigger|launch|rerun|re-run)\b/i,
  /\bhow\s+(?:can|do|should|would)\s+(?:i|we|you)\s+(?:run|execute|start|trigger|launch|rerun|re-run)\b/i,
  /\bwhat\s+(?:happens|would happen)\s+(?:if|when)\b/i,
];

export function isPipelineExecutionRequest(content: string): boolean {
  const normalized = content.replace(/\s+/g, ' ').trim();
  if (!normalized) return false;
  if (NON_EXECUTION_PREFIXES.some((pattern) => pattern.test(normalized))) {
    return false;
  }
  return PIPELINE_EXECUTION_PATTERNS.some((pattern) =>
    pattern.test(normalized),
  );
}

export function shouldBlockDbtToolForPipelineExecution(
  toolName: string,
  pipelineExecutionRequested: boolean,
): boolean {
  return (
    pipelineExecutionRequested &&
    (toolName === 'studio_cli_run_dbt' || toolName === 'runDbtCommand')
  );
}
