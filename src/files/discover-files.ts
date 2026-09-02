import fs from 'node:fs/promises';
import path from 'node:path';
import { isSupportedFile } from '../parser/parse-file.ts';
import { literalPrefix, matchesAnyGlob, toPosixPath } from './glob.ts';

export interface DiscoverOptions {
  cwd: string;
  /** Directory that include/exclude patterns are relative to. */
  baseDir: string;
  include: readonly string[] | null;
  exclude: readonly string[];
  /** Explicit files or directories from the command line. */
  positional: readonly string[];
}

export interface DiscoveredFiles {
  /** Absolute paths, sorted by their base-relative posix path. */
  files: string[];
  /** Positional arguments that do not exist on disk. */
  missing: string[];
}

/** Directory names that are never traversed, regardless of configuration. */
const ALWAYS_PRUNED = (name: string): boolean => name === 'node_modules' || name.startsWith('.');

/** Probe name used to decide whether an exclude pattern prunes a whole directory. */
const PROBE = 'qualint-probe-file';

/**
 * Finds files to analyze. Explicit paths are filtered by extension and
 * exclusions only; configured `include` patterns apply when no paths are given.
 */
export async function discoverFiles(options: DiscoverOptions): Promise<DiscoveredFiles> {
  const collected = new Set<string>();
  const isExcluded = (absolute: string): boolean => matchesAnyGlob(options.exclude, relativeTo(options.baseDir, absolute));
  const missing =
    options.positional.length > 0
      ? await collectPositional(options, isExcluded, collected)
      : await collectConfigured(options, isExcluded, collected);

  const files = [...collected].sort((a, b) => {
    const left = relativeTo(options.baseDir, a);
    const right = relativeTo(options.baseDir, b);
    return left < right ? -1 : left > right ? 1 : 0;
  });
  return { files, missing };
}

/** Explicit paths: directories are walked, files are filtered by extension and exclusions. */
async function collectPositional(
  options: DiscoverOptions,
  isExcluded: (absolute: string) => boolean,
  collected: Set<string>,
): Promise<string[]> {
  const missing: string[] = [];
  for (const argument of options.positional) {
    const absolute = path.resolve(options.cwd, argument);
    const stat = await statOrNull(absolute);
    if (stat === null) {
      missing.push(argument);
    } else if (stat.isDirectory()) {
      await walk(absolute, options, () => true, isExcluded, collected);
    } else if (isSupportedFile(absolute) && !isExcluded(absolute)) {
      collected.add(absolute);
    }
  }
  return missing;
}

/** No explicit paths: walk the include roots and filter by include and exclude patterns. */
async function collectConfigured(
  options: DiscoverOptions,
  isExcluded: (absolute: string) => boolean,
  collected: Set<string>,
): Promise<string[]> {
  const include = options.include;
  const isIncluded =
    include === null ? () => true : (absolute: string) => matchesAnyGlob(include, relativeTo(options.baseDir, absolute));
  for (const root of traversalRoots(options)) {
    const stat = await statOrNull(root);
    if (stat === null) {
      continue;
    }
    if (stat.isDirectory()) {
      await walk(root, options, isIncluded, isExcluded, collected);
    } else if (isSupportedFile(root) && isIncluded(root) && !isExcluded(root)) {
      collected.add(root);
    }
  }
  return [];
}

function traversalRoots(options: DiscoverOptions): string[] {
  if (options.include === null) {
    return [options.baseDir];
  }
  const roots = new Set<string>();
  for (const pattern of options.include) {
    roots.add(path.resolve(options.baseDir, literalPrefix(pattern)));
  }
  // Drop roots nested inside another root so files are visited once.
  const sorted = [...roots].sort((a, b) => a.length - b.length);
  const result: string[] = [];
  for (const root of sorted) {
    if (!result.some((parent) => root === parent || root.startsWith(`${parent}${path.sep}`))) {
      result.push(root);
    }
  }
  return result;
}

async function walk(
  directory: string,
  options: DiscoverOptions,
  isIncluded: (absolute: string) => boolean,
  isExcluded: (absolute: string) => boolean,
  collected: Set<string>,
): Promise<void> {
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (ALWAYS_PRUNED(entry.name) || isExcluded(path.join(absolute, PROBE))) {
        continue;
      }
      await walk(absolute, options, isIncluded, isExcluded, collected);
    } else if (entry.isFile()) {
      if (isSupportedFile(absolute) && isIncluded(absolute) && !isExcluded(absolute)) {
        collected.add(absolute);
      }
    }
  }
}

function relativeTo(baseDir: string, absolute: string): string {
  const relative = path.relative(baseDir, absolute);
  return toPosixPath(relative === '' ? path.basename(absolute) : relative);
}

async function statOrNull(target: string): Promise<import('node:fs').Stats | null> {
  try {
    return await fs.stat(target);
  } catch {
    return null;
  }
}
