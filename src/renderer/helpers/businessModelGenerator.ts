import { FileNodeWithContent } from '../../types/backend';

const dbtBusinessLayerPrompt = (
  files: FileNodeWithContent[],
  prompt?: string,
): string => {
  let userPrompt = prompt;
  if (!userPrompt || userPrompt.trim().length === 0) {
    userPrompt =
      'Generate exactly one business model from these incremental models.';
  }

  const modelContents = files
    .map((file) => `File: ${file.name}\n${file.content}`)
    .join('\n\n');

  return (
    `You are an AI system that must generate and output ONLY ONE business layer DBT model as SQL content. ` +
    `DO NOT output anything else, including explanations or surrounding text.\n\n` +
    `Your response should be formatted as rich text SQL code that can be streamed directly.\n` +
    `The filename should be implied from the business logic (you can mention it in a comment at the top).\n` +
    `If model contents represent DBT models, simply refer to them using '{{ ref() }}' in the content.\n` +
    `If model contents represent the yaml file of the raw layer, simply refer to them as source tables using from {{ source('<SCHEMA_NAME>', '<TABLE_NAME>') }}.\n` +
    `\n\n${userPrompt}\n` +
    `Model Contents:\n${modelContents}\n\n` +
    `IMPORTANT: Make sure you use as reference the models from the enhanced layer.\n` +
    `IMPORTANT: Do not use the enh_ prefix in any references.\n` +
    `IMPORTANT: Start your response directly with the markdown code block: \`\`\`sql`
  );
};

const dbtBusinessLayerFromRawPrompt = (
  files: FileNodeWithContent[],
  prompt?: string,
): string => {
  let userPrompt = prompt;
  if (!userPrompt || userPrompt.trim().length === 0) {
    userPrompt =
      'Generate exactly one business model from these raw layer tables.';
  }

  const modelContents = files
    .map((file) => `File: ${file.name}\n${file.content}`)
    .join('\n\n');

  return (
    `You are an AI system that must generate and output ONLY ONE business layer DBT model as SQL content. ` +
    `DO NOT output anything else, including explanations or surrounding text.\n\n` +
    `Your response should be formatted as rich text SQL code that can be streamed directly.\n` +
    `The filename should be implied from the business logic (you can mention it in a comment at the top).\n` +
    `The model contents provided are from the RAW layer YAML configuration file containing source table definitions.\n` +
    `You MUST refer to these tables as source tables using the format: {{ source('<SCHEMA_NAME>', '<TABLE_NAME>') }}.\n` +
    `DO NOT use {{ ref() }} syntax since these are raw source tables, not DBT models.\n` +
    `\n\n${userPrompt}\n` +
    `Raw Layer YAML Contents:\n${modelContents}\n\n` +
    `IMPORTANT: Use {{ source() }} syntax for referencing raw tables, NOT {{ ref() }}.\n` +
    `IMPORTANT: Extract schema and table names from the YAML configuration provided.\n` +
    `IMPORTANT: Start your response directly with the SQL code, no markdown code blocks or YAML formatting.`
  );
};

export const generateModelsPrompt = (
  files: FileNodeWithContent[],
  prompt?: string,
): string => {
  const hasSQL = files.some((f) => f.name.endsWith('.sql'));
  return hasSQL
    ? dbtBusinessLayerPrompt(files, prompt)
    : dbtBusinessLayerFromRawPrompt(files, prompt);
};
