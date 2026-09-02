import { DEFAULT_PRESET, presetMax } from '../../config/presets.ts';
import type { RuleDefinition } from '../registry.ts';
import { functionDiagnostic } from '../shared.ts';

export const functionSizeRule: RuleDefinition = {
  id: 'size/function',
  scope: 'function',
  defaultSeverity: 'error',
  defaultMax: presetMax('size/function', DEFAULT_PRESET),
  fractional: false,
  summary: 'Source lines in a function, using the same definition as size/file.',
  explanation: `Counts the physical lines intersecting the function's range that contain code
outside comments. The signature, braces and expression body count when they
contain code; blank and comment-only lines inside the function do not.

Nested functions remain part of the enclosing function's physical size even
though their statements and complexity are measured independently. Methods
include their key and modifiers.`,
  check(metrics, options) {
    return metrics.functions
      .filter((fn) => fn.sourceLines > options.max)
      .map((fn) =>
        functionDiagnostic(
          fn,
          `Function \`${fn.name}\` contains ${fn.sourceLines} source lines; maximum is ${options.max}`,
          fn.sourceLines,
          options.max,
        ),
      );
  },
};
