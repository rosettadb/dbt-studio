/* eslint-disable no-plusplus */
import { diffLines } from 'diff';
import { Range } from '../../../types/editor';

// Git stores blobs with LF; on Windows the editor buffer may carry CRLF
// (or vice versa under core.autocrlf=true). Without this, every line shows
// as changed. No-op on Mac/Linux where both sides are already LF.
export const normalizeEol = (s: string) => s.replace(/\r\n/g, '\n');

const getChangedLineNumbers = (oldStr: string, newStr: string) => {
  const changes = diffLines(normalizeEol(oldStr), normalizeEol(newStr));
  let line = 1;
  const added: number[] = [];
  const removed: number[] = [];

  changes.forEach((part) => {
    const lines = part.value.split('\n').length - 1;
    if (part.added) {
      for (let i = 0; i < lines; i++) added.push(line + i);
      line += lines;
    } else if (part.removed) {
      for (let i = 0; i < lines; i++) removed.push(line + i);
    } else {
      line += lines;
    }
  });

  return { added, removed };
};

export const getDecorations = (
  original: string | null,
  current: string,
  lineCount: number,
  range: (index: number) => Range,
) => {
  if (original === null) {
    return Array.from({ length: lineCount }, (_, index) => ({
      range: range(index + 1),
      options: {
        glyphMarginClassName: 'line-added-glyph-new-file',
        linesDecorationsClassName: 'line-added-decoration-new-file',
      },
    }));
  }
  const { added, removed } = getChangedLineNumbers(original, current);
  return [
    ...added.map((line) => ({
      range: range(line),
      options: {
        glyphMarginClassName: 'line-added-glyph',
        linesDecorationsClassName: 'line-added-decoration',
      },
    })),
    ...removed.map((line) => ({
      range: range(line),
      options: {
        glyphMarginClassName: 'line-removed-glyph',
        linesDecorationsClassName: 'line-removed-decoration',
      },
    })),
  ];
};

export const getLanguageFromExtension = (filePath: string): string => {
  const extension = filePath.split('.').pop()?.toLowerCase();
  switch (extension) {
    case 'yaml':
    case 'yml':
    case 'conf':
      return 'yaml';
    case 'sql':
      return 'sql';
    case 'js':
    case 'jsx':
      return 'javascript';
    case 'json':
      return 'json';
    default:
      return 'plaintext';
  }
};
