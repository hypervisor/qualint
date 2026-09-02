import { DEFAULT_PRESET, presetMax } from '../../config/presets.ts';
import type { RuleDefinition } from '../registry.ts';
import { functionDiagnostic } from '../shared.ts';

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
  - each optional-chain segment that may short-circuit (a?.b, fn?.())
  - each default value in parameters or destructuring patterns

else, finally, default, plain blocks and nested function bodies add nothing.
TypeScript-only syntax (as, satisfies, !, type annotations) adds nothing.
Nested functions are measured separately.`,
  check(metrics, options) {
    return metrics.functions
      .filter((fn) => fn.cyclomaticComplexity > options.max)
      .map((fn) =>
        functionDiagnostic(
          fn,
          `Function \`${fn.name}\` has cyclomatic complexity ${fn.cyclomaticComplexity}; maximum is ${options.max}`,
          fn.cyclomaticComplexity,
          options.max,
        ),
      );
  },
};
