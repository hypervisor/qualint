import fs from 'node:fs/promises';
import path from 'node:path';
import { CONFIG_FILE_NAMES } from '../../config/defaults.ts';
import { type PresetName, presetMax } from '../../config/presets.ts';
import { RULES } from '../../rules/registry.ts';
import type { CliArguments } from '../args.ts';
import { type CliContext, EXIT_FAILURE, EXIT_OK, writeLine } from '../context.ts';

const TARGET = '.qualintrc.yaml';

/** Writes a commented starter configuration for the chosen preset into the working directory. */
export async function runInit(args: CliArguments, context: CliContext): Promise<number> {
  const existing = await existingConfig(context.cwd);
  if (existing !== null && !args.force) {
    writeLine(context.stderr, `qualint init: ${existing} already exists; pass --force to overwrite it`);
    return EXIT_FAILURE;
  }
  const target = path.join(context.cwd, TARGET);
  await fs.writeFile(target, renderConfig(args.preset));
  writeLine(context.stdout, `✔ wrote ${TARGET} (${args.preset} preset)`);
  return EXIT_OK;
}

async function existingConfig(cwd: string): Promise<string | null> {
  for (const name of CONFIG_FILE_NAMES) {
    try {
      await fs.access(path.join(cwd, name));
      return name;
    } catch {
      // not there, keep looking
    }
  }
  return null;
}

export function renderConfig(preset: PresetName): string {
  const ruleLines = [...RULES.values()].map((rule) => {
    const value = rule.defaultSeverity === 'off' ? 'off' : `[${rule.defaultSeverity}, { max: ${presetMax(rule.id, preset)} }]`;
    return `#   ${rule.id}: ${value}`;
  });
  return `# qualint configuration. \`qualint explain <rule>\` shows how each rule is scored.
# Presets: strict | standard | relaxed (see README for the numbers).
preset: ${preset}

# Files to analyze, relative to this file. Without this, everything below it.
# include:
#   - src/**/*

# Skipped when exclude is omitted: node_modules, dist, build, coverage, hidden
# directories, *.generated.* and *.d.ts. Setting exclude replaces that list.
# exclude:
#   - '**/legacy/**'

# Per-rule limits. These are the values the ${preset} preset gives you;
# uncomment a line to change it. A rule can also be set to warn or off.
# rules:
${ruleLines.join('\n')}

# Different limits for some files. Later entries win.
overrides:
  - files: ['**/*.test.*', '**/*.spec.*']
    rules:
      size/function: off
      size/file: off
`;
}
