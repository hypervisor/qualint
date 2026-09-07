import { DEFAULT_PRESET, presetMax } from '../../config/presets.ts';
import type { RuleDefinition } from '../registry.ts';
import { functionThreshold } from '../shared.ts';

export const statementsRule: RuleDefinition = {
  id: 'size/statements',
  scope: 'function',
  defaultSeverity: 'error',
  defaultMax: presetMax('size/statements', DEFAULT_PRESET),
  fractional: false,
  summary: 'Executable statements owned by a function.',
  explanation: `Counts executable ESTree statement nodes owned by the function, at any nesting
depth inside branches and loops. Not counted:

  - block containers and empty statements
  - type-only declarations (interfaces, type aliases, declare ...)
  - loop-head declarations such as the const in for (const x of xs)
  - else if, which continues the statement it belongs to
  - statements inside nested functions
  - JSX nodes and expressions, however many AST nodes they contain

A variable declaration counts once regardless of declarators. A nested function
declaration counts as one statement; its body is excluded.`,
  check: functionThreshold(
    (fn) => fn.statementCount,
    (fn, value, max) => `Function \`${fn.name}\` contains ${value} statements; maximum is ${max}`,
  ),
};
