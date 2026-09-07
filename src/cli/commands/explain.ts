import { DUPLICATE_MIN_SIZE, PRESETS } from '../../config/presets.ts';
import { RULES, isRuleId } from '../../rules/registry.ts';
import type { RuleId } from '../../types.ts';
import type { CliArguments } from '../args.ts';
import { type CliContext, EXIT_FAILURE, EXIT_OK, writeLine } from '../context.ts';

/** Prints a rule's definition and calculation, or lists all rules. */
/**
 * Names the threshold each preset sets. For most rules that is `max`; for
 * duplicate/function every preset allows one copy and the preset moves
 * `minSize` instead, so quote the number that actually differs.
 */
function presetsLine(ruleId: RuleId): string {
  if (ruleId === 'duplicate/function') {
    const { strict, standard, relaxed } = DUPLICATE_MIN_SIZE;
    return `Presets (minSize): strict ${strict}, standard ${standard}, relaxed ${relaxed}`;
  }
  const presets = PRESETS[ruleId];
  return `Presets (max): strict ${presets.strict}, standard ${presets.standard}, relaxed ${presets.relaxed}`;
}

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
  const presetLine = presetsLine(ruleId);
  writeLine(context.stdout, `${rule.id}\n\n${rule.summary}\n\nScope: ${rule.scope}\nDefault: ${defaults}\n${presetLine}\n\n${rule.explanation}`);
  return EXIT_OK;
}
