import type { TSESTree } from '@typescript-eslint/typescript-estree';
import type { HalsteadMetrics } from '../types.ts';

/**
 * Halstead token classification.
 *
 * The analysis walk annotates tokens with marks derived from the AST so that
 * classification never depends on parser-internal token kinds:
 *
 * | Mark      | Meaning                                                             |
 * | --------- | ------------------------------------------------------------------- |
 * | NONE      | Classify by the token table below.                                  |
 * | IGNORE    | Type-only syntax, JSX delimiters, whitespace-only JSX text.         |
 * | OPERATOR  | Call parentheses, index/array brackets, object braces.              |
 * | OPERAND   | Identifier references, property names, literals, JSX names/text.    |
 *
 * Token table for unmarked tokens:
 *
 * | Token                                         | Class     |
 * | --------------------------------------------- | --------- |
 * | `this`, `super`                               | operand   |
 * | modifier words (`private`, `readonly`, `as`…) | ignored   |
 * | any other keyword or contextual keyword       | operator  |
 * | `( ) [ ] { } , ; :`                           | ignored   |
 * | `?` before `: ) , ; }` (optional marker)      | ignored   |
 * | `!` before `:` (definite assignment)          | ignored   |
 * | any other punctuator (`+`, `=>`, `?.`, `...`) | operator  |
 * | numbers, strings, templates, regexps, booleans, null, private names | operand |
 *
 * Nested function bodies are excluded from the enclosing function by range.
 */
export const MARK_NONE = 0;
export const MARK_IGNORE = 1;
export const MARK_OPERATOR = 2;
export const MARK_OPERAND = 3;

const IGNORED_PUNCTUATORS: ReadonlySet<string> = new Set(['(', ')', '[', ']', '{', '}', ',', ';', ':']);
const OPTIONAL_MARKER_FOLLOWERS: ReadonlySet<string> = new Set([':', ')', ',', ';', '}']);
const IGNORED_WORDS: ReadonlySet<string> = new Set([
  'private',
  'public',
  'protected',
  'readonly',
  'declare',
  'abstract',
  'override',
  'implements',
  'as',
  'satisfies',
]);
const OPERAND_KEYWORDS: ReadonlySet<string> = new Set(['this', 'super']);

export class TokenMarks {
  readonly tokens: readonly TSESTree.Token[];
  private readonly marks: Uint8Array;
  private readonly starts: number[];

  constructor(tokens: readonly TSESTree.Token[]) {
    this.tokens = tokens;
    this.marks = new Uint8Array(tokens.length);
    this.starts = tokens.map((token) => token.range[0]);
  }

  /** Index of the first token starting at or after `offset`. */
  indexAtOrAfter(offset: number): number {
    let low = 0;
    let high = this.starts.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (this.starts[middle]! < offset) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }
    return low;
  }

  markRange(range: readonly [number, number], mark: number): void {
    const end = range[1];
    for (let index = this.indexAtOrAfter(range[0]); index < this.tokens.length && this.starts[index]! < end; index++) {
      this.marks[index] = mark;
    }
  }

  /** Marks the token that starts exactly at `offset`, if any. */
  markAt(offset: number, mark: number): void {
    const index = this.indexAtOrAfter(offset);
    if (index < this.tokens.length && this.starts[index] === offset) {
      this.marks[index] = mark;
    }
  }

  /** Marks the first punctuator with the given value at or after `from` and before `before`. */
  markPunctuator(from: number, before: number, value: string, mark: number): void {
    for (let index = this.indexAtOrAfter(from); index < this.tokens.length && this.starts[index]! < before; index++) {
      const token = this.tokens[index]!;
      if (token.type === 'Punctuator' && token.value === value) {
        this.marks[index] = mark;
        return;
      }
    }
  }

  markOf(index: number): number {
    return this.marks[index]!;
  }
}

type TokenClass = { kind: 'operator' | 'operand'; key: string } | null;

