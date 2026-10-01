import { applyMarkdownFormat } from '../../../../src/renderer/components/notebook/python/markdownFormatting';

describe('applyMarkdownFormat', () => {
  it('wraps the selection in bold and selects the inner text', () => {
    const result = applyMarkdownFormat('hello world', 6, 11, 'bold');
    expect(result.source).toBe('hello **world**');
    expect(result.selectionStart).toBe(8);
    expect(result.selectionEnd).toBe(13);
  });

  it('inserts a placeholder when nothing is selected', () => {
    const result = applyMarkdownFormat('', 0, 0, 'italic');
    expect(result.source).toBe('_italic text_');
    expect(
      result.source.slice(result.selectionStart, result.selectionEnd),
    ).toBe('italic text');
  });

  it('toggles an inline wrap off when the selection is already wrapped', () => {
    // Wrap outside the selection
    const outside = applyMarkdownFormat('a **b** c', 4, 5, 'bold');
    expect(outside.source).toBe('a b c');
    expect([outside.selectionStart, outside.selectionEnd]).toEqual([2, 3]);

    // Wrap inside the selection
    const inside = applyMarkdownFormat('a `b` c', 2, 5, 'code');
    expect(inside.source).toBe('a b c');
  });

  it('prefixes every selected line for lists and toggles them off', () => {
    const source = 'one\ntwo\nthree';
    const bulleted = applyMarkdownFormat(
      source,
      0,
      source.length,
      'bulletList',
    );
    expect(bulleted.source).toBe('- one\n- two\n- three');

    const numbered = applyMarkdownFormat(
      source,
      0,
      source.length,
      'numberedList',
    );
    expect(numbered.source).toBe('1. one\n2. two\n3. three');

    const cleared = applyMarkdownFormat(
      bulleted.source,
      0,
      bulleted.source.length,
      'bulletList',
    );
    expect(cleared.source).toBe(source);
  });

  it('applies line prefixes to the whole line the caret is on', () => {
    const result = applyMarkdownFormat('first\nsecond', 8, 8, 'quote');
    expect(result.source).toBe('first\n> second');
  });

  it('cycles heading levels 1 → 2 → 3 → none', () => {
    let source = 'Title';
    source = applyMarkdownFormat(source, 0, 0, 'heading').source;
    expect(source).toBe('# Title');
    source = applyMarkdownFormat(source, 0, 0, 'heading').source;
    expect(source).toBe('## Title');
    source = applyMarkdownFormat(source, 0, 0, 'heading').source;
    expect(source).toBe('### Title');
    source = applyMarkdownFormat(source, 0, 0, 'heading').source;
    expect(source).toBe('Title');
  });

  it('builds links and images and selects the url placeholder', () => {
    const link = applyMarkdownFormat('see docs', 4, 8, 'link');
    expect(link.source).toBe('see [docs](url)');
    expect(link.source.slice(link.selectionStart, link.selectionEnd)).toBe(
      'url',
    );

    const image = applyMarkdownFormat('', 0, 0, 'image');
    expect(image.source).toBe('![alt text](url)');
    expect(image.source.slice(image.selectionStart, image.selectionEnd)).toBe(
      'url',
    );
  });

  it('inserts fenced code blocks and horizontal rules on their own lines', () => {
    const block = applyMarkdownFormat('before', 6, 6, 'codeBlock');
    expect(block.source).toBe('before\n```\ncode\n```');
    expect(block.source.slice(block.selectionStart, block.selectionEnd)).toBe(
      'code',
    );

    const rule = applyMarkdownFormat('a\nb', 1, 1, 'horizontalRule');
    expect(rule.source).toBe('a\n---\nb');
    expect(rule.selectionStart).toBe(5);
  });

  it('normalises a backwards selection', () => {
    const result = applyMarkdownFormat('hello', 5, 0, 'strikethrough');
    expect(result.source).toBe('~~hello~~');
  });
});
