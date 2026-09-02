import { DEFAULT_PRESET, presetMax } from '../../config/presets.ts';
import type { RuleDefinition } from '../registry.ts';

export const nestingRule: RuleDefinition = {
  id: 'complexity/nesting',
  scope: 'function',
  defaultSeverity: 'error',
  defaultMax: presetMax('complexity/nesting', DEFAULT_PRESET),
  fractional: false,
  summary: 'Greatest number of simultaneously enclosing control-flow constructs in a function.',
  explanation: `Depth increases by one while the controlled body of each of these is visited:

  - if and else branches
  - loops
  - switch
  - try, catch and finally bodies
  - conditional expressions (a ? b : c)

else if continues the existing chain and does not add a level. case labels,
plain blocks, functions, classes, callbacks and JSX elements add nothing.
Nested functions restart at depth 0.

The diagnostic points at the construct sitting at the maximum depth.`,
  check(metrics, options) {
    return metrics.functions
      .filter((fn) => fn.maximumNestingDepth > options.max && fn.maximumNestingLocation !== null)
      .map((fn) => ({
        message: `Nesting depth is ${fn.maximumNestingDepth}; maximum is ${options.max}`,
        value: fn.maximumNestingDepth,
        maximum: options.max,
        entity: fn.name,
        location: fn.maximumNestingLocation!,
      }));
  },
};
