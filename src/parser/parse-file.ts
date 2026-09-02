import { parse, TSError, type TSESTree } from '@typescript-eslint/typescript-estree';
import path from 'node:path';

export interface ParsedFile {
  ast: TSESTree.Program;
  tokens: TSESTree.Token[];
  comments: TSESTree.Comment[];
  code: string;
}

export class ParseFailure extends Error {
  readonly line: number | null;
  readonly column: number | null;

  constructor(message: string, line: number | null, column: number | null) {
    super(message);
    this.name = 'ParseFailure';
    this.line = line;
    this.column = column;
  }
}

export const SUPPORTED_EXTENSIONS: ReadonlySet<string> = new Set([
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.mjs',
  '.cjs',
  '.mts',
  '.cts',
]);

/** Extensions where `<T>` is a type assertion or generic, so JSX must stay disabled. */
const NO_JSX_EXTENSIONS: ReadonlySet<string> = new Set(['.ts', '.mts', '.cts']);

export function isSupportedFile(filePath: string): boolean {
  return SUPPORTED_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

/**
 * Parses one file into an ESTree-compatible AST with tokens, comments, ranges and
 * locations. No TypeScript program or tsconfig is involved.
 */
export function parseSource(code: string, filePath: string): ParsedFile {
  const extension = path.extname(filePath).toLowerCase();
  try {
    const ast = parse(code, {
      comment: true,
      tokens: true,
      loc: true,
      range: true,
      jsx: !NO_JSX_EXTENSIONS.has(extension),
      errorOnUnknownASTType: false,
      suppressDeprecatedPropertyWarnings: true,
      filePath,
    });
    return { ast, tokens: ast.tokens ?? [], comments: ast.comments ?? [], code };
  } catch (error) {
    if (error instanceof TSError) {
      // TSError columns are 0-based; Qualint reports 1-based columns everywhere.
      throw new ParseFailure(error.message, error.location.start.line, error.location.start.column + 1);
    }
    throw new ParseFailure(error instanceof Error ? error.message : String(error), null, null);
  }
}
