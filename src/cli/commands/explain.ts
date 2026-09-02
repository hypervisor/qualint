import { PRESETS } from '../../config/presets.ts';
import { RULES, isRuleId } from '../../rules/registry.ts';
import type { CliArguments } from '../args.ts';
import { type CliContext, EXIT_FAILURE, EXIT_OK, writeLine } from '../context.ts';

/** Prints a rule's definition and calculation, or lists all rules. */
export function runExplain(args: CliArguments, context: CliContext): number {
  const [ruleId] = args.positionals;
  if (ruleId === undefined) {
    const width = Math.max(...[...RULES.keys()].map((id) => id.length));
    for (const rule of RULES.values()) {
      const defaults = rule.defaultSeverity === 'off' ? `off (max ${rule.defaultMax} when enabled)` : `${rule.defaultSeverity}, max ${rule.defaultMax}`;
      writeLine(context.stdout, `${rule.id.padEnd(width)}  ${rule.summary}\n${' '.repeat(width)}  default: ${defaults}`);
    }
    return EXIT_OK;
  }
  if (!isRuleId(ruleId)) {
    writeLine(context.stderr, `qualint explain: unknown rule "${ruleId}"; known rules: ${[...RULES.keys()].join(', ')}`);
    return EXIT_FAILURE;
  }
  const rule = RULES.get(ruleId)!;
  const defaults = rule.defaultSeverity === 'off' ? `off; maximum ${rule.defaultMax} when enabled` : `${rule.defaultSeverity}, maximum ${rule.defaultMax}`;
  const presets = PRESETS[ruleId];
  const presetLine = `Presets: strict ${presets.strict}, standard ${presets.standard}, relaxed ${presets.relaxed}`;
  writeLine(context.stdout, `${rule.id}\n\n${rule.summary}\n\nScope: ${rule.scope}\nDefault: ${defaults}\n${presetLine}\n\n${rule.explanation}`);
  return EXIT_OK;
}
