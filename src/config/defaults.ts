import type { ResolvedRule, RuleId } from '../types.ts';
import { RULES } from '../rules/registry.ts';
import { type PresetName, presetMax } from './presets.ts';

/** Searched in this order within each directory; YAML is canonical, JSON still works. */
export const CONFIG_FILE_NAMES: readonly string[] = ['.qualintrc.yaml', '.qualintrc.yml', '.qualintrc.json'];

/**
 * Default exclusions. `node_modules` and hidden directories are additionally
 * never traversed regardless of configuration.
 */
export const DEFAULT_EXCLUDE: readonly string[] = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/coverage/**',
  '**/.*/**',
  '**/*.generated.*',
  '**/*.d.ts',
  '**/*.d.mts',
  '**/*.d.cts',
];

export type RuleSetting = ResolvedRule | 'off';

export function defaultRuleSettings(preset: PresetName): Map<RuleId, RuleSetting> {
  const settings = new Map<RuleId, RuleSetting>();
  for (const rule of RULES.values()) {
    settings.set(
      rule.id,
      rule.defaultSeverity === 'off' ? 'off' : { severity: rule.defaultSeverity, options: { max: presetMax(rule.id, preset) } },
    );
  }
  return settings;
}
