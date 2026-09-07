import { DEFAULT_PRESET, presetMax } from '../../config/presets.ts';
import type { RuleDefinition } from '../registry.ts';
import { describeDecisions, functionThreshold } from '../shared.ts';

export const cyclomaticRule: RuleDefinition = {
  id: 'complexity/cyclomatic',
  scope: 'function',
  defaultSeverity: 'error',
  defaultMax: presetMax('complexity/cyclomatic', DEFAULT_PRESET),
  fractional: false,
  summary: 'Number of linearly independent paths through a function.',
  explanation: `Each function starts at 1. One is added for every runtime decision point the
function owns:

  - if, else if
  - for, for...in, for...of, while, do...while
  - catch
  - conditional expression (a ? b : c)
  - each non-default switch case
  - each &&, || or ?? operator
  - each &&=, ||= or ??= logical assignment
  - each optional chain, counted once however many links it has (a?.b?.c)
  - each default value in parameters or destructuring patterns

else, finally, default, plain blocks and nested function bodies add nothing.
TypeScript-only syntax (as, satisfies, !, type annotations) adds nothing.
Nested functions are measured separately.`,
  check: functionThreshold(
    (fn) => fn.cyclomaticComplexity,
    (fn, value, max) => `Function \`${fn.name}\` has cyclomatic complexity ${value}; maximum is ${max}`,
    describeDecisions,
  ),
};