export function classifyToken(marks: TokenMarks, index: number): TokenClass {
  const token = marks.tokens[index]!;
  const mark = marks.markOf(index);
  if (mark === MARK_IGNORE) {
    return null;
  }
  if (mark === MARK_OPERATOR) {
    return { kind: 'operator', key: token.value };
  }
  if (mark === MARK_OPERAND) {
    return { kind: 'operand', key: `${token.type}:${token.value}` };
  }
  switch (token.type) {
    case 'Punctuator': {
      if (IGNORED_PUNCTUATORS.has(token.value)) {
        return null;
      }
      const next = marks.tokens[index + 1];
      if (token.value === '?' && next !== undefined && next.type === 'Punctuator' && OPTIONAL_MARKER_FOLLOWERS.has(next.value)) {
        return null;
      }
      if (token.value === '!' && next !== undefined && next.type === 'Punctuator' && next.value === ':') {
        return null;
      }
      return { kind: 'operator', key: token.value };
    }
    case 'Keyword':
    case 'Identifier':
      // Unmarked identifiers are contextual keywords (`async`, `get`, `of`, …);
      // real identifier references are marked as operands by the walker.
      if (OPERAND_KEYWORDS.has(token.value)) {
        return { kind: 'operand', key: `Keyword:${token.value}` };
      }
      if (IGNORED_WORDS.has(token.value)) {
        return null;
      }
      return { kind: 'operator', key: token.value };
    case 'JSXText':
      return token.value.trim() === '' ? null : { kind: 'operand', key: `JSXText:${token.value}` };
    case 'Boolean':
    case 'Null':
    case 'Numeric':
    case 'String':
    case 'Template':
    case 'RegularExpression':
    case 'PrivateIdentifier':
    case 'JSXIdentifier':
      return { kind: 'operand', key: `${token.type}:${token.value}` };
    default:
      return null;
  }
}

/**
 * Computes Halstead metrics for the tokens inside `range`, skipping any token
 * that falls inside one of the sorted, non-overlapping `excluded` ranges.
 */
export function computeHalstead(
  marks: TokenMarks,
  range: readonly [number, number],
  excluded: ReadonlyArray<readonly [number, number]>,
): HalsteadMetrics {
  const operators = new Map<string, number>();
  const operands = new Map<string, number>();
  let totalOperators = 0;
  let totalOperands = 0;
  let excludedIndex = 0;

  for (let index = marks.indexAtOrAfter(range[0]); index < marks.tokens.length; index++) {
    const token = marks.tokens[index]!;
    const start = token.range[0];
    if (start >= range[1]) {
      break;
    }
    while (excludedIndex < excluded.length && excluded[excludedIndex]![1] <= start) {
      excludedIndex++;
    }
    const exclusion = excluded[excludedIndex];
    if (exclusion !== undefined && start >= exclusion[0]) {
      continue;
    }
    const classified = classifyToken(marks, index);
    if (classified === null) {
      continue;
    }
    if (classified.kind === 'operator') {
      totalOperators++;
      operators.set(classified.key, (operators.get(classified.key) ?? 0) + 1);
    } else {
      totalOperands++;
      operands.set(classified.key, (operands.get(classified.key) ?? 0) + 1);
    }
  }

  return deriveHalstead(operators.size, operands.size, totalOperators, totalOperands);
}

export function deriveHalstead(
  distinctOperators: number,
  distinctOperands: number,
  totalOperators: number,
  totalOperands: number,
): HalsteadMetrics {
  const vocabulary = distinctOperators + distinctOperands;
  const length = totalOperators + totalOperands;
  const volume = vocabulary > 0 ? length * Math.log2(vocabulary) : 0;
  const difficulty = distinctOperands > 0 ? (distinctOperators / 2) * (totalOperands / distinctOperands) : 0;
  const effort = difficulty * volume;
  return {
    distinctOperators,
    distinctOperands,
    totalOperators,
    totalOperands,
    vocabulary,
    length,
    volume,
    difficulty,
    effort,
  };
}
