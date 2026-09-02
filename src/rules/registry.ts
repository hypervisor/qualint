import type { Diagnostic, FileMetrics, ResolvedRules, RuleId, RuleOptions, Severity } from '../types.ts';
import { cognitiveRule } from './complexity/cognitive.ts';
import { conditionRule } from './complexity/condition.ts';
import { cyclomaticRule } from './complexity/cyclomatic.ts';
import { halsteadDifficultyRule } from './complexity/halstead-difficulty.ts';
import { nestingRule } from './complexity/nesting.ts';
import { npathRule } from './complexity/npath.ts';
import { fileSizeRule } from './size/file.ts';
import { functionSizeRule } from './size/function.ts';
import { parametersRule } from './size/parameters.ts';
import { statementsRule } from './size/statements.ts';

export type DiagnosticDraft = Omit<Diagnostic, 'rule' | 'severity'>;

export interface RuleDefinition {
  id: RuleId;
  scope: 'file' | 'function' | 'condition';
  defaultSeverity: Severity | 'off';
  defaultMax: number;
  /** Whether the threshold may be fractional (Halstead) or must be an integer. */
  fractional: boolean;
  summary: string;
  explanation: string;
  check(metrics: FileMetrics, options: RuleOptions): DiagnosticDraft[];
}

const definitions: readonly RuleDefinition[] = [
  cyclomaticRule,
  cognitiveRule,
  npathRule,
  nestingRule,
  conditionRule,
  halsteadDifficultyRule,
  fileSizeRule,
  functionSizeRule,
  statementsRule,
  parametersRule,
];

export const RULES: ReadonlyMap<RuleId, RuleDefinition> = new Map(definitions.map((rule) => [rule.id, rule]));

export const RULE_IDS: readonly RuleId[] = definitions.map((rule) => rule.id);

export function isRuleId(value: string): value is RuleId {
  return RULES.has(value as RuleId);
}

/** Runs every enabled rule against one file's metrics and returns stably sorted diagnostics. */
export function runRules(metrics: FileMetrics, resolved: ResolvedRules): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const [id, setting] of resolved) {
    const rule = RULES.get(id);
    if (rule === undefined) {
      continue;
    }
    for (const draft of rule.check(metrics, setting.options)) {
      diagnostics.push({ rule: id, severity: setting.severity, ...draft });
    }
  }
  return diagnostics.sort(compareDiagnostics);
}

export function compareDiagnostics(a: Diagnostic, b: Diagnostic): number {
  return (
    a.location.line - b.location.line ||
    a.location.column - b.location.column ||
    compareStrings(a.rule, b.rule) ||
    compareStrings(a.message, b.message)
  );
}

export function compareStrings(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}
