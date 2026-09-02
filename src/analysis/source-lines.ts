import type { TSESTree } from '@typescript-eslint/typescript-estree';

/**
 * Per-line classification of a file.
 *
 * A *source line* is a physical line containing at least one non-whitespace
 * character outside comment ranges. Blank lines contain only whitespace.
 * Comment-only lines contain non-whitespace characters, all inside comments.
 *
 * Comment ranges come from the parser, so comment markers inside strings and
 * template literals are never mistaken for comments. The shebang line is not
 * reported as a comment by the parser and therefore counts as source.
 */
export interface LineTable {
  physicalLines: number;
  sourceLines: number;
  blankLines: number;
  commentOnlyLines: number;
  /** prefix[i] = number of source lines among lines 1..i (1-based, prefix[0] = 0). */
  sourcePrefix: Uint32Array;
}

export function buildLineTable(code: string, comments: readonly TSESTree.Comment[]): LineTable {
  const ranges = comments
    .map((comment) => comment.range)
    .sort((a, b) => a[0] - b[0]);

  const lineHasCode: boolean[] = [];
  const lineHasText: boolean[] = [];
  let hasCode = false;
  let hasText = false;
  let commentIndex = 0;
  let lineStarted = false;

  const closeLine = (): void => {
    lineHasCode.push(hasCode);
    lineHasText.push(hasText);
    hasCode = false;
    hasText = false;
    lineStarted = false;
  };

  const length = code.length;
  for (let index = 0; index < length; index++) {
    const char = code.charCodeAt(index);
    if (char === 0x0a || char === 0x0d || char === 0x2028 || char === 0x2029) {
      if (char === 0x0d && code.charCodeAt(index + 1) === 0x0a) {
        index++;
      }
      closeLine();
      continue;
    }
    lineStarted = true;
    if (isWhitespace(char)) {
      continue;
    }
    hasText = true;
    while (commentIndex < ranges.length && ranges[commentIndex]![1] <= index) {
      commentIndex++;
    }
    const current = ranges[commentIndex];
    const inComment = current !== undefined && index >= current[0] && index < current[1];
    if (!inComment) {
      hasCode = true;
    }
  }
  if (lineStarted) {
    closeLine();
  }

  const physicalLines = lineHasCode.length;
  const sourcePrefix = new Uint32Array(physicalLines + 1);
  let sourceLines = 0;
  let blankLines = 0;
  let commentOnlyLines = 0;
  for (let line = 0; line < physicalLines; line++) {
    if (lineHasCode[line]) {
      sourceLines++;
    } else if (lineHasText[line]) {
      commentOnlyLines++;
    } else {
      blankLines++;
    }
    sourcePrefix[line + 1] = sourceLines;
  }

  return { physicalLines, sourceLines, blankLines, commentOnlyLines, sourcePrefix };
}

/** Source lines among physical lines `startLine..endLine` (1-based, inclusive). */
export function countSourceLines(table: LineTable, startLine: number, endLine: number): number {
  const last = Math.min(endLine, table.physicalLines);
  const first = Math.max(startLine, 1);
  if (last < first) {
    return 0;
  }
  return table.sourcePrefix[last]! - table.sourcePrefix[first - 1]!;
}

const WHITESPACE: ReadonlySet<number> = new Set([
  0x20, 0x09, 0x0b, 0x0c, 0xa0, 0xfeff, 0x1680, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008,
  0x2009, 0x200a, 0x202f, 0x205f, 0x3000,
]);

function isWhitespace(char: number): boolean {
  return WHITESPACE.has(char);
}
