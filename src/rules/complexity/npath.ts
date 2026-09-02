import type { RuleDefinition } from '../registry.ts';
import { formatBig, functionDiagnostic } from '../shared.ts';

export const npathRule: RuleDefinition = {
  id: 'complexity/npath',
  scope: 'function',
  defaultSeverity: 'error',
  defaultMax: 200,
  fractional: false,
  summary: 'Number of acyclic execution paths through a function; sequential decisions multiply.',
  explanation: `Paths are composed recursively:

  - an ordinary statement has one path; sequential statements multiply
  - if: then-paths + else-paths (a missing else is one path)
  - loops: one path that skips the body plus the body's paths
  - a ? b : c: b-paths + c-paths
  - a && b (also ||, ??, &&=, ||=, ??=): left-paths + right-paths, so a chain
    of n operators has n + 1 paths
  - switch: the sum of each case entry's paths including fall-through, plus
    one no-match path when there is no default
  - try / catch are alternatives; every path then passes through finally
  - nested functions contribute one path

Short-circuit operators inside an if, loop or conditional test add their extra
paths to that construct. return, throw, break and continue stop later
statements on the same path from multiplying. Loops count zero or one
iteration because NPath is acyclic.

Values can exceed 2^53; JSON output carries them as decimal strings.`,
  check(metrics, options) {
    const max = BigInt(options.max);
    return metrics.functions
      .filter((fn) => fn.npathComplexity > max)
      .map((fn) =>
        functionDiagnostic(
          fn,
          `Function \`${fn.name}\` has NPath complexity ${formatBig(fn.npathComplexity)}; maximum is ${options.max}`,
          fn.npathComplexity.toString(),
          options.max,
        ),
      );
  },
};
