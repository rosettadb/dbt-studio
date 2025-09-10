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

  const yamlOutputFormat =
    '  - fileName: {fileName}.sql  # Ensure the filename ends with .sql\n' +
    '    content: |\n';

  const modelContents = files
    .map((file) => `File: ${file.name}\n${file.content}`)
    .join('\n\n');

  return (
    `You are an AI system that must generate and output ONLY ONE business layer DBT model in YAML format. ` +
    `DO NOT output anything else, including explanations or surrounding text.\n\n` +
    `Your response MUST strictly follow the format below. The filename MUST always end in .sql.\n` +
    `If model contents represent DBT models, simply refer to them using '{{ ref() }}' in the content.\n` +
    `If model contents represent the yaml file of the raw layer, simply refer to them as source tables using from {{ source('<SCHEMA_NAME>', '<TABLE_NAME>') }}.\n` +
    `\n\n${userPrompt}\n` +
    `Model Contents:\n${
      modelContents
    }\n\nDO NOT include the \`\`\`yaml block at the beginning or end. Only respond with valid YAML in the following format:\n${
      yamlOutputFormat
    }\nIMPORTANT: The {fileName} placeholder must always be replaced with an actual filename ending in '.sql'.` +
    `\nIMPORTANT: Make sure you use as reference the models from the enhanced layer.` +
    `\nIMPORTANT: Do not use the enh_ prefix on the file name.`
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

  const yamlOutputFormat =
    '  - fileName: {fileName}.sql  # Ensure the filename ends with .sql\n' +
    '    content: |\n';

  const modelContents = files
    .map((file) => `File: ${file.name}\n${file.content}`)
    .join('\n\n');

  return (
    `You are an AI system that must generate and output ONLY ONE business layer DBT model in YAML format. ` +
    `DO NOT output anything else, including explanations or surrounding text.\n\n` +
    `Your response MUST strictly follow the format below. The filename MUST always end in .sql.\n` +
    `The model contents provided are from the RAW layer YAML configuration file containing source table definitions.\n` +
    `You MUST refer to these tables as source tables using the format: {{ source('<SCHEMA_NAME>', '<TABLE_NAME>') }}.\n` +
    `DO NOT use {{ ref() }} syntax since these are raw source tables, not DBT models.\n` +
    `\n\n${userPrompt}\n` +
    `Raw Layer YAML Contents:\n${
      modelContents
    }\n\nDO NOT include the \`\`\`yaml block at the beginning or end. Only respond with valid YAML in the following format:\n${
      yamlOutputFormat
    }\nIMPORTANT: The {fileName} placeholder must always be replaced with an actual filename ending in '.sql'.` +
    `\nIMPORTANT: Use {{ source() }} syntax for referencing raw tables, NOT {{ ref() }}.` +
    `\nIMPORTANT: Extract schema and table names from the YAML configuration provided.`
  );
};

export const generateModelsPrompt = (
  files: FileNodeWithContent[],
  prompt?: string,
): string => {
  const hasSQl = files.some((f) => f.name.endsWith('.sql'));
  return hasSQl
    ? dbtBusinessLayerPrompt(files, prompt)
    : dbtBusinessLayerFromRawPrompt(files, prompt);
};
