import { DEFAULT_PRESET, presetMax } from '../../config/presets.ts';
import type { RuleDefinition } from '../registry.ts';

export const fileSizeRule: RuleDefinition = {
  id: 'size/file',
  scope: 'file',
  defaultSeverity: 'error',
  defaultMax: presetMax('size/file', DEFAULT_PRESET),
  fractional: false,
  summary: 'Source lines in a file, excluding blank and comment-only lines.',
  explanation: `A source line is a physical line that contains at least one non-whitespace
character after comment ranges are removed. Blank lines and comment-only lines
do not count; lines that mix code and a comment do.

  // ignored

  function answer() {  // counted
    /* comment */      // ignored
    return 42;         // counted
  }                    // counted

Multiline expressions and JSX count one per physical line with code. Imports,
exports, types, interfaces, decorators and declarations count normally. A
shebang line counts. Comment-like text inside strings and template literals is
never removed because comment ranges come from the parser.`,
  check(metrics, options) {
    if (metrics.sourceLines <= options.max) {
      return [];
    }
    return [
      {
        message: `File contains ${metrics.sourceLines} source lines; maximum is ${options.max}`,
        value: metrics.sourceLines,
        maximum: options.max,
        entity: null,
        location: { line: 1, column: 1 },
      },
    ];
  },
};
