import type { Diagnostic, FileMetrics, ResolvedRules, RuleId, RuleOptions, Severity } from '../types.ts';
import { compareStrings } from '../compare.ts';
import { duplicateFunctionRule } from './duplicate/function.ts';
import { cognitiveRule } from './complexity/cognitive.ts';
import { conditionRule } from './complexity/condition.ts';
import { cyclomaticRule } from './complexity/cyclomatic.ts';
import { nestingRule } from './complexity/nesting.ts';
import { npathRule } from './complexity/npath.ts';
import { fileSizeRule } from './size/file.ts';
import { functionSizeRule } from './size/function.ts';
import { parametersRule } from './size/parameters.ts';
import { statementsRule } from './size/statements.ts';

export type DiagnosticDraft = Omit<Diagnostic, 'rule' | 'severity'>;

/** One analyzed file, as seen by a project-scoped rule. */
export interface ProjectFile {
  path: string;
  metrics: FileMetrics;
}

/** A draft from a project-scoped rule, which must say which file it belongs to. */
export interface ProjectDiagnosticDraft extends DiagnosticDraft {
  path: string;
}

export interface RuleDefinition {
  id: RuleId;
  scope: 'file' | 'function' | 'condition' | 'project';
  defaultSeverity: Severity | 'off';
  defaultMax: number;
  /** Whether the threshold may be fractional (Halstead) or must be an integer. */
  fractional: boolean;
  summary: string;
  explanation: string;
  /** Option names this rule accepts besides `max`. */
  extraOptions?: readonly string[];
  /** File-scoped rules compare one file's metrics with the thresholds. */
  check?(metrics: FileMetrics, options: RuleOptions): DiagnosticDraft[];
  /** Project-scoped rules compare every analyzed file at once. */
  checkProject?(files: readonly ProjectFile[], options: RuleOptions): ProjectDiagnosticDraft[];
}

const definitions: readonly RuleDefinition[] = [
  duplicateFunctionRule,
  cyclomaticRule,
  cognitiveRule,
  npathRule,
  nestingRule,
  conditionRule,
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
    if (rule?.check === undefined) {
      continue;
    }
    for (const draft of rule.check(metrics, setting.options)) {
      diagnostics.push({ rule: id, severity: setting.severity, ...draft });
    }
  }
  return diagnostics.sort(compareDiagnostics);
}

/**
 * Runs project-scoped rules across every analyzed file and returns their
 * diagnostics keyed by file path.
 *
 * Grouping needs one consistent set of options, so thresholds come from the
 * configuration root. Severity, and whether the rule applies at all, still come
 * from the file the diagnostic lands on, so an override can switch a rule off
 * for a directory.
 */
export function runProjectRules(
  files: readonly ProjectFile[],
  rootRules: ResolvedRules,
  rulesForPath: (path: string) => ResolvedRules,
): Map<string, Diagnostic[]> {
  const byPath = new Map<string, Diagnostic[]>();
  for (const [id, rootSetting] of rootRules) {
    const rule = RULES.get(id);
    if (rule?.checkProject === undefined) {
      continue;
    }
    for (const draft of rule.checkProject(files, rootSetting.options)) {
      const setting = rulesForPath(draft.path).get(id);
      if (setting === undefined) {
        continue;
      }
      const { path, ...rest } = draft;
      const existing = byPath.get(path);
      const diagnostic: Diagnostic = { rule: id, severity: setting.severity, ...rest };
      if (existing === undefined) {
        byPath.set(path, [diagnostic]);
      } else {
        existing.push(diagnostic);
      }
    }
  }
  return byPath;
}

export function compareDiagnostics(a: Diagnostic, b: Diagnostic): number {
  return (
    a.location.line - b.location.line ||
    a.location.column - b.location.column ||
    compareStrings(a.rule, b.rule) ||
    compareStrings(a.message, b.message)
  );
}

