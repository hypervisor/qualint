import { createRequire } from 'node:module';
import type { Writable } from 'node:stream';
import { type LoadedConfig, loadConfig } from '../config/load-config.ts';
import { ConfigError } from '../config/schema.ts';
import { GitError } from '../files/changed-files.ts';
import { type CliArguments, parseCliArguments, USAGE, UsageError } from './args.ts';
import { runAnalyze } from './commands/analyze.ts';
import { runExplain } from './commands/explain.ts';
import { runInit } from './commands/init.ts';
import { runInspect } from './commands/inspect.ts';
import { type CliContext, EXIT_FAILURE, EXIT_OK, writeLine } from './context.ts';

export interface RunOptions {
  cwd?: string;
  stdout?: Writable;
  stderr?: Writable;
  env?: NodeJS.ProcessEnv;
}

/** Runs the CLI and resolves to the exit code. Never throws for expected failures. */
export async function run(argv: readonly string[], options: RunOptions = {}): Promise<number> {
  const { stdout, stderr, env, cwd } = withProcessDefaults(options);
  const args = parseOrReport(argv, stderr);
  if (args === null) {
    return EXIT_FAILURE;
  }
  if (args.help) {
    stdout.write(USAGE);
    return EXIT_OK;
  }
  if (args.version) {
    writeLine(stdout, readVersion());
    return EXIT_OK;
  }
  const context: CliContext = { cwd, stdout, stderr, color: args.color ?? colorEnabled(env, stdout), verbose: args.verbose };
  return dispatch(args, context);
}

function withProcessDefaults(options: RunOptions): Required<RunOptions> {
  return {
    stdout: options.stdout ?? process.stdout,
    stderr: options.stderr ?? process.stderr,
    env: options.env ?? process.env,
    cwd: options.cwd ?? process.cwd(),
  };
}

async function dispatch(args: CliArguments, context: CliContext): Promise<number> {
  if (args.command === 'explain') {
    return runExplain(args, context);
  }
  if (args.command === 'init') {
    return runInit(args, context);
  }
  const loaded = await loadOrReport(args, context);
  if (loaded === null) {
    return EXIT_FAILURE;
  }
  try {
    if (args.command === 'inspect') {
      return await runInspect(args, loaded, context);
    }
    return await runAnalyze(args, loaded, context);
  } catch (error) {
    if (error instanceof GitError) {
      writeLine(context.stderr, `qualint: ${error.message}`);
      return EXIT_FAILURE;
    }
    const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
    writeLine(context.stderr, `qualint: internal error: ${detail}`);
    return EXIT_FAILURE;
  }
}

function parseOrReport(argv: readonly string[], stderr: Writable): CliArguments | null {
  try {
    return parseCliArguments(argv);
  } catch (error) {
    if (error instanceof UsageError) {
      writeLine(stderr, `qualint: ${error.message}\n\n${USAGE}`);
      return null;
    }
    throw error;
  }
}

async function loadOrReport(args: CliArguments, context: CliContext): Promise<LoadedConfig | null> {
  try {
    return await loadConfig({ cwd: context.cwd, explicitPath: args.configPath });
  } catch (error) {
    if (error instanceof ConfigError) {
      writeLine(context.stderr, `qualint: configuration error: ${error.message}`);
      return null;
    }
    throw error;
  }
}

function colorEnabled(env: NodeJS.ProcessEnv, stdout: Writable): boolean {
  if (env['NO_COLOR'] !== undefined || env['FORCE_COLOR'] === '0') {
    return false;
  }
  return (stdout as { isTTY?: boolean }).isTTY === true;
}

function readVersion(): string {
  const require = createRequire(import.meta.url);
  const pkg = require('../../package.json') as { version: string };
  return pkg.version;
}
