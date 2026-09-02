import fs from 'node:fs/promises';
import path from 'node:path';
import { analyzeFile } from '../../analysis/analyze-file.ts';
import { type LoadedConfig, resolveRulesForFile } from '../../config/load-config.ts';
import { listChangedFiles } from '../../files/changed-files.ts';
import { discoverFiles } from '../../files/discover-files.ts';
import { toPosixPath } from '../../files/glob.ts';
import { formatJson } from '../../formatters/json.ts';
import { formatStylish } from '../../formatters/stylish.ts';
import { ParseFailure, parseSource } from '../../parser/parse-file.ts';
import { compareStrings, runRules } from '../../rules/registry.ts';
import type { FileOutcome, RunSummary } from '../../types.ts';
import type { CliArguments } from '../args.ts';
import { type CliContext, EXIT_FAILURE, EXIT_OK, EXIT_PROBLEMS, writeLine } from '../context.ts';

/** Analyzes one file from disk into an outcome; never throws for per-file problems. */
export async function analyzePath(absolutePath: string, loaded: LoadedConfig, cwd: string): Promise<FileOutcome> {
  const displayPath = toPosixPath(path.relative(cwd, absolutePath)) || path.basename(absolutePath);
  let code: string;
  try {
    code = await fs.readFile(absolutePath, 'utf8');
  } catch (error) {
    return { kind: 'failed', path: displayPath, message: `Cannot read file: ${describe(error)}`, location: null };
  }
  try {
    const metrics = analyzeFile(parseSource(code, absolutePath));
    const diagnostics = runRules(metrics, resolveRulesForFile(loaded, absolutePath));
    return { kind: 'analyzed', path: displayPath, metrics, diagnostics };
  } catch (error) {
    return failureOutcome(displayPath, error);
  }
}

function failureOutcome(displayPath: string, error: unknown): FileOutcome {
  if (error instanceof ParseFailure) {
    const location = error.line === null ? null : { line: error.line, column: error.column ?? 1 };
    return { kind: 'failed', path: displayPath, message: `Parse error: ${error.message}`, location };
  }
  return { kind: 'failed', path: displayPath, message: `Internal error: ${describe(error)}`, location: null };
}

export function summarize(outcomes: readonly FileOutcome[]): RunSummary {
  const summary: RunSummary = { analyzedFiles: 0, failedFiles: 0, errors: 0, warnings: 0 };
  for (const outcome of outcomes) {
    if (outcome.kind === 'failed') {
      summary.failedFiles++;
      continue;
    }
    summary.analyzedFiles++;
    for (const diagnostic of outcome.diagnostics) {
      if (diagnostic.severity === 'error') {
        summary.errors++;
      } else {
        summary.warnings++;
      }
    }
  }
  return summary;
}

export async function runAnalyze(args: CliArguments, loaded: LoadedConfig, context: CliContext): Promise<number> {
  const discovered = await discoverFiles({
    cwd: context.cwd,
    baseDir: loaded.baseDir,
    include: loaded.config.include,
    exclude: loaded.exclude,
    positional: args.positionals,
  });
  if (discovered.missing.length > 0) {
    for (const missing of discovered.missing) {
      writeLine(context.stderr, `qualint: path not found: ${missing}`);
    }
    return EXIT_FAILURE;
  }

  if (context.verbose) {
    const source =
      loaded.configPath === null ? 'built-in defaults (no .qualintrc.yaml found)' : toPosixPath(path.relative(context.cwd, loaded.configPath));
    writeLine(context.stderr, `qualint: configuration: ${source}`);
  }
  const files = args.changed ? await onlyChanged(discovered.files, args, context) : discovered.files;
  if (args.changed && files.length === 0) {
    if (args.format === 'json') {
      context.stdout.write(formatJson([], summarize([]), { includeFunctions: false }));
    } else {
      writeLine(context.stdout, '✔ no changed files to analyze');
    }
    return EXIT_OK;
  }
  const outcomes: FileOutcome[] = [];
  for (const file of files) {
    outcomes.push(await analyzePath(file, loaded, context.cwd));
  }
  outcomes.sort((a, b) => compareStrings(a.path, b.path));
  const summary = summarize(outcomes);
  writeReport(outcomes, summary, args, context);
  return exitCodeFor(summary, args, context);
}

/** Keeps only the discovered files that git reports as changed. Throws GitError outside a repository. */
async function onlyChanged(files: readonly string[], args: CliArguments, context: CliContext): Promise<string[]> {
  const changed = await listChangedFiles({ cwd: context.cwd, since: args.since });
  // git reports resolved paths; the working directory may be reached through a symlink.
  const resolved = await Promise.all(files.map((file) => fs.realpath(file).catch(() => file)));
  const kept = files.filter((_file, index) => changed.has(resolved[index]!));
  if (context.verbose) {
    const scope = args.since === undefined ? 'in the working tree' : `since ${args.since}`;
    writeLine(context.stderr, `qualint: ${kept.length} of ${files.length} files changed ${scope}`);
  }
  return kept;
}

function writeReport(outcomes: readonly FileOutcome[], summary: RunSummary, args: CliArguments, context: CliContext): void {
  if (args.format === 'json') {
    context.stdout.write(formatJson(outcomes, summary, { includeFunctions: false }));
    return;
  }
  context.stdout.write(formatStylish(outcomes, summary, { color: context.color, verbose: context.verbose }));
}

function exitCodeFor(summary: RunSummary, args: CliArguments, context: CliContext): number {
  if (summary.failedFiles > 0) {
    return EXIT_FAILURE;
  }
  if (summary.errors > 0) {
    return EXIT_PROBLEMS;
  }
  const tooManyWarnings = args.maxWarnings !== null && summary.warnings > args.maxWarnings;
  if (!tooManyWarnings) {
    return EXIT_OK;
  }
  if (args.format !== 'json') {
    writeLine(context.stderr, `qualint: ${summary.warnings} warnings exceed --max-warnings ${args.maxWarnings}`);
  }
  return EXIT_PROBLEMS;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
