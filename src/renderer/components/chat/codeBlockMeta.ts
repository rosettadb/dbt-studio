/**
 * Language and optional filename of a fenced code block in a chat message.
 * rehype-highlight adds `hljs` next to `language-xxx`, so the language is
 * matched from its class, not taken by stripping a prefix.
 */
export function detectCodeBlockMeta(
  className?: string,
  code?: string,
): {
  language: string;
  filename?: string;
} {
  const language = (
    className?.match(/(?:^|\s)language-(\S+)/)?.[1] ?? ''
  ).toLowerCase();
  const firstLine = (code || '').split('\n')[0]?.trim() ?? '';
  const filenameMatch = firstLine.match(/^(?:\/\/|--|#)\s*filename:\s*(.+)$/i);
  return { language, filename: filenameMatch?.[1]?.trim() };
}
