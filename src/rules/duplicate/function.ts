import type { FunctionMetrics } from '../../types.ts';
import { DEFAULT_PRESET, DUPLICATE_MIN_SIZE, presetMax } from '../../config/presets.ts';
import { comparePositions, compareStrings } from '../../compare.ts';
import type { ProjectDiagnosticDraft, ProjectFile, RuleDefinition } from '../registry.ts';

interface Occurrence {
  path: string;
  fn: FunctionMetrics;
}

/** Most other locations named in the detail line before it stops being readable. */
const NAMED_LOCATIONS = 3;

export const duplicateFunctionRule: RuleDefinition = {
  id: 'duplicate/function',
  scope: 'project',
  defaultSeverity: 'error',
  defaultMax: presetMax('duplicate/function', DEFAULT_PRESET),
  fractional: false,
  extraOptions: ['minSize'],
  summary: 'Functions with the same structure, ignoring names, literals and types.',
  explanation: `Two functions are duplicates when their syntax trees have the same shape once
the things a copy-paste changes are stripped away:

  - identifier and property names, so validateOrder matches validateCart
  - literal values, so a threshold of 10 matches a threshold of 20
  - type annotations, generics and other erasable TypeScript
  - assertion wrappers (as, satisfies, !), so adding one to a copy does not
    hide it
  - comments and formatting

What still separates two functions:

  - the shape and nesting of every construct
  - operators, so a + b does not match a - b
  - declaration kinds, so const does not match let
  - computed and optional access, so a?.b does not match a.b

A nested function counts inside its parent as well as on its own, so two
functions differing only inside an inline callback are not duplicates. When a
duplicated function sits inside another duplicated function, only the outer one
is reported.

Options:

  max       copies allowed before it counts as duplication (default 1)
  minSize   smallest structure worth comparing, in tree nodes; raise it to
            ignore small shared shapes like one-line wrappers

Each group of duplicates produces one diagnostic, on its first occurrence,
naming where the others are. Comparison covers the files analyzed in this run,
so a run limited by --changed only sees duplicates among the changed files.`,
  checkProject(files: readonly ProjectFile[], options): ProjectDiagnosticDraft[] {
    const minSize = options.minSize ?? DUPLICATE_MIN_SIZE[DEFAULT_PRESET];
    const groups = new Map<string, Occurrence[]>();
    for (const file of files) {
      for (const fn of file.metrics.functions) {
        if (fn.structure.size < minSize) {
          continue;
        }
        const found = groups.get(fn.structure.hash);
        if (found === undefined) {
          groups.set(fn.structure.hash, [{ path: file.path, fn }]);
        } else {
          found.push({ path: file.path, fn });
        }
      }
    }

    const reports: Array<{ draft: ProjectDiagnosticDraft; at: Occurrence }> = [];
    for (const occurrences of groups.values()) {
      if (occurrences.length <= options.max) {
        continue;
      }
      occurrences.sort(byPosition);
      const [first, ...others] = occurrences as [Occurrence, ...Occurrence[]];
      reports.push({ draft: describe(first, others, occurrences.length, options.max), at: first });
    }

    return dropContained(reports).sort((a, b) => compareStrings(a.path, b.path) || a.location.line - b.location.line);
  },
};

function describe(first: Occurrence, others: readonly Occurrence[], total: number, max: number): ProjectDiagnosticDraft {
  const named = others.slice(0, NAMED_LOCATIONS).map((o) => `${o.path}:${o.fn.location.start.line} ${o.fn.name}`);
  const remaining = others.length - named.length;
  const suffix = remaining > 0 ? `, and ${remaining} more` : '';
  return {
    path: first.path,
    message: `Function \`${first.fn.name}\` is one of ${total} identical implementations; maximum is ${max}`,
    value: total,
    maximum: max,
    entity: first.fn.name,
    location: first.fn.location.start,
    detail: `also at ${named.join(', ')}${suffix}`,
  };
}

/**
 * Drops a report for a function that sits inside another reported function in
 * the same file. A duplicated function duplicates its inline callbacks too, and
 * only the outermost one is worth acting on.
 */
function dropContained(reports: ReadonlyArray<{ draft: ProjectDiagnosticDraft; at: Occurrence }>): ProjectDiagnosticDraft[] {
  return reports
    .filter((report) =>
      !reports.some(
        (other) => other !== report && other.at.path === report.at.path && encloses(other.at.fn, report.at.fn),
      ),
    )
    .map((report) => report.draft);
}

function encloses(outer: FunctionMetrics, inner: FunctionMetrics): boolean {
  const startsBefore = comparePositions(outer.location.start, inner.location.start) <= 0;
  const endsAfter = comparePositions(outer.location.end, inner.location.end) >= 0;
  return startsBefore && endsAfter && outer.structure.size > inner.structure.size;
}

function byPosition(a: Occurrence, b: Occurrence): number {
  return compareStrings(a.path, b.path) || comparePositions(a.fn.location.start, b.fn.location.start);
}
