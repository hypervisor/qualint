import type { RuleId, Severity } from '../types.ts';
import { RULES, isRuleId } from '../rules/registry.ts';
import { type RuleSetting } from './defaults.ts';
import { DEFAULT_PRESET, isPresetName, PRESET_NAMES, type PresetName, presetMax } from './presets.ts';

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export interface ConfigOverride {
  files: string[];
  rules: Map<RuleId, RuleSetting>;
}

export interface QualintConfig {
  /** Threshold preset that rule values without an explicit max fall back to. */
  preset: PresetName;
  /** null means "every supported file below the base directory". */
  include: string[] | null;
  /** null means "use the default exclusions". */
  exclude: string[] | null;
  rules: Map<RuleId, RuleSetting>;
  overrides: ConfigOverride[];
}

const TOP_LEVEL_KEYS: ReadonlySet<string> = new Set(['preset', 'include', 'exclude', 'rules', 'overrides']);
const OVERRIDE_KEYS: ReadonlySet<string> = new Set(['files', 'rules']);
const SEVERITIES: ReadonlySet<string> = new Set(['off', 'warn', 'error']);

/**
 * Validates raw JSON into a config. Every error names the offending property so
 * a misconfiguration is fixable from the message alone.
 */
export function validateConfig(raw: unknown): QualintConfig {
  const root = expectObject(raw, 'configuration');
  for (const key of Object.keys(root)) {
    if (!TOP_LEVEL_KEYS.has(key)) {
      throw new ConfigError(`Unknown property "${key}"; expected one of preset, include, exclude, rules, overrides`);
    }
  }
  const preset = validatePreset(root['preset']);
  const overridesRaw = root['overrides'];
  const overrides: ConfigOverride[] = [];
  if (overridesRaw !== undefined) {
    if (!Array.isArray(overridesRaw)) {
      throw new ConfigError('"overrides" must be an array');
    }
    overridesRaw.forEach((entry, index) => {
      const path = `overrides[${index}]`;
      const record = expectObject(entry, path);
      for (const key of Object.keys(record)) {
        if (!OVERRIDE_KEYS.has(key)) {
          throw new ConfigError(`Unknown property "${path}.${key}"; expected files or rules`);
        }
      }
      const files = expectStringArray(record['files'], `${path}.files`);
      if (files === null || files.length === 0) {
        throw new ConfigError(`"${path}.files" must be a non-empty array of glob patterns`);
      }
      overrides.push({ files, rules: validateRules(record['rules'], `${path}.rules`, preset) });
    });
  }
  return {
    preset,
    include: expectStringArray(root['include'], 'include'),
    exclude: expectStringArray(root['exclude'], 'exclude'),
    rules: validateRules(root['rules'], 'rules', preset),
    overrides,
  };
}

function validatePreset(raw: unknown): PresetName {
  if (raw === undefined) {
    return DEFAULT_PRESET;
  }
  if (typeof raw !== 'string' || !isPresetName(raw)) {
    throw new ConfigError(`"preset" must be one of ${PRESET_NAMES.join(', ')}; got ${JSON.stringify(raw)}`);
  }
  return raw;
}

function validateRules(raw: unknown, path: string, preset: PresetName): Map<RuleId, RuleSetting> {
  const settings = new Map<RuleId, RuleSetting>();
  if (raw === undefined) {
    return settings;
  }
  const record = expectObject(raw, path);
  for (const [id, value] of Object.entries(record)) {
    if (!isRuleId(id)) {
      throw new ConfigError(`Unknown rule "${id}" in "${path}"; known rules: ${[...RULES.keys()].join(', ')}`);
    }
    settings.set(id, validateRuleValue(id, value, `${path}["${id}"]`, preset));
  }
  return settings;
}

function validateRuleValue(id: RuleId, value: unknown, path: string, preset: PresetName): RuleSetting {
  const rule = RULES.get(id)!;
  let severity: unknown;
  let options: unknown;
  if (Array.isArray(value)) {
    if (value.length < 1 || value.length > 2) {
      throw new ConfigError(`"${path}" must be [severity] or [severity, { "max": n }]`);
    }
    severity = value[0];
    options = value[1];
  } else {
    severity = value;
  }
  if (typeof severity !== 'string' || !SEVERITIES.has(severity)) {
    throw new ConfigError(`"${path}" has invalid severity ${JSON.stringify(severity)}; expected "off", "warn" or "error"`);
  }
  if (severity === 'off') {
    return 'off';
  }
  let max = presetMax(id, preset);
  if (options !== undefined) {
    const record = expectObject(options, path);
    for (const key of Object.keys(record)) {
      if (key !== 'max') {
        throw new ConfigError(`Unknown option "${key}" in "${path}"; the only option is "max"`);
      }
    }
    const rawMax = record['max'];
    if (rawMax !== undefined) {
      if (typeof rawMax !== 'number' || !Number.isFinite(rawMax) || rawMax < 0) {
        throw new ConfigError(`"${path}".max must be a non-negative number`);
      }
      if (!rule.fractional && !Number.isInteger(rawMax)) {
        throw new ConfigError(`"${path}".max must be an integer`);
      }
      max = rawMax;
    }
  }
  return { severity: severity as Severity, options: { max } };
}

function expectObject(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ConfigError(`"${path}" must be an object`);
  }
  return value as Record<string, unknown>;
}

function expectStringArray(value: unknown, path: string): string[] | null {
  if (value === undefined) {
    return null;
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new ConfigError(`"${path}" must be an array of strings`);
  }
  return value as string[];
}
