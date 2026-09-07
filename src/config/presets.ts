import type { RuleId } from '../types.ts';

/**
 * Threshold presets. `standard` is what runs with no configuration and is
 * tuned so ordinary application code (a validation routine, a mid-sized React
 * component) passes without ceremony. `strict` is for code that should stay
 * small, such as libraries or hot paths. `relaxed` is a starting point for
 * adopting qualint in an existing codebase.
 */
export type PresetName = 'strict' | 'standard' | 'relaxed';

export const PRESET_NAMES: readonly PresetName[] = ['strict', 'standard', 'relaxed'];

export const DEFAULT_PRESET: PresetName = 'standard';

export interface PresetMaxima {
  strict: number;
  standard: number;
  relaxed: number;
}

export const PRESETS: Readonly<Record<RuleId, PresetMaxima>> = {
  'duplicate/function': { strict: 1, standard: 1, relaxed: 1 },
  'complexity/cyclomatic': { strict: 10, standard: 20, relaxed: 30 },
  'complexity/cognitive': { strict: 15, standard: 30, relaxed: 50 },
  'complexity/npath': { strict: 200, standard: 1000, relaxed: 5000 },
  'complexity/nesting': { strict: 4, standard: 5, relaxed: 6 },
  'complexity/condition': { strict: 5, standard: 7, relaxed: 10 },
  'size/file': { strict: 500, standard: 800, relaxed: 1500 },
  'size/function': { strict: 60, standard: 120, relaxed: 200 },
  'size/statements': { strict: 30, standard: 60, relaxed: 100 },
  'size/parameters': { strict: 5, standard: 6, relaxed: 8 },
};

/**
 * Smallest structure `duplicate/function` compares, in tree nodes. Duplication
 * is unwanted at every strictness, so the preset moves this floor rather than
 * the number of copies allowed.
 *
 * For scale: a one-line arrow is about 6 nodes, a five-line guard clause 23, a
 * twelve-line switch 38, an eight-line validator with a loop 56, and a small
 * React component 88. `standard` sits below that validator, since copying one
 * is worth knowing about, and above guard clauses, which legitimately repeat.
 */
export const DUPLICATE_MIN_SIZE: Readonly<Record<PresetName, number>> = {
  strict: 25,
  standard: 40,
  relaxed: 70,
};

export function isPresetName(value: string): value is PresetName {
  return (PRESET_NAMES as readonly string[]).includes(value);
}

export function presetMax(id: RuleId, preset: PresetName): number {
  return PRESETS[id][preset];
}
