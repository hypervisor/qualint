import type { FunctionMetrics } from '../types.ts';
import type { DiagnosticDraft } from './registry.ts';

/** Builds the standard function-scoped diagnostic: entity, measured value, maximum, declaration location. */
export function functionDiagnostic(fn: FunctionMetrics, message: string, value: number | string, maximum: number): DiagnosticDraft {
  return { message, value, maximum, entity: fn.name, location: fn.location.start };
}

/** Renders NPath for humans: exact below 10^15, scientific notation above. */
export function formatBig(value: bigint): string {
  if (value < 1_000_000_000_000_000n) {
    return value.toString();
  }
  return Number(value).toExponential(3);
}
