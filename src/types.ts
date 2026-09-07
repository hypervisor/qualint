/**
 * Shared data model for Qualint.
 *
 * Analysis produces metric records; rules compare them with thresholds and
 * build diagnostics; formatters render results. Nothing outside `analysis`
 * touches AST nodes.
 */

/** A 1-based line/column position. Columns are 1-based unlike ESTree. */
export interface SourcePosition {
  line: number;
  column: number;
}

export interface SourceLocation {
  start: SourcePosition;
  end: SourcePosition;
}

/** One line of the explainable cognitive-complexity ledger. */
export interface CognitiveContribution {
  location: SourcePosition;
  construct: string;
  base: number;
  nesting: number;
  total: number;
}

/** How many decision points of each kind a function owns, for explaining a score. */
export interface DecisionCount {
  kind: string;
  count: number;
}

/** One step of the construct chain leading to a function's deepest point. */
export interface NestingStep {
  construct: string;
  location: SourcePosition;
}

/** One outermost condition group (an `if` test, a ternary, a value-position `&&` chain, ...). */
export interface ConditionGroup {
  location: SourcePosition;
  complexity: number;
}

export interface FunctionMetrics {
  name: string;
  location: SourceLocation;
  sourceLines: number;
  statementCount: number;
  parameterCount: number;
  cyclomaticComplexity: number;
  cognitiveComplexity: number;
  cognitiveContributions: CognitiveContribution[];
  npathComplexity: bigint;
  maximumNestingDepth: number;
  /** Location of the construct that sits at the maximum depth; null when depth is 0. */
  maximumNestingLocation: SourcePosition | null;
  /** Enclosing constructs from the function body down to the deepest point. */
  maximumNestingPath: NestingStep[];
  /** Decision points by kind, most frequent first. */
  decisions: DecisionCount[];
  maximumConditionComplexity: number;
  conditions: ConditionGroup[];
}

export interface FileMetrics {
  physicalLines: number;
  sourceLines: number;
  blankLines: number;
  commentOnlyLines: number;
  functions: FunctionMetrics[];
  /** Condition groups that sit in module scope, outside any function. */
  moduleConditions: ConditionGroup[];
}

export type Severity = 'error' | 'warn';

export type RuleId =
  | 'complexity/cyclomatic'
  | 'complexity/cognitive'
  | 'complexity/npath'
  | 'complexity/nesting'
  | 'complexity/condition'
  | 'size/file'
  | 'size/function'
  | 'size/statements'
  | 'size/parameters';

export interface Diagnostic {
  rule: RuleId;
  severity: Severity;
  message: string;
  /** Measured value. NPath is serialized as a decimal string because it may exceed 2^53. */
  value: number | string;
  maximum: number;
  entity: string | null;
  location: SourcePosition;
  /** Short phrase naming where the measured value comes from. */
  detail?: string;
}

export interface FileResult {
  kind: 'analyzed';
  /** Path relative to the working directory, always with forward slashes. */
  path: string;
  metrics: FileMetrics;
  diagnostics: Diagnostic[];
}

export interface FileFailure {
  kind: 'failed';
  path: string;
  message: string;
  location: SourcePosition | null;
}

export type FileOutcome = FileResult | FileFailure;

export interface RunSummary {
  analyzedFiles: number;
  failedFiles: number;
  errors: number;
  warnings: number;
}

export interface RuleOptions {
  max: number;
}

export interface ResolvedRule {
  severity: Severity;
  options: RuleOptions;
}

/** Rule configuration after defaults and overrides have been applied for one file. */
export type ResolvedRules = ReadonlyMap<RuleId, ResolvedRule>;
