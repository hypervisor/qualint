import type { FunctionMetrics } from '../types.ts';
import type { DiagnosticDraft } from './registry.ts';

/** Most a detail line names before it stops being quicker to read than the code. */
const DETAIL_LIMIT = 4;

/** Builds the standard function-scoped diagnostic: entity, measured value, maximum, declaration location. */
export function functionDiagnostic(
  fn: FunctionMetrics,
  message: string,
  value: number | string,
  maximum: number,
  detail?: string | undefined,
): DiagnosticDraft {
  return { message, value, maximum, entity: fn.name, location: fn.location.start, ...(detail === undefined ? {} : { detail }) };
}

/**
 * Names the decision points behind a cyclomatic or NPath score, most frequent
 * first, so a reader knows what to collapse without running `inspect`.
 */
export function describeDecisions(fn: FunctionMetrics): string | undefined {
  if (fn.decisions.length === 0) {
    return undefined;
  }
  const named = fn.decisions.slice(0, DETAIL_LIMIT).map((d) => `${d.count} ${d.kind}`);
  const rest = fn.decisions.length - named.length;
  return `decisions: ${named.join(', ')}${rest > 0 ? `, and ${rest} more kind${rest === 1 ? '' : 's'}` : ''}`;
}

/** Names the constructs that cost the most cognitive complexity, largest first. */
export function describeCognitive(fn: FunctionMetrics): string | undefined {
  const ranked = [...fn.cognitiveContributions].sort((a, b) => b.base + b.nesting - (a.base + a.nesting));
  if (ranked.length === 0) {
    return undefined;
  }
  const named = ranked
    .slice(0, DETAIL_LIMIT - 1)
    .map((c) => `${c.location.line}:${c.location.column} ${c.construct} +${c.base + c.nesting}`);
  return `costliest: ${named.join(', ')}`;
}

/** Renders the construct chain down to a function's deepest point. */
export function describeNesting(fn: FunctionMetrics): string | undefined {
  if (fn.maximumNestingPath.length === 0) {
    return undefined;
  }
  const steps = fn.maximumNestingPath.map((step) => `${step.location.line}:${step.location.column} ${step.construct}`);
  return `path: ${steps.join(' > ')}`;
}

/** Renders NPath for humans: exact below 10^15, scientific notation above. */
export function formatBig(value: bigint): string {
  if (value < 1_000_000_000_000_000n) {
    return value.toString();
  }
  return Number(value).toExponential(3);
}
