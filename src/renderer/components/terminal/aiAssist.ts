const TERMINAL_AI_PROMPT =
  'Diagnose the following terminal output, explain the cause, and suggest the next steps to resolve it:';

export const buildTerminalAiPrompt = (
  selectedText: string,
  output: string[],
  error: string[],
): string | null => {
  const selection = selectedText.trim();
  const terminalText = selection || [...output, ...error].join('\n').trim();

  if (!terminalText) {
    return null;
  }

  return `${TERMINAL_AI_PROMPT}\n\n\`\`\`text\n${terminalText}\n\`\`\``;
};
