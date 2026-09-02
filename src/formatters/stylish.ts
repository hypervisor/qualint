import type { Diagnostic, FileOutcome, RunSummary } from '../types.ts';

export interface StylishOptions {
  color: boolean;
  /** List clean files as well. Normal mode prints problems only, to keep output short. */
  verbose: boolean;
}

interface Row {
  position: string;
  severity: string;
  message: string;
  rule: string;
  isError: boolean;
}

type Painter = ReturnType<typeof painter>;

/**
 * ESLint-style human-readable output. Files without problems are omitted
 * unless verbose. Rows within a file are column-aligned; the trailing summary
 * counts problems and failed files, or confirms a clean run.
 */
export function formatStylish(outcomes: readonly FileOutcome[], summary: RunSummary, options: StylishOptions): string {
  const paint = painter(options.color);
  const blocks: string[] = [];
  const cleanFiles: string[] = [];

  for (const outcome of outcomes) {
    const rows = rowsOf(outcome);
    if (rows.length > 0) {
      blocks.push(formatFile(outcome.path, rows, paint));
    } else if (options.verbose) {
      cleanFiles.push(`${paint.green('✔')} ${outcome.path}`);
    }
  }
  if (cleanFiles.length > 0) {
    blocks.push(`${cleanFiles.join('\n')}\n`);
  }
  const separator = blocks.length > 0 ? '\n' : '';
  return `${blocks.join('\n')}${separator}${formatSummary(summary, paint)}\n`;
}

function rowsOf(outcome: FileOutcome): Row[] {
  if (outcome.kind === 'failed') {
    return [failureRow(outcome.message, outcome.location)];
  }
  return outcome.diagnostics.map(diagnosticRow);
}

function formatFile(filePath: string, rows: readonly Row[], paint: Painter): string {
  const positionWidth = Math.max(...rows.map((row) => row.position.length));
  const severityWidth = Math.max(...rows.map((row) => row.severity.length));
  const messageWidth = Math.max(...rows.map((row) => row.message.length));
  const lines = rows.map((row) => {
    const severity = row.severity.padEnd(severityWidth);
    const painted = row.isError ? paint.red(severity) : paint.yellow(severity);
    return `  ${paint.dim(row.position.padEnd(positionWidth))}  ${painted}  ${row.message.padEnd(messageWidth)}  ${paint.dim(row.rule)}`;
  });
  return `${paint.underline(filePath)}\n\n${lines.join('\n')}\n`;
}

function formatSummary(summary: RunSummary, paint: Painter): string {
  const problems = summary.errors + summary.warnings;
  const lines: string[] = [];
  if (problems > 0) {
    const text = `✖ ${plural(problems, 'problem')} (${plural(summary.errors, 'error')}, ${plural(summary.warnings, 'warning')})`;
    lines.push(summary.errors > 0 ? paint.red(text) : paint.yellow(text));
  }
  if (summary.failedFiles > 0) {
    lines.push(paint.red(`✖ ${plural(summary.failedFiles, 'file')} could not be analyzed`));
  }
  if (lines.length === 0) {
    lines.push(paint.green(`✔ ${plural(summary.analyzedFiles, 'file')} analyzed, no problems`));
  }
  return lines.join('\n');
}

function diagnosticRow(diagnostic: Diagnostic): Row {
  return {
    position: `${diagnostic.location.line}:${diagnostic.location.column}`,
    severity: diagnostic.severity === 'error' ? 'error' : 'warning',
    message: diagnostic.message,
    rule: diagnostic.rule,
    isError: diagnostic.severity === 'error',
  };
}

function failureRow(message: string, location: { line: number; column: number } | null): Row {
  return {
    position: location === null ? '0:0' : `${location.line}:${location.column}`,
    severity: 'error',
    message,
    rule: 'parse',
    isError: true,
  };
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function painter(enabled: boolean) {
  const escape = String.fromCharCode(27);
  const wrap = (open: string, close: string) => (text: string) =>
    enabled ? `${escape}[${open}m${text}${escape}[${close}m` : text;
  return {
    red: wrap('31', '39'),
    yellow: wrap('33', '39'),
    green: wrap('32', '39'),
    dim: wrap('2', '22'),
    underline: wrap('4', '24'),
  };
}
