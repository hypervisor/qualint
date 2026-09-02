import type { FileMetrics, FileOutcome, FunctionMetrics, RunSummary } from '../types.ts';

export const JSON_SCHEMA_VERSION = 1;

export interface JsonOptions {
  /** Include per-function metrics (used by `inspect`). */
  includeFunctions: boolean;
}

/**
 * Machine-readable output. One document, no extra text. NPath values are
 * decimal strings because they may exceed the safe integer range.
 */
export function formatJson(outcomes: readonly FileOutcome[], summary: RunSummary, options: JsonOptions): string {
  const files = outcomes.map((outcome) => {
    if (outcome.kind === 'failed') {
      return { path: outcome.path, error: { message: outcome.message, location: outcome.location }, diagnostics: [] };
    }
    return {
      path: outcome.path,
      metrics: fileMetricsJson(outcome.metrics, options.includeFunctions),
      diagnostics: outcome.diagnostics,
    };
  });
  return `${JSON.stringify({ version: JSON_SCHEMA_VERSION, files, summary }, null, 2)}\n`;
}

export function fileMetricsJson(metrics: FileMetrics, includeFunctions: boolean): Record<string, unknown> {
  const base: Record<string, unknown> = {
    physicalLines: metrics.physicalLines,
    sourceLines: metrics.sourceLines,
    blankLines: metrics.blankLines,
    commentOnlyLines: metrics.commentOnlyLines,
  };
  if (includeFunctions) {
    base['functions'] = metrics.functions.map(functionMetricsJson);
    base['moduleConditions'] = metrics.moduleConditions;
  }
  return base;
}

export function functionMetricsJson(fn: FunctionMetrics): Record<string, unknown> {
  return {
    name: fn.name,
    location: fn.location,
    sourceLines: fn.sourceLines,
    statementCount: fn.statementCount,
    parameterCount: fn.parameterCount,
    cyclomaticComplexity: fn.cyclomaticComplexity,
    cognitiveComplexity: fn.cognitiveComplexity,
    npathComplexity: fn.npathComplexity.toString(),
    maximumNestingDepth: fn.maximumNestingDepth,
    maximumNestingLocation: fn.maximumNestingLocation,
    maximumConditionComplexity: fn.maximumConditionComplexity,
    halstead: fn.halstead,
    cognitiveContributions: fn.cognitiveContributions,
    conditions: fn.conditions,
  };
}
