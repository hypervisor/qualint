import path from 'node:path';
import { type LoadedConfig, resolveRulesForFile } from '../../config/load-config.ts';
import { formatInspect } from '../../formatters/inspect-text.ts';
import { formatJson } from '../../formatters/json.ts';
import type { FileOutcome } from '../../types.ts';
import type { CliArguments } from '../args.ts';
import { type CliContext, EXIT_FAILURE, EXIT_OK, writeLine } from '../context.ts';
import { analyzePath, summarize } from './analyze.ts';

/** Prints every calculated metric for the given files, ignoring severities. */
export async function runInspect(args: CliArguments, loaded: LoadedConfig, context: CliContext): Promise<number> {
  if (args.positionals.length === 0) {
    writeLine(context.stderr, 'qualint inspect: expected at least one file path');
    return EXIT_FAILURE;
  }
  const outcomes: FileOutcome[] = [];
  for (const argument of args.positionals) {
    outcomes.push(await analyzePath(path.resolve(context.cwd, argument), loaded, context.cwd));
  }

  if (args.format === 'json') {
    context.stdout.write(formatJson(outcomes, summarize(outcomes), { includeFunctions: true }));
  } else {
    outcomes.forEach((outcome, index) => {
      if (index > 0) {
        context.stdout.write('\n');
      }
      if (outcome.kind === 'failed') {
        writeLine(context.stdout, `${outcome.path}\n  ${outcome.message}`);
        return;
      }
      const rules = resolveRulesForFile(loaded, path.resolve(context.cwd, args.positionals[index]!));
      context.stdout.write(formatInspect(outcome.path, outcome.metrics, rules));
    });
  }
  return outcomes.some((outcome) => outcome.kind === 'failed') ? EXIT_FAILURE : EXIT_OK;
}
