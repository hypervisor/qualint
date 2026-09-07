import type { ResolvedRule, RuleId } from '../types.ts';
import { RULES } from '../rules/registry.ts';
import { DUPLICATE_MIN_SIZE, type PresetName, presetMax } from './presets.ts';

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
  '**/out/**',
  '**/coverage/**',
  '**/vendor/**',
  '**/.*/**',
  '**/*.generated.*',
  '**/*.min.*',
  '**/*.bundle.*',
  '**/*.d.ts',
  '**/*.d.mts',
  '**/*.d.cts',
];

export type RuleSetting = ResolvedRule | 'off';

/** Threshold plus any rule-specific extras the preset controls. */
export function presetOptions(id: RuleId, preset: PresetName): { max: number; minSize?: number } {
  const max = presetMax(id, preset);
  return id === 'duplicate/function' ? { max, minSize: DUPLICATE_MIN_SIZE[preset] } : { max };
}

export function defaultRuleSettings(preset: PresetName): Map<RuleId, RuleSetting> {
  const settings = new Map<RuleId, RuleSetting>();
  for (const rule of RULES.values()) {
    settings.set(
      rule.id,
      rule.defaultSeverity === 'off'
        ? 'off'
        : { severity: rule.defaultSeverity, options: presetOptions(rule.id, preset) },
    );
  }
  return settings;
}
