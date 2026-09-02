/**
 * Programmatic API. The CLI is a thin layer over these functions, so an
 * integration can analyze in-memory source without spawning a process.
 */
import { analyzeFile } from './analysis/analyze-file.ts';
import { parseSource } from './parser/parse-file.ts';
import type { FileMetrics } from './types.ts';

export { run } from './cli/index.ts';
export { loadConfig, resolveRulesForFile } from './config/load-config.ts';
export { ConfigError, validateConfig } from './config/schema.ts';
export { DEFAULT_EXCLUDE } from './config/defaults.ts';
export { PRESETS, PRESET_NAMES, DEFAULT_PRESET, type PresetName } from './config/presets.ts';
export { analyzeFile } from './analysis/analyze-file.ts';
export { parseSource, ParseFailure, SUPPORTED_EXTENSIONS } from './parser/parse-file.ts';
export { RULES, RULE_IDS, runRules } from './rules/registry.ts';
export { formatJson } from './formatters/json.ts';
export { formatStylish } from './formatters/stylish.ts';
export type * from './types.ts';

/** Parses and measures a single source text. Throws `ParseFailure` on syntax errors. */
export function analyzeSource(code: string, filePath: string): FileMetrics {
  return analyzeFile(parseSource(code, filePath));
}
