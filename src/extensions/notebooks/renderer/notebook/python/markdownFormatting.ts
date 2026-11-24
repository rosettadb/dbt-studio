/**
 * Markdown formatting helpers for the notebook text cell toolbar.
 *
 * Colab-style: the cell stays plain markdown in a textarea and the toolbar
 * inserts syntax around the current selection. Pure functions so they can be
 * unit tested without a DOM.
 */

export type MarkdownFormatAction =
  | 'bold'
  | 'italic'
  | 'strikethrough'
  | 'code'
  | 'codeBlock'
  | 'link'
  | 'image'
  | 'heading'
  | 'bulletList'
  | 'numberedList'
  | 'quote'
  | 'horizontalRule';

export interface MarkdownFormatResult {
  source: string;
  selectionStart: number;
  selectionEnd: number;
}

interface InlineWrap {
  before: string;
  after: string;
  placeholder: string;
}

const INLINE_WRAPS: Record<
  'bold' | 'italic' | 'strikethrough' | 'code',
  InlineWrap
> = {
  bold: { before: '**', after: '**', placeholder: 'bold text' },
  italic: { before: '_', after: '_', placeholder: 'italic text' },
  strikethrough: { before: '~~', after: '~~', placeholder: 'strikethrough' },
  code: { before: '`', after: '`', placeholder: 'code' },
};

/** Wrap the selection (or a placeholder) in `before` / `after`, toggling off
 *  when the selection is already wrapped. */
function wrapInline(
  source: string,
  start: number,
  end: number,
  { before, after, placeholder }: InlineWrap,
): MarkdownFormatResult {
  const selected = source.slice(start, end);

  // Toggle off: the wrap sits just outside the selection
  const outerStart = start - before.length;
  const outerEnd = end + after.length;
  if (
    outerStart >= 0 &&
    source.slice(outerStart, start) === before &&
    source.slice(end, outerEnd) === after
  ) {
    return {
      source: source.slice(0, outerStart) + selected + source.slice(outerEnd),
      selectionStart: outerStart,
      selectionEnd: outerStart + selected.length,
    };
  }

  // Toggle off: the wrap is inside the selection
  if (
    selected.length >= before.length + after.length &&
    selected.startsWith(before) &&
    selected.endsWith(after)
  ) {
    const inner = selected.slice(before.length, selected.length - after.length);
    return {
      source: source.slice(0, start) + inner + source.slice(end),
      selectionStart: start,
      selectionEnd: start + inner.length,
    };
  }

  const text = selected || placeholder;
  return {
    source: source.slice(0, start) + before + text + after + source.slice(end),
    selectionStart: start + before.length,
    selectionEnd: start + before.length + text.length,
  };
}

/** Bounds of the full lines covering [start, end). */
function lineBounds(
  source: string,
  start: number,
  end: number,
): { from: number; to: number } {
  const from = source.lastIndexOf('\n', start - 1) + 1;
  const nextBreak = source.indexOf('\n', Math.max(end - 1, start));
  const to = nextBreak === -1 ? source.length : nextBreak;
  return { from, to };
}

/**
 * Prefix every selected line, toggling the prefix off when all selected
 * lines already carry it. `prefixFor` lets numbered lists count up.
 */
function prefixLines(
  source: string,
  start: number,
  end: number,
  matcher: RegExp,
  prefixFor: (lineIndex: number) => string,
): MarkdownFormatResult {
  const { from, to } = lineBounds(source, start, end);
  const lines = source.slice(from, to).split('\n');
  const allPrefixed = lines.every((line) => matcher.test(line));

  const updated = lines.map((line, index) =>
    allPrefixed ? line.replace(matcher, '') : prefixFor(index) + line,
  );
  const block = updated.join('\n');
  return {
    source: source.slice(0, from) + block + source.slice(to),
    selectionStart: from,
    selectionEnd: from + block.length,
  };
}

/** Headings cycle through levels 1–3 on the selected lines, then clear. */
function cycleHeading(
  source: string,
  start: number,
  end: number,
): MarkdownFormatResult {
  const { from, to } = lineBounds(source, start, end);
  const lines = source.slice(from, to).split('\n');
  const levelOf = (line: string) => /^(#{1,6}) /.exec(line)?.[1].length ?? 0;
  const current = Math.min(...lines.map(levelOf));
  const next = current >= 3 ? 0 : current + 1;
  const updated = lines.map((line) => {
    const stripped = line.replace(/^#{1,6} /, '');
    return next === 0 ? stripped : `${'#'.repeat(next)} ${stripped}`;
  });
  const block = updated.join('\n');
  return {
    source: source.slice(0, from) + block + source.slice(to),
    selectionStart: from,
    selectionEnd: from + block.length,
  };
}

/** Insert `text` on its own line at the cursor, placing the caret after it. */
function insertBlock(
  source: string,
  start: number,
  end: number,
  text: string,
): MarkdownFormatResult {
  const needsLeadingBreak = start > 0 && source[start - 1] !== '\n';
  const needsTrailingBreak = end < source.length && source[end] !== '\n';
  const inserted =
    (needsLeadingBreak ? '\n' : '') + text + (needsTrailingBreak ? '\n' : '');
  const caret = start + (needsLeadingBreak ? 1 : 0) + text.length;
  return {
    source: source.slice(0, start) + inserted + source.slice(end),
    selectionStart: caret,
    selectionEnd: caret,
  };
}

export function applyMarkdownFormat(
  source: string,
  selectionStart: number,
  selectionEnd: number,
  action: MarkdownFormatAction,
): MarkdownFormatResult {
  const start = Math.max(0, Math.min(selectionStart, selectionEnd));
  const end = Math.min(source.length, Math.max(selectionStart, selectionEnd));
  const selected = source.slice(start, end);

  switch (action) {
    case 'bold':
    case 'italic':
    case 'strikethrough':
    case 'code':
      return wrapInline(source, start, end, INLINE_WRAPS[action]);

    case 'codeBlock': {
      const body = selected || 'code';
      const result = insertBlock(source, start, end, `\`\`\`\n${body}\n\`\`\``);
      // Select the body so it can be typed over
      const bodyStart = result.source.indexOf(body, start);
      return {
        source: result.source,
        selectionStart: bodyStart,
        selectionEnd: bodyStart + body.length,
      };
    }

    case 'link': {
      const label = selected || 'link text';
      const urlStart = start + label.length + 3; // "[" + label + "]("
      return {
        source: `${source.slice(0, start)}[${label}](url)${source.slice(end)}`,
        selectionStart: urlStart,
        selectionEnd: urlStart + 3,
      };
    }

    case 'image': {
      const alt = selected || 'alt text';
      const urlStart = start + alt.length + 4; // "![" + alt + "]("
      return {
        source: `${source.slice(0, start)}![${alt}](url)${source.slice(end)}`,
        selectionStart: urlStart,
        selectionEnd: urlStart + 3,
      };
    }

    case 'heading':
      return cycleHeading(source, start, end);

    case 'bulletList':
      return prefixLines(source, start, end, /^- /, () => '- ');

    case 'numberedList':
      return prefixLines(source, start, end, /^\d+\. /, (i) => `${i + 1}. `);

    case 'quote':
      return prefixLines(source, start, end, /^> /, () => '> ');

    case 'horizontalRule':
      return insertBlock(source, start, end, '---');

    default:
      return { source, selectionStart: start, selectionEnd: end };
  }
}
