import type { RuleDefinition } from '../registry.ts';
import { functionDiagnostic } from '../shared.ts';

export const parametersRule: RuleDefinition = {
  id: 'size/parameters',
  scope: 'function',
  defaultSeverity: 'error',
  defaultMax: 5,
  fractional: false,
  summary: 'Number of syntactic parameters a function declares.',
  explanation: `Each syntactic parameter counts once. Destructured, defaulted and rest
parameters each count as one. A TypeScript \`this\` pseudo-parameter does not
count because callers never supply it.`,
  check(metrics, options) {
    return metrics.functions
      .filter((fn) => fn.parameterCount > options.max)
      .map((fn) =>
        functionDiagnostic(
          fn,
          `Function \`${fn.name}\` has ${fn.parameterCount} parameters; maximum is ${options.max}`,
          fn.parameterCount,
          options.max,
        ),
      );
  },
};
