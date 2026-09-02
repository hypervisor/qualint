import type { ConditionGroup } from '../../types.ts';
import { DEFAULT_PRESET, presetMax } from '../../config/presets.ts';
import type { DiagnosticDraft, RuleDefinition } from '../registry.ts';

export const conditionRule: RuleDefinition = {
  id: 'complexity/condition',
  scope: 'condition',
  defaultSeverity: 'error',
  defaultMax: presetMax('complexity/condition', DEFAULT_PRESET),
  fractional: false,
  summary: 'Number of atomic decision clauses in a single condition or short-circuit expression.',
  explanation: `A condition group is one of:

  - the test of an if, while, do...while or for
  - a complete conditional expression (the root ?: is the first decision)
  - a top-level logical expression used as a value, including JSX
    conditional rendering such as ready && <Panel />

Scores:

  - if / loop test:               1 + logical operators + conditional operators
  - value-position logical group: 1 + logical operators + conditional operators
  - conditional-expression group: conditional operators + logical operators

Counted logical operators are &&, || and ??. Parentheses, negation and
comparisons add nothing. Nested logical and conditional nodes are reported
only as part of their outermost group.

  if (a) {}                          // 1
  if (a && b && c) {}                // 3
  if (a && (b || c) && d) {}         // 4
  const v = a ? b : c ? d : e;       // 2
  return ready && <Panel />;         // 2`,
  check(metrics, options) {
    const drafts: DiagnosticDraft[] = [];
    const report = (group: ConditionGroup, entity: string | null): void => {
      if (group.complexity > options.max) {
        const where = entity === null ? 'Condition' : `Condition in \`${entity}\``;
        drafts.push({
          message: `${where} has complexity ${group.complexity}; maximum is ${options.max}`,
          value: group.complexity,
          maximum: options.max,
          entity,
          location: group.location,
        });
      }
    };
    for (const group of metrics.moduleConditions) {
      report(group, null);
    }
    for (const fn of metrics.functions) {
      for (const group of fn.conditions) {
        report(group, fn.name);
      }
    }
    return drafts;
  },
};
