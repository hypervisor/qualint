import type { FileMetrics, FunctionMetrics, ResolvedRules, RuleId } from '../types.ts';
import { formatBig } from '../rules/shared.ts';

/**
 * Human-readable `inspect` report: file line counts, then every function with
 * every metric, the configured limit for each, and the cognitive ledger.
 */
export function formatInspect(filePath: string, metrics: FileMetrics, rules: ResolvedRules): string {
  const out: string[] = [];
  out.push(filePath);
  out.push(
    table([
      ['physical lines', String(metrics.physicalLines), ''],
      ['source lines', String(metrics.sourceLines), limitText(rules, 'size/file')],
      ['blank lines', String(metrics.blankLines), ''],
      ['comment-only lines', String(metrics.commentOnlyLines), ''],
    ]),
  );
  for (const group of metrics.moduleConditions) {
    if (group.complexity > 1) {
      out.push(`  condition at ${group.location.line}:${group.location.column}: complexity ${group.complexity}`);
    }
  }
  for (const fn of metrics.functions) {
    out.push('');
    out.push(formatFunction(fn, rules));
  }
  return `${out.join('\n')}\n`;
}

function formatFunction(fn: FunctionMetrics, rules: ResolvedRules): string {
  const { start, end } = fn.location;
  const rows: string[][] = [
    ['source lines', String(fn.sourceLines), limitText(rules, 'size/function')],
    ['statements', String(fn.statementCount), limitText(rules, 'size/statements')],
    ['parameters', String(fn.parameterCount), limitText(rules, 'size/parameters')],
    ['cyclomatic complexity', String(fn.cyclomaticComplexity), limitText(rules, 'complexity/cyclomatic')],
    ['cognitive complexity', String(fn.cognitiveComplexity), limitText(rules, 'complexity/cognitive')],
    ['NPath complexity', formatBig(fn.npathComplexity), limitText(rules, 'complexity/npath')],
    ['maximum nesting', String(fn.maximumNestingDepth), limitText(rules, 'complexity/nesting')],
    ['maximum condition', String(fn.maximumConditionComplexity), limitText(rules, 'complexity/condition')],
    ['Halstead difficulty', fn.halstead.difficulty.toFixed(1), limitText(rules, 'complexity/halstead-difficulty')],
    ['Halstead volume', fn.halstead.volume.toFixed(1), ''],
    ['Halstead effort', fn.halstead.effort.toFixed(1), ''],
  ];
  const lines = [`${fn.name} (${start.line}:${start.column}–${end.line}:${end.column})`, table(rows)];
  if (fn.maximumNestingLocation !== null && fn.maximumNestingDepth > 0) {
    lines.push(`  deepest construct at ${fn.maximumNestingLocation.line}:${fn.maximumNestingLocation.column}`);
  }
  if (fn.cognitiveContributions.length > 0) {
    lines.push('  cognitive contributions');
    const contributionRows = fn.cognitiveContributions.map((c) => [
      `${c.location.line}:${c.location.column}`,
      c.construct,
      c.nesting > 0 ? `+${c.base} +${c.nesting} nesting` : `+${c.base}`,
      `= ${c.total}`,
    ]);
    lines.push(table(contributionRows, 4, false));
  }
  return lines.join('\n');
}

function limitText(rules: ResolvedRules, id: RuleId): string {
  const setting = rules.get(id);
  return setting === undefined ? 'off' : `max ${setting.options.max}`;
}

/** Left-aligns the first column, right-aligns the second unless `alignRight` is false, appends the rest left-aligned. */
function table(rows: string[][], indent = 2, alignRight = true): string {
  const widths: number[] = [];
  for (const row of rows) {
    row.forEach((cell, index) => {
      widths[index] = Math.max(widths[index] ?? 0, cell.length);
    });
  }
  const pad = ' '.repeat(indent);
  return rows
    .map((row) => {
      const [label = '', value = '', ...rest] = row;
      const parts = [
        label.padEnd(widths[0] ?? 0),
        alignRight ? value.padStart(widths[1] ?? 0) : value.padEnd(widths[1] ?? 0),
        ...rest.map((cell, i) => cell.padEnd(widths[i + 2] ?? 0)),
      ];
      return `${pad}${parts.join('  ').trimEnd()}`;
    })
    .join('\n');
}
