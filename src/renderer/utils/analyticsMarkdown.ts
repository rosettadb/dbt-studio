/**
 * Analytics Markdown Parser
 *
 * Converts an analytics markdown page into structured blocks that the preview
 * renderer can process independently.
 */

export type AnalyticsBlock =
  | {
      type: 'sql';
      name: string;
      sql: string;
      lineStart: number;
      lineEnd: number;
    }
  | {
      type: 'component';
      tag: string;
      rawProps: string;
      content?: string;
      lineStart: number;
      lineEnd: number;
    }
  | { type: 'text'; markdown: string; lineStart: number; lineEnd: number };

type ParserState =
  | 'normal'
  | 'frontmatter'
  | 'sql-block'
  | 'other-fence'
  | 'component-tag';

function parseComponentLines(
  tagName: string,
  componentLines: string[],
): { rawProps: string; content?: string } {
  const raw = componentLines.join('\n');
  const openMatch = raw.match(new RegExp(`^\\s*<${tagName}\\b([\\s\\S]*?)>`));
  if (!openMatch) return { rawProps: '' };

  const openingTag = openMatch[0];
  const rawProps = (openMatch[1] ?? '').replace(/\/\s*$/, '').trim();
  if (/\/>\s*$/.test(openingTag)) return { rawProps };

  const contentWithClose = raw.slice(openingTag.length);
  const closePattern = new RegExp(`</${tagName}>\\s*$`);
  const innerContent = contentWithClose.replace(closePattern, '').trim();
  return { rawProps, content: innerContent || undefined };
}

/**
 * Parse a DBT Studio analytics markdown page into SQL, text, and component
 * blocks. Component bodies are preserved as markdown so the renderer can
 * recurse through nested analytics components.
 */
export function parseAnalyticsMarkdown(content: string): AnalyticsBlock[] {
  const lines = content.split('\n');
  const blocks: AnalyticsBlock[] = [];

  let state: ParserState = 'normal';
  let currentQueryName = '';
  let currentSqlLines: string[] = [];
  let currentSqlStart = 0;
  let currentTextLines: string[] = [];
  let currentTextStart = 0;
  let currentComponentTag = '';
  let currentComponentLines: string[] = [];
  let currentComponentDepth = 0;
  let currentComponentStart = 0;
  let lineIndex = 0;

  const flushText = () => {
    const text = currentTextLines.join('\n').trim();
    if (text) {
      blocks.push({
        type: 'text',
        markdown: text,
        lineStart: currentTextStart || 1,
        lineEnd: lineIndex,
      });
    }
    currentTextLines = [];
    currentTextStart = 0;
  };

  const pushTextLine = (line: string) => {
    if (currentTextLines.length === 0) currentTextStart = lineIndex + 1;
    currentTextLines.push(line);
  };

  if (lines[0]?.trim() === '---') {
    state = 'frontmatter';
    lineIndex = 1;
  }

  for (; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const trimmed = line.trim();

    if (state === 'frontmatter') {
      if (trimmed === '---') state = 'normal';
    } else if (state === 'sql-block') {
      if (trimmed === '```') {
        blocks.push({
          type: 'sql',
          name: currentQueryName,
          sql: currentSqlLines.join('\n').trim(),
          lineStart: currentSqlStart,
          lineEnd: lineIndex + 1,
        });
        currentQueryName = '';
        currentSqlLines = [];
        currentSqlStart = 0;
        state = 'normal';
      } else {
        currentSqlLines.push(line);
      }
    } else if (state === 'other-fence') {
      pushTextLine(line);
      if (trimmed === '```') state = 'normal';
    } else if (state === 'component-tag') {
      currentComponentLines.push(line);
      const openingMatches = trimmed.match(/<([A-Z][A-Za-z]+)\b(?![^>]*\/>)/g);
      const closingMatches = trimmed.match(/<\/[A-Z][A-Za-z]+>/g);
      const openingCount = openingMatches?.length ?? 0;
      const closingCount = closingMatches?.length ?? 0;
      currentComponentDepth += openingCount - closingCount;
      if (
        currentComponentDepth <= 0 &&
        (trimmed.endsWith('/>') ||
          trimmed.endsWith(`</${currentComponentTag}>`))
      ) {
        const parsed = parseComponentLines(
          currentComponentTag,
          currentComponentLines,
        );
        blocks.push({
          type: 'component',
          tag: currentComponentTag,
          rawProps: parsed.rawProps,
          content: parsed.content,
          lineStart: currentComponentStart,
          lineEnd: lineIndex + 1,
        });
        currentComponentTag = '';
        currentComponentLines = [];
        currentComponentDepth = 0;
        currentComponentStart = 0;
        state = 'normal';
      }
    } else {
      const sqlFenceMatch = trimmed.match(/^```sql\s+(\w+)\s*$/);
      if (sqlFenceMatch) {
        flushText();
        const [, queryName] = sqlFenceMatch;
        currentQueryName = queryName;
        currentSqlStart = lineIndex + 1;
        state = 'sql-block';
      } else if (trimmed.match(/^```/)) {
        pushTextLine(line);
        state = 'other-fence';
      } else {
        const componentOpenMatch = trimmed.match(
          /^<([A-Z][A-Za-z]+)\b[\s\S]*$/,
        );
        if (componentOpenMatch) {
          const [, tagName] = componentOpenMatch;
          flushText();
          currentComponentTag = tagName;
          currentComponentLines = [line];
          currentComponentDepth = 1;
          currentComponentStart = lineIndex + 1;

          if (trimmed.endsWith('/>') || trimmed.endsWith(`</${tagName}>`)) {
            const parsed = parseComponentLines(tagName, currentComponentLines);
            blocks.push({
              type: 'component',
              tag: tagName,
              rawProps: parsed.rawProps,
              content: parsed.content,
              lineStart: currentComponentStart,
              lineEnd: lineIndex + 1,
            });
            currentComponentTag = '';
            currentComponentLines = [];
            currentComponentDepth = 0;
            currentComponentStart = 0;
          } else {
            state = 'component-tag';
          }
        } else {
          pushTextLine(line);
        }
      }
    }
  }

  if (state === 'sql-block' && currentQueryName) {
    blocks.push({
      type: 'sql',
      name: currentQueryName,
      sql: currentSqlLines.join('\n').trim(),
      lineStart: currentSqlStart,
      lineEnd: lines.length,
    });
  } else if (state === 'component-tag' && currentComponentTag) {
    const parsed = parseComponentLines(
      currentComponentTag,
      currentComponentLines,
    );
    blocks.push({
      type: 'component',
      tag: currentComponentTag,
      rawProps: parsed.rawProps,
      content: parsed.content,
      lineStart: currentComponentStart,
      lineEnd: lines.length,
    });
  }

  flushText();
  return blocks;
}

/**
 * Extract the title from frontmatter YAML, if present.
 * Returns null if not found.
 */
export function extractFrontmatterTitle(content: string): string | null {
  const lines = content.split('\n');
  if (lines[0]?.trim() !== '---') return null;

  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (line === '---') break;
    const match = line.match(/^title:\s*(.+)$/i);
    if (match) return match[1].trim().replace(/^["']|["']$/g, '');
  }
  return null;
}

export { parseComponentProps } from './analyticsComponentProps';
