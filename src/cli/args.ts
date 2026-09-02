import { parseArgs } from 'node:util';
import { DEFAULT_PRESET, isPresetName, PRESET_NAMES, type PresetName } from '../config/presets.ts';

export type OutputFormat = 'stylish' | 'json';
export type Command = 'analyze' | 'inspect' | 'explain' | 'init';

export interface CliArguments {
  command: Command;
  positionals: string[];
  format: OutputFormat;
  configPath: string | undefined;
  maxWarnings: number | null;
  color: boolean | undefined;
  verbose: boolean;
  /** Analyze only files changed in git. */
  changed: boolean;
  /** Ref whose merge-base with HEAD bounds the change set; implies `changed`. */
  since: string | undefined;
  /** init only: preset to write. */
  preset: PresetName;
  /** init only: overwrite an existing configuration file. */
  force: boolean;
  help: boolean;
  version: boolean;
}

export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UsageError';
  }
}

export const USAGE = `Usage: qualint [paths...] [options]
       qualint inspect <file> [options]
       qualint explain [rule]
       qualint init [--preset strict|standard|relaxed] [--force]

Analyzes JavaScript and TypeScript source files for structural quality problems:
complexity, nesting, condition density and size. Only problems are printed; a
single line confirms a clean run. Exit code 1 means rule errors were reported;
exit code 2 means analysis could not complete.

Options:
  --format <stylish|json>   Output format (default: stylish)
  --config <path>           Configuration file (default: nearest .qualintrc.json)
  --max-warnings <n>        Fail when more than n warnings are reported
  --changed                 Only files changed in the working tree (staged, unstaged, untracked)
  --since <ref>             Only files changed since the merge-base with <ref>, e.g. origin/main
  --verbose                 Also list clean files and the configuration in use
  --preset <name>           Preset for init (default: standard)
  --force                   Let init overwrite an existing configuration file
  --color / --no-color      Force ANSI colors on or off
  -h, --help                Show this help
  -v, --version             Show the version
`;

export function parseCliArguments(argv: readonly string[]): CliArguments {
  let parsed;
  try {
    parsed = parseArgs({
      args: [...argv],
      allowPositionals: true,
      allowNegative: true,
      strict: true,
      options: {
        format: { type: 'string' },
        config: { type: 'string' },
        'max-warnings': { type: 'string' },
        color: { type: 'boolean' },
        verbose: { type: 'boolean' },
        changed: { type: 'boolean' },
        since: { type: 'string' },
        preset: { type: 'string' },
        force: { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
      },
    });
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : String(error));
  }

  const values = parsed.values;
  const positionals = [...parsed.positionals];
  let command: Command = 'analyze';
  if (positionals[0] === 'inspect' || positionals[0] === 'explain' || positionals[0] === 'init') {
    command = positionals.shift() as Command;
  }

  return {
    command,
    positionals,
    format: parseFormat(values.format),
    configPath: values.config,
    maxWarnings: parseMaxWarnings(values['max-warnings']),
    color: values.color,
    verbose: values.verbose ?? false,
    changed: (values.changed ?? false) || values.since !== undefined,
    since: values.since,
    preset: parsePreset(values.preset),
    force: values.force ?? false,
    help: values.help ?? false,
    version: values.version ?? false,
  };
}

function parseFormat(value: string | undefined): OutputFormat {
  const format = value ?? 'stylish';
  if (format !== 'stylish' && format !== 'json') {
    throw new UsageError(`Unknown format "${format}"; expected "stylish" or "json"`);
  }
  return format;
}

function parsePreset(value: string | undefined): PresetName {
  if (value === undefined) {
    return DEFAULT_PRESET;
  }
  if (!isPresetName(value)) {
    throw new UsageError(`Unknown preset "${value}"; expected one of ${PRESET_NAMES.join(', ')}`);
  }
  return value;
}

function parseMaxWarnings(value: string | undefined): number | null {
  if (value === undefined) {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new UsageError(`--max-warnings expects a non-negative integer, got "${value}"`);
  }
  return parsed;
}
