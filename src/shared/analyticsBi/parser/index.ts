/* eslint-disable no-continue -- a character scanner reads most clearly with early continues */
/**
 * Analytics page parser (Plan 97).
 *
 * A single character scanner that turns an analytics markdown page into a
 * node tree: markdown text (with placeholders for inline values and inline
 * components), named SQL blocks, components with nested children, and
 * `{#if}` / `{#each}` logic blocks. It never throws: problems become
 * warnings and the rest of the page still renders.
 */
import type {
  ComponentNode,
  EachNode,
  Frontmatter,
  IfBranch,
  IfNode,
  MarkdownSlot,
  PageNode,
  ParsedPage,
  ParseWarning,
} from '../types';
import { findMatchingBrace, scanTagAttributes } from './props';

export { findMatchingBrace, scanTagAttributes } from './props';

export const SLOT_ATTRIBUTE = 'data-bi-slot';

export function slotPlaceholder(index: number): string {
  return `<span ${SLOT_ATTRIBUTE}="${index}"></span>`;
}

const FENCE_RE = /^([ \t]*)(`{3,}|~{3,})(.*)$/;
const SQL_INFO_RE = /^sql\s+([A-Za-z_][\w]*)\s*$/i;
const COMPONENT_START_RE = /^<([A-Z][A-Za-z0-9]*)(?=[\s/>])/;
const CLOSING_TAG_RE = /^<\/([A-Z][A-Za-z0-9]*)\s*>/;

/** Very small YAML subset: `key: value` lines, quotes stripped. */
export function parseFrontmatter(markdown: string): {
  frontmatter: Frontmatter;
  bodyStart: number;
  bodyStartLine: number;
} {
  const frontmatter: Frontmatter = {};
  const lines = markdown.split('\n');
  if (lines[0]?.trim() !== '---') {
    return { frontmatter, bodyStart: 0, bodyStartLine: 1 };
  }
  let offset = lines[0].length + 1;
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trim() === '---') {
      return {
        frontmatter,
        bodyStart: offset + line.length + 1,
        bodyStartLine: i + 2,
      };
    }
    const m = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (m) {
      let value = m[2].trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1).replace(/\\"/g, '"');
      }
      frontmatter[m[1]] = value;
    }
    offset += line.length + 1;
  }
  // Unterminated frontmatter: treat the whole page as body, like the old parser.
  return { frontmatter: {}, bodyStart: 0, bodyStartLine: 1 };
}

type Terminator =
  | { kind: 'eof' }
  | { kind: 'close-tag'; tag: string }
  | { kind: 'else'; condition?: string }
  | { kind: 'end-if' }
  | { kind: 'end-each' };

interface ParseResult {
  nodes: PageNode[];
  terminator: Terminator;
}

class PageScanner {
  private pos: number;

  private readonly lineStarts: number[];

  readonly warnings: ParseWarning[] = [];

  private readonly openTags: string[] = [];

  private logicDepth = 0;

  constructor(
    private readonly src: string,
    start: number,
  ) {
    this.pos = start;
    this.lineStarts = [0];
    for (let i = 0; i < src.length; i += 1) {
      if (src[i] === '\n') this.lineStarts.push(i + 1);
    }
  }

  lineAt(index: number): number {
    let lo = 0;
    let hi = this.lineStarts.length - 1;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (this.lineStarts[mid] <= index) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  }

  private warn(code: ParseWarning['code'], message: string, index: number) {
    this.warnings.push({ code, message, line: this.lineAt(index) });
  }

  private atLineStart(index: number): boolean {
    return index === 0 || this.src[index - 1] === '\n';
  }

  private lineEnd(index: number): number {
    const nl = this.src.indexOf('\n', index);
    return nl === -1 ? this.src.length : nl;
  }

  /** True when only whitespace sits between the line start and `index`. */
  private onlyWhitespaceBefore(index: number): boolean {
    for (let i = index - 1; i >= 0 && this.src[i] !== '\n'; i -= 1) {
      if (!/\s/.test(this.src[i])) return false;
    }
    return true;
  }

  private onlyWhitespaceAfter(index: number): boolean {
    for (let i = index; i < this.src.length && this.src[i] !== '\n'; i += 1) {
      if (!/\s/.test(this.src[i])) return false;
    }
    return true;
  }

  parseNodes(): ParseResult {
    const nodes: PageNode[] = [];
    let text = '';
    let slots: MarkdownSlot[] = [];
    let textStart = this.pos;

    const flush = () => {
      if (text.trim() || slots.length > 0) {
        nodes.push({
          type: 'markdown',
          source: text.replace(/^\s*\n/, '').replace(/\s+$/, ''),
          slots,
          line: this.lineAt(textStart),
        });
      }
      text = '';
      slots = [];
      textStart = this.pos;
    };

    const appendText = (chunk: string) => {
      if (!text) textStart = this.pos;
      text += chunk;
    };

    const { src } = this;

    while (this.pos < src.length) {
      const ch = src[this.pos];

      // ── Fenced code blocks (only recognised at line start) ──────────────
      if (
        (ch === '`' || ch === '~' || ch === ' ' || ch === '\t') &&
        this.atLineStart(this.pos)
      ) {
        const lineEnd = this.lineEnd(this.pos);
        const line = src.slice(this.pos, lineEnd);
        const fence = FENCE_RE.exec(line);
        if (fence) {
          const marker = fence[2];
          const info = fence[3].trim();
          // Find the closing fence.
          let cursor = lineEnd + 1;
          let closeStart = -1;
          let closeEnd = src.length;
          while (cursor <= src.length) {
            const end = this.lineEnd(cursor);
            const candidate = src.slice(cursor, end).trim();
            if (
              candidate.length >= marker.length &&
              candidate === marker[0].repeat(candidate.length)
            ) {
              closeStart = cursor;
              closeEnd = end;
              break;
            }
            if (end >= src.length) break;
            cursor = end + 1;
          }
          const sqlMatch = SQL_INFO_RE.exec(info);
          if (sqlMatch && marker[0] === '`') {
            flush();
            const bodyStart = Math.min(lineEnd + 1, src.length);
            const bodyEnd = closeStart === -1 ? src.length : closeStart;
            nodes.push({
              type: 'sql',
              name: sqlMatch[1],
              sql: src.slice(bodyStart, bodyEnd).trim(),
              lineStart: this.lineAt(this.pos),
              lineEnd: this.lineAt(closeStart === -1 ? src.length : closeStart),
            });
            this.pos =
              closeStart === -1
                ? src.length
                : Math.min(closeEnd + 1, src.length);
            textStart = this.pos;
            continue;
          }
          // Any other fence is copied verbatim into the markdown.
          const end =
            closeStart === -1 ? src.length : Math.min(closeEnd + 1, src.length);
          appendText(src.slice(this.pos, end));
          if (end < src.length || src[end - 1] !== '\n') {
            if (!text.endsWith('\n')) text += '\n';
          }
          this.pos = end;
          continue;
        }
      }

      // ── Escapes ─────────────────────────────────────────────────────────
      if (
        ch === '\\' &&
        (src[this.pos + 1] === '{' || src[this.pos + 1] === '<')
      ) {
        appendText(src.slice(this.pos, this.pos + 2));
        this.pos += 2;
        continue;
      }

      // ── Inline code spans are copied verbatim ───────────────────────────
      if (ch === '`') {
        let run = 1;
        while (src[this.pos + run] === '`') run += 1;
        const ticks = '`'.repeat(run);
        let close = this.pos + run;
        let found = -1;
        while (close < src.length) {
          const idx = src.indexOf(ticks, close);
          if (idx === -1) break;
          if (src[idx + run] !== '`' && src[idx - 1] !== '`') {
            found = idx;
            break;
          }
          close = idx + run;
          while (src[close] === '`') close += 1;
        }
        const end = found === -1 ? this.pos + run : found + run;
        appendText(src.slice(this.pos, end));
        this.pos = end;
        continue;
      }

      // ── HTML comments are copied verbatim ───────────────────────────────
      if (src.startsWith('<!--', this.pos)) {
        const close = src.indexOf('-->', this.pos + 4);
        const end = close === -1 ? src.length : close + 3;
        appendText(src.slice(this.pos, end));
        this.pos = end;
        continue;
      }

      if (ch === '<') {
        const rest = src.slice(this.pos, this.pos + 120);

        // ── Closing tag ───────────────────────────────────────────────────
        const closing = CLOSING_TAG_RE.exec(rest);
        if (closing) {
          const tag = closing[1];
          if (this.openTags.includes(tag)) {
            flush();
            this.pos += closing[0].length;
            return { nodes, terminator: { kind: 'close-tag', tag } };
          }
          this.warn(
            'stray-closing-tag',
            `</${tag}> has no matching <${tag}>`,
            this.pos,
          );
          this.pos += closing[0].length;
          continue;
        }

        // ── Component tag ─────────────────────────────────────────────────
        const opening = COMPONENT_START_RE.exec(rest);
        if (opening) {
          const tag = opening[1];
          const tagStart = this.pos;
          const scan = scanTagAttributes(src, this.pos + 1 + tag.length);
          if (scan) {
            const node: ComponentNode = {
              type: 'component',
              tag,
              props: scan.props,
              children: [],
              selfClosing: scan.selfClosing,
              line: this.lineAt(tagStart),
            };
            if (scan.selfClosing) {
              const isBlock =
                this.onlyWhitespaceBefore(tagStart) &&
                this.onlyWhitespaceAfter(scan.end);
              if (isBlock) {
                flush();
                nodes.push(node);
                this.pos = scan.end;
                textStart = this.pos;
              } else {
                appendText(slotPlaceholder(slots.length));
                slots.push({ kind: 'component', node });
                this.pos = scan.end;
              }
              continue;
            }
            flush();
            this.pos = scan.end;
            this.openTags.push(tag);
            const inner = this.parseNodes();
            this.openTags.pop();
            node.children = inner.nodes;
            nodes.push(node);
            textStart = this.pos;
            if (
              inner.terminator.kind === 'close-tag' &&
              inner.terminator.tag === tag
            ) {
              continue;
            }
            this.warn(
              'unclosed-component',
              `<${tag}> is never closed with </${tag}>`,
              tagStart,
            );
            if (inner.terminator.kind !== 'eof') {
              // An outer construct closed; hand its terminator up.
              return { nodes, terminator: inner.terminator };
            }
            return { nodes, terminator: { kind: 'eof' } };
          }
        }
      }

      if (ch === '{') {
        // `{{query}}` refs only mean something inside SQL; keep as text.
        if (src[this.pos + 1] === '{') {
          appendText('{{');
          this.pos += 2;
          continue;
        }

        const close = findMatchingBrace(src, this.pos + 1, true);
        if (close === -1) {
          appendText('{');
          this.pos += 1;
          continue;
        }
        const inner = src.slice(this.pos + 1, close);
        const trimmed = inner.trim();

        if (trimmed.startsWith('#if ') || trimmed.startsWith('#each ')) {
          flush();
          const startIndex = this.pos;
          this.pos = close + 1;
          const result = trimmed.startsWith('#if ')
            ? this.parseIf(trimmed.slice(4).trim(), startIndex)
            : this.parseEach(trimmed.slice(6).trim(), startIndex);
          nodes.push(result.node);
          textStart = this.pos;
          if (result.terminator) {
            return { nodes, terminator: result.terminator };
          }
          continue;
        }

        if (
          trimmed.startsWith(':else') ||
          trimmed === '/if' ||
          trimmed === '/each'
        ) {
          if (this.logicDepth > 0) {
            flush();
            this.pos = close + 1;
            if (trimmed === '/if')
              return { nodes, terminator: { kind: 'end-if' } };
            if (trimmed === '/each')
              return { nodes, terminator: { kind: 'end-each' } };
            const cond = /^:else\s+if\s+([\s\S]+)$/.exec(trimmed);
            return {
              nodes,
              terminator: {
                kind: 'else',
                condition: cond ? cond[1].trim() : undefined,
              },
            };
          }
          this.warn(
            'stray-logic',
            `{${trimmed}} has no matching opening block`,
            this.pos,
          );
          this.pos = close + 1;
          continue;
        }

        if (
          trimmed.startsWith('#') ||
          trimmed.startsWith('@') ||
          trimmed.startsWith('/')
        ) {
          this.warn(
            'bad-expression',
            `Unsupported block {${trimmed}}`,
            this.pos,
          );
          appendText(src.slice(this.pos, close + 1));
          this.pos = close + 1;
          continue;
        }

        if (!trimmed) {
          appendText(src.slice(this.pos, close + 1));
          this.pos = close + 1;
          continue;
        }

        appendText(slotPlaceholder(slots.length));
        slots.push({
          kind: 'expr',
          source: trimmed,
          raw: src.slice(this.pos, close + 1),
        });
        this.pos = close + 1;
        continue;
      }

      appendText(ch);
      this.pos += 1;
    }

    flush();
    return { nodes, terminator: { kind: 'eof' } };
  }

  private parseIf(
    condition: string,
    startIndex: number,
  ): { node: IfNode; terminator?: Terminator } {
    const branches: IfBranch[] = [];
    let current: string | undefined = condition;
    let sawElse = false;
    this.logicDepth += 1;
    try {
      for (;;) {
        const result = this.parseNodes();
        branches.push({ condition: current, children: result.nodes });
        const t = result.terminator;
        if (t.kind === 'end-if') break;
        if (t.kind === 'else' && !sawElse) {
          current = t.condition;
          if (current === undefined) sawElse = true;
          continue;
        }
        this.warn(
          'unclosed-logic',
          '{#if} is never closed with {/if}',
          startIndex,
        );
        const node: IfNode = {
          type: 'if',
          branches,
          line: this.lineAt(startIndex),
        };
        return { node, terminator: t.kind === 'eof' ? undefined : t };
      }
    } finally {
      this.logicDepth -= 1;
    }
    return { node: { type: 'if', branches, line: this.lineAt(startIndex) } };
  }

  private parseEach(
    header: string,
    startIndex: number,
  ): { node: EachNode; terminator?: Terminator } {
    const m =
      /^([\s\S]+?)\s+as\s+([A-Za-z_$][\w$]*)(?:\s*,\s*([A-Za-z_$][\w$]*))?\s*$/.exec(
        header,
      );
    if (!m) {
      this.warn(
        'bad-expression',
        `{#each ${header}} must look like {#each rows as row}`,
        startIndex,
      );
    }
    this.logicDepth += 1;
    let result: ParseResult;
    try {
      result = this.parseNodes();
    } finally {
      this.logicDepth -= 1;
    }
    const node: EachNode = {
      type: 'each',
      expr: m ? m[1].trim() : header,
      item: m ? m[2] : 'item',
      index: m ? m[3] : undefined,
      children: result.nodes,
      line: this.lineAt(startIndex),
    };
    if (result.terminator.kind === 'end-each') return { node };
    this.warn(
      'unclosed-logic',
      '{#each} is never closed with {/each}',
      startIndex,
    );
    return {
      node,
      terminator:
        result.terminator.kind === 'eof' ? undefined : result.terminator,
    };
  }
}

