import { DEFAULT_PRESET, presetMax } from '../../config/presets.ts';
import type { RuleDefinition } from '../registry.ts';
import { functionThreshold } from '../shared.ts';

export const parametersRule: RuleDefinition = {
  id: 'size/parameters',
  scope: 'function',
  defaultSeverity: 'error',
  defaultMax: presetMax('size/parameters', DEFAULT_PRESET),
  fractional: false,
  summary: 'Number of syntactic parameters a function declares.',
  explanation: `Each syntactic parameter counts once. Destructured, defaulted and rest
parameters each count as one. A TypeScript \`this\` pseudo-parameter does not
count because callers never supply it.`,
  check: functionThreshold(
    (fn) => fn.parameterCount,
    (fn, value, max) => `Function \`${fn.name}\` has ${value} parameters; maximum is ${max}`,
  ),
};
