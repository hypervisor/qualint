import type { RuleDefinition } from '../registry.ts';
import { functionDiagnostic } from '../shared.ts';

export const statementsRule: RuleDefinition = {
  id: 'size/statements',
  scope: 'function',
  defaultSeverity: 'error',
  defaultMax: 30,
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
  check(metrics, options) {
    return metrics.functions
      .filter((fn) => fn.statementCount > options.max)
      .map((fn) =>
        functionDiagnostic(
          fn,
          `Function \`${fn.name}\` contains ${fn.statementCount} statements; maximum is ${options.max}`,
          fn.statementCount,
          options.max,
        ),
      );
  },
};
