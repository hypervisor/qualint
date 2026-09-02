import { DEFAULT_PRESET, presetMax } from '../../config/presets.ts';
import type { RuleDefinition } from '../registry.ts';
import { functionDiagnostic } from '../shared.ts';

export const halsteadDifficultyRule: RuleDefinition = {
  id: 'complexity/halstead-difficulty',
  scope: 'function',
  defaultSeverity: 'off',
  defaultMax: presetMax('complexity/halstead-difficulty', DEFAULT_PRESET),
  fractional: true,
  summary: 'Halstead difficulty: (distinct operators / 2) x (total operands / distinct operands).',
  explanation: `Halstead metrics are computed from the tokens a function owns, excluding
nested function bodies, comments and type-only syntax:

  n1 = distinct operators      N1 = total operators
  n2 = distinct operands       N2 = total operands

  vocabulary = n1 + n2
  length     = N1 + N2
  volume     = length x log2(vocabulary)
  difficulty = (n1 / 2) x (N2 / n2)
  effort     = difficulty x volume

Operators: runtime keywords, arithmetic/logical/assignment punctuators, member
access, arrow, spread, call parentheses, index brackets, array and object
literals. Operands: identifier references, property names, literals, this and
super, JSX tag and attribute names, JSX text. Ignored: delimiters used only for
grouping or separation, comments, TypeScript-only syntax and JSX delimiters.

When the vocabulary or operand count is zero the derived values are 0. The rule
is off by default because useful thresholds vary between code styles. All
Halstead values appear in inspect and JSON output regardless.`,
  check(metrics, options) {
    return metrics.functions
      .filter((fn) => fn.halstead.difficulty > options.max)
      .map((fn) => {
        const rounded = Math.round(fn.halstead.difficulty * 10) / 10;
        return functionDiagnostic(
          fn,
          `Function \`${fn.name}\` has Halstead difficulty ${rounded.toFixed(1)}; maximum is ${options.max}`,
          rounded,
          options.max,
        );
      });
  },
};
