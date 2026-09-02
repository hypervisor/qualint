import type { RuleDefinition } from '../registry.ts';
import { functionDiagnostic } from '../shared.ts';

export const cognitiveRule: RuleDefinition = {
  id: 'complexity/cognitive',
  scope: 'function',
  defaultSeverity: 'error',
  defaultMax: 15,
  fractional: false,
  summary: 'How hard a function is to follow; nested control flow costs more than flat control flow.',
  explanation: `A control-flow nesting level starts at 0. The following add 1 + current nesting
and increase the nesting level while their body is visited:

  - the first if of an if / else if chain
  - loops
  - catch
  - switch (as a whole; case labels add nothing)
  - conditional expressions (a ? b : c)

else if adds 1 with no nesting penalty; a final else adds 1.

The following add 1 without a nesting penalty:

  - each sequence of identical logical operators, plus 1 each time the
    operator changes: a && b && c adds 1, a && b || c adds 2
  - labeled break and labeled continue

Nothing is added for guard-clause returns, plain break/continue, optional
chaining, try, finally or TypeScript-only syntax. Nested functions are scored
separately. Use \`qualint inspect <file>\` to see every contribution.`,
  check(metrics, options) {
    return metrics.functions
      .filter((fn) => fn.cognitiveComplexity > options.max)
      .map((fn) =>
        functionDiagnostic(
          fn,
          `Function \`${fn.name}\` has cognitive complexity ${fn.cognitiveComplexity}; maximum is ${options.max}`,
          fn.cognitiveComplexity,
          options.max,
        ),
      );
  },
};
