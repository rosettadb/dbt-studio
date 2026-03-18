/* eslint-disable no-plusplus */
import { diffLines, parsePatch } from 'diff';
import { Range } from '../../../types/editor';

const getChangedLineNumbers = (oldStr: string, newStr: string) => {
  const changes = diffLines(oldStr, newStr);
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
      return 'jinja-sql';
    case 'js':
    case 'jsx':
      return 'javascript';
    case 'json':
      return 'json';
    default:
      return 'plaintext';
  }
};

export const getVersionsFromDiff = (newContent: string, diffString: string) => {
  if (!diffString || diffString.trim() === '' || diffString === 'undefined') {
    return {
      oldVersion: newContent,
      newVersion: newContent,
    };
  }

  let patch;
  try {
    [patch] = parsePatch(diffString);
  } catch (error) {
    return {
      oldVersion: newContent,
      newVersion: newContent,
    };
  }

  if (!patch) {
    return {
      oldVersion: newContent,
      newVersion: newContent,
    };
  }
  const newLines = newContent.split('\n');

  const oldLines = [...newLines];
  let offset = 0;

  patch.hunks?.forEach((hunk) => {
    let newIndex = hunk.newStart - 1 + offset;
    let removedCount = 0;

    hunk.lines.forEach((line) => {
      const type = line[0];
      const value = line.slice(1);

      if (type === '+') {
        oldLines.splice(newIndex, 1);
        removedCount += 1;
      } else if (type === '-') {
        oldLines.splice(newIndex, 0, value);
        newIndex++;
      } else {
        newIndex++;
      }
    });

    offset -= removedCount;
  });

  return {
    oldVersion: oldLines.join('\n'),
    newVersion: newContent,
  };
};