const PARSE_CACHE = new Map<string, ParsedPage>();
const PARSE_CACHE_LIMIT = 20;

/** Parse an analytics page. Results are memoised by content. */
export function parsePage(markdown: string): ParsedPage {
  const cached = PARSE_CACHE.get(markdown);
  if (cached) return cached;

  const { frontmatter, bodyStart } = parseFrontmatter(markdown);
  const scanner = new PageScanner(markdown, bodyStart);
  let { nodes } = scanner.parseNodes();
  // A stray terminator at top level can end parsing early; keep going.
  // (parseNodes only returns early for constructs that were opened.)
  nodes = nodes.filter(Boolean);

  const parsed: ParsedPage = { frontmatter, nodes, warnings: scanner.warnings };
  if (PARSE_CACHE.size >= PARSE_CACHE_LIMIT) {
    const first = PARSE_CACHE.keys().next().value;
    if (first !== undefined) PARSE_CACHE.delete(first);
  }
  PARSE_CACHE.set(markdown, parsed);
  return parsed;
}

/** Depth-first walk over every node, including logic branches and slots. */
export function walkNodes(
  nodes: PageNode[],
  visit: (node: PageNode) => void,
): void {
  nodes.forEach((node) => {
    visit(node);
    if (node.type === 'component') walkNodes(node.children, visit);
    if (node.type === 'each') walkNodes(node.children, visit);
    if (node.type === 'if')
      node.branches.forEach((b) => walkNodes(b.children, visit));
    if (node.type === 'markdown') {
      node.slots.forEach((slot) => {
        if (slot.kind === 'component') {
          visit(slot.node);
          walkNodes(slot.node.children, visit);
        }
      });
    }
  });
}

/** Every SQL block on the page, in document order. */
export function collectSqlNodes(nodes: PageNode[]) {
  const out: Array<Extract<PageNode, { type: 'sql' }>> = [];
  walkNodes(nodes, (node) => {
    if (node.type === 'sql') out.push(node);
  });
  return out;
}

/** Every component on the page, in document order. */
export function collectComponents(nodes: PageNode[]): ComponentNode[] {
  const out: ComponentNode[] = [];
  walkNodes(nodes, (node) => {
    if (node.type === 'component') out.push(node);
  });
  return out;
}
