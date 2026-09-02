import fs from 'node:fs/promises';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { ResolvedRules, RuleId } from '../types.ts';
import { matchesAnyGlob, toPosixPath } from '../files/glob.ts';
import { CONFIG_FILE_NAMES, DEFAULT_EXCLUDE, defaultRuleSettings, type RuleSetting } from './defaults.ts';
import { ConfigError, type QualintConfig, validateConfig } from './schema.ts';

export interface LoadedConfig {
  config: QualintConfig;
  /** Absolute path of the configuration file, or null when defaults are in use. */
  configPath: string | null;
  /** Directory that include, exclude and override patterns are relative to. */
  baseDir: string;
  /** Effective exclusion patterns. */
  exclude: readonly string[];
}

export interface LoadConfigOptions {
  cwd: string;
  explicitPath?: string | undefined;
}

/**
 * Loads `.qualintrc.yaml` (or `.yml`, or `.json`) by searching upward from
 * `cwd`, or the explicit `--config` file. Without a file, built-in defaults
 * apply relative to `cwd`. JSON is a subset of YAML, so one parser covers both.
 */
export async function loadConfig(options: LoadConfigOptions): Promise<LoadedConfig> {
  const configPath = options.explicitPath !== undefined ? path.resolve(options.cwd, options.explicitPath) : await findConfigFile(options.cwd);
  if (configPath === null) {
    const config: QualintConfig = { include: null, exclude: null, rules: new Map(), overrides: [] };
    return { config, configPath: null, baseDir: options.cwd, exclude: DEFAULT_EXCLUDE };
  }

  let text: string;
  try {
    text = await fs.readFile(configPath, 'utf8');
  } catch (error) {
    throw new ConfigError(`Cannot read configuration file ${configPath}: ${describe(error)}`);
  }
  let raw: unknown;
  try {
    raw = parseYaml(text) ?? {};
  } catch (error) {
    throw new ConfigError(`Configuration file ${configPath} is not valid YAML: ${firstLine(describe(error))}`);
  }
  let config: QualintConfig;
  try {
    config = validateConfig(raw);
  } catch (error) {
    if (error instanceof ConfigError) {
      throw new ConfigError(`${configPath}: ${error.message}`);
    }
    throw error;
  }
  return {
    config,
    configPath,
    baseDir: path.dirname(configPath),
    exclude: config.exclude ?? DEFAULT_EXCLUDE,
  };
}

async function findConfigFile(startDir: string): Promise<string | null> {
  let current = path.resolve(startDir);
  for (;;) {
    for (const name of CONFIG_FILE_NAMES) {
      const candidate = path.join(current, name);
      if (await isFile(candidate)) {
        return candidate;
      }
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

/**
 * Resolves the rule set for one file: built-in defaults, then top-level rules,
 * then every matching override in order. Each layer replaces whole rule values.
 */
export function resolveRulesForFile(loaded: LoadedConfig, absolutePath: string): ResolvedRules {
  const settings = defaultRuleSettings();
  applyLayer(settings, loaded.config.rules);
  const relative = toPosixPath(path.relative(loaded.baseDir, absolutePath));
  for (const override of loaded.config.overrides) {
    if (matchesAnyGlob(override.files, relative)) {
      applyLayer(settings, override.rules);
    }
  }
  const resolved = new Map<RuleId, Exclude<RuleSetting, 'off'>>();
  for (const [id, setting] of settings) {
    if (setting !== 'off') {
      resolved.set(id, setting);
    }
  }
  return resolved;
}

function applyLayer(target: Map<RuleId, RuleSetting>, layer: ReadonlyMap<RuleId, RuleSetting>): void {
  for (const [id, setting] of layer) {
    target.set(id, setting);
  }
}

async function isFile(candidate: string): Promise<boolean> {
  try {
    return (await fs.stat(candidate)).isFile();
  } catch {
    return false;
  }
}

function firstLine(text: string): string {
  return text.split('\n')[0] ?? text;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
