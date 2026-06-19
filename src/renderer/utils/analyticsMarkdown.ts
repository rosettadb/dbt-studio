/**
 * Analytics Markdown Parser
 *
 * Converts an Evidence-style markdown page into a structured list of blocks
 * that the preview renderer can process independently.
 *
 * Supported block types:
 *  - TextBlock  : Regular markdown prose (headings, bold, lists, etc.)
 *  - SqlBlock   : ```sql queryName ... ``` fenced code blocks
 *  - ComponentBlock : Evidence component tags (<BarChart data={sales} ... />)
 */

export type AnalyticsBlock =
  | { type: 'sql'; name: string; sql: string }
  | { type: 'component'; tag: string; rawProps: string }
  | { type: 'text'; markdown: string };

type ParserState =
  | 'normal'
  | 'frontmatter'
  | 'sql-block'
  | 'other-fence'
  | 'component-tag';

/**
 * Parse an Evidence-compatible markdown page into structured blocks.
 *
 * Example input → output:
 *   ---
 *   title: Sales Dashboard    (skipped - frontmatter)
 *   ---
 *   # Sales Report            TextBlock { markdown: "# Sales Report\n..." }
 *
 *   ```sql sales              SqlBlock { name: "sales", sql: "SELECT ..." }
 *   SELECT date, amount
 *   FROM orders
 *   ```
 *
 *   <BarChart data={sales} x="date" y="amount" />
 *                             ComponentBlock { tag: "BarChart", rawProps: 'data={sales} x="date" y="amount"' }
 */
export function parseAnalyticsMarkdown(content: string): AnalyticsBlock[] {
  const lines = content.split('\n');
  const blocks: AnalyticsBlock[] = [];

  let state: ParserState = 'normal';
  let currentQueryName = '';
  let currentSqlLines: string[] = [];
  let currentTextLines: string[] = [];
  let currentComponentTag = '';
  let currentComponentLines: string[] = [];
  let lineIndex = 0;

  const flushText = () => {
    const text = currentTextLines.join('\n').trim();
    if (text) blocks.push({ type: 'text', markdown: text });
    currentTextLines = [];
  };

  // Handle frontmatter at start of document
  if (lines[0]?.trim() === '---') {
    state = 'frontmatter';
    lineIndex = 1;
  }

  for (; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const trimmed = line.trim();

    // ── FRONTMATTER ────────────────────────────────────────────────────
    if (state === 'frontmatter') {
      if (trimmed === '---') state = 'normal';
    }
    // ── SQL BLOCK ──────────────────────────────────────────────────────
    else if (state === 'sql-block') {
      if (trimmed === '```') {
        blocks.push({
          type: 'sql',
          name: currentQueryName,
          sql: currentSqlLines.join('\n').trim(),
        });
        currentQueryName = '';
        currentSqlLines = [];
        state = 'normal';
      } else {
        currentSqlLines.push(line);
      }
    }
    // ── OTHER FENCE ────────────────────────────────────────────────────
    else if (state === 'other-fence') {
      currentTextLines.push(line);
      if (trimmed === '```') {
        state = 'normal';
      }
    }
    // ── MULTI-LINE COMPONENT TAG ────────────────────────────────────────
    else if (state === 'component-tag') {
      const isSelfClose = trimmed.endsWith('/>');
      const isCloseTag = trimmed.endsWith(`</${currentComponentTag}>`);
      const isOpenTagEnd = trimmed.endsWith('>') && !trimmed.endsWith('/>');

      currentComponentLines.push(trimmed);

      if (isSelfClose || isCloseTag || isOpenTagEnd) {
        const rawProps = currentComponentLines
          .join(' ')
          // Strip the tag name from the first line
          .replace(/^<[A-Z][A-Za-z]+\s*/, '')
          .replace(/\/>$/, '')
          .replace(new RegExp(`<\\/${currentComponentTag}>$`), '')
          .replace(/>$/, '')
          .trim();

        blocks.push({ type: 'component', tag: currentComponentTag, rawProps });
        currentComponentTag = '';
        currentComponentLines = [];
        state = 'normal';
      }
    }
    // ── NORMAL ─────────────────────────────────────────────────────────
    else {
      // Opening sql fence: ```sql queryName
      const sqlFenceMatch = trimmed.match(/^```sql\s+(\w+)\s*$/);
      if (sqlFenceMatch) {
        flushText();
        const [, queryName] = sqlFenceMatch;
        currentQueryName = queryName;
        state = 'sql-block';
      } else if (trimmed.match(/^```/)) {
        // Opening other fence (```tsx, ```bash, etc.)
        currentTextLines.push(line);
        state = 'other-fence';
      } else {
        // Standalone Evidence component tag — single-line or start of multi-line
        const componentOpenMatch = trimmed.match(/^<([A-Z][A-Za-z]+)(\s.*)?$/);
        if (componentOpenMatch) {
          const [, tagName, restOfLine = ''] = componentOpenMatch;
          const restTrimmed = restOfLine.trim();

          if (
            restTrimmed.endsWith('/>') ||
            restTrimmed.endsWith(`</${tagName}>`)
          ) {
            // Self-closing on same line
            flushText();
            const rawProps = restTrimmed
              .replace(/\/>$/, '')
              .replace(new RegExp(`<\\/${tagName}>$`), '')
              .trim();
            blocks.push({ type: 'component', tag: tagName, rawProps });
          } else if (restTrimmed.endsWith('>') && !restTrimmed.endsWith('/>')) {
            // Open-close tag on same line
            flushText();
            const rawProps = restTrimmed
              .replace(new RegExp(`<\\/${tagName}>$`), '')
              .replace(/>$/, '')
              .trim();
            blocks.push({ type: 'component', tag: tagName, rawProps });
          } else {
            // Multi-line component open
            currentComponentTag = tagName;
            currentComponentLines.push(trimmed);
            state = 'component-tag';
            flushText();
          }
        } else {
          currentTextLines.push(line);
        }
      }
    }
  }

  // Handle EOF states
  if (state === 'sql-block' && currentQueryName) {
    blocks.push({
      type: 'sql',
      name: currentQueryName,
      sql: currentSqlLines.join('\n').trim(),
    });
  } else if (state === 'component-tag' && currentComponentTag) {
    blocks.push({
      type: 'component',
      tag: currentComponentTag,
      rawProps: currentComponentLines
        .join(' ')
        .replace(/^<[A-Z][A-Za-z]+\s*/, '')
        .replace(/>$/, '')
        .trim(),
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

/**
 * Parse raw Evidence-style props string into a key→value map.
 * Handles: propName={value}  propName="value"  propName='value'
 */
export function parseComponentProps(raw: string): Record<string, string> {
  const result: Record<string, string> = {};
  const re = /(\w+)=(?:\{(\w+)\}|"([^"]*?)"|'([^']*?)')/g;
  let m: RegExpExecArray | null;
  // eslint-disable-next-line no-cond-assign
  while ((m = re.exec(raw)) !== null) {
    result[m[1]] = m[2] ?? m[3] ?? m[4] ?? '';
  }
  return result;
}
