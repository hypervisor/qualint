# qualint

A code quality gate for JavaScript and TypeScript. It measures the things that
tend to rot when code is written quickly, by people or by agents: control-flow
complexity, nesting depth, oversized functions, dense conditions, files that
keep growing. When a limit is exceeded it tells you exactly which function,
which line, what the number is and what the limit was, and exits non-zero.

It's meant to sit next to `tsc` and `eslint` in your check script, and it's
deliberately quiet: a clean run prints one line.

```text
$ qualint
src/orders/process-order.ts

  42:1  error  Function `processOrder` has cognitive complexity 23; maximum is 15  complexity/cognitive
  42:1  error  Function `processOrder` contains 78 source lines; maximum is 60     size/function
  67:7  error  Nesting depth is 5; maximum is 4                                    complexity/nesting

✖ 3 problems (3 errors, 0 warnings)
```

```text
$ qualint
✔ 212 files analyzed, no problems
```

Each file is parsed on its own. There is no TypeScript program, no
`tsconfig.json` lookup and no import resolution, so it's fast (about 2 ms per
file) and works the same in a monorepo as in a single package.

## Install

```bash
npm install --save-dev qualint
```

Requires Node.js 20.9 or newer. The only runtime dependency is the
`@typescript-eslint/typescript-estree` parser; `typescript` is a peer
dependency that npm and pnpm install for you if the project doesn't have it.

```json
{
  "scripts": {
    "check": "tsc --noEmit && eslint . && qualint"
  }
}
```

## Usage

```bash
qualint                                  # everything under the current directory
qualint src                              # a directory
qualint src/orders/process-order.ts      # a file
qualint apps/api packages/shared         # several paths, shell globs work too
qualint --format json                    # machine-readable output
qualint --max-warnings 0                 # treat warnings as failures
qualint --verbose                        # also list clean files and the config in use
qualint --config ./config/.qualintrc.yaml
qualint inspect src/orders/process-order.ts   # every metric for a file
qualint explain complexity/cognitive          # how a rule is calculated
```

Supported extensions: `.js .jsx .ts .tsx .mjs .cjs .mts .cts`. Directories are
walked recursively. `node_modules` and hidden directories are never entered.

Output is sorted by path, line, column and rule, so two runs on the same code
produce identical text. Paths use forward slashes on every platform.

### Exit codes

| Code | Meaning                                                                        |
| ---: | ------------------------------------------------------------------------------ |
|  `0` | No rule errors. Warnings are fine unless `--max-warnings` says otherwise.      |
|  `1` | At least one rule error, or too many warnings.                                 |
|  `2` | Couldn't finish: bad configuration, unreadable file, syntax error in a file.   |

A syntax error in one file doesn't hide the results for the others, but it does
force exit code 2 so it can't be mistaken for a clean run.

## Configuration

qualint looks for `.qualintrc.yaml` (also `.yml` or `.json`), starting in the
current directory and walking up. Patterns are relative to the directory the
file lives in. With no file, the defaults below apply to every supported file
under the current directory.

```yaml
include:
  - src/**/*
  - apps/**/*
  - packages/**/*
exclude:
  - '**/node_modules/**'
  - '**/dist/**'
  - '**/build/**'
  - '**/coverage/**'
  - '**/*.generated.*'
rules:
  complexity/cyclomatic: [error, { max: 10 }]
  complexity/cognitive: [error, { max: 15 }]
  complexity/npath: [error, { max: 200 }]
  complexity/nesting: [error, { max: 4 }]
  complexity/condition: [error, { max: 5 }]
  complexity/halstead-difficulty: off
  size/file: [error, { max: 500 }]
  size/function: [error, { max: 60 }]
  size/statements: [error, { max: 30 }]
  size/parameters: [error, { max: 5 }]
overrides:
  - files: ['**/*.test.*', '**/*.spec.*']
    rules:
      size/function: [error, { max: 100 }]
      size/file: off
```

A rule value is `off`, `warn`, `error`, or `[severity, { max: n }]`.
A bare severity keeps the default limit. Overrides are applied in order and
each one replaces the whole value for a rule, so `["error"]` in an override
resets `max` to the default rather than keeping the top-level one.

Anything unknown (a property, a rule name, an option) is a configuration error.
The message names the offending key and the exit code is 2.

When `exclude` is omitted, these are skipped: `node_modules`, `dist`, `build`,
`coverage`, hidden directories, `*.generated.*` and declaration files (`*.d.ts`,
`*.d.mts`, `*.d.cts`). Globs support `**`, `*`, `?`, `[abc]` and `{a,b}`. A
pattern without a slash matches the file name at any depth.

There are no inline suppression comments. If a function needs a different limit,
put it in an override.

## Rules

| Rule                             | Scope     | Default        | What it measures                                                         |
| -------------------------------- | --------- | -------------- | ------------------------------------------------------------------------ |
| `complexity/cyclomatic`          | function  | error, max 10  | Decision points: `if`, loops, `catch`, `?:`, `case`, `&& \|\| ??`, `?.`, default values |
| `complexity/cognitive`           | function  | error, max 15  | How hard the function is to follow. Nested control flow costs more.      |
| `complexity/npath`               | function  | error, max 200 | Acyclic execution paths. Decisions in sequence multiply.                 |
| `complexity/nesting`             | function  | error, max 4   | Deepest stack of enclosing control-flow constructs                       |
| `complexity/condition`           | condition | error, max 5   | Decision clauses in a single `if`/loop test, ternary or `&&` chain       |
| `complexity/halstead-difficulty` | function  | off, max 20    | Halstead difficulty over the function's own tokens                       |
| `size/file`                      | file      | error, max 500 | Source lines, ignoring blank and comment-only lines                      |
| `size/function`                  | function  | error, max 60  | Source lines within the function                                         |
| `size/statements`                | function  | error, max 30  | Executable statements the function owns                                  |
| `size/parameters`                | function  | error, max 5   | Parameters, not counting a TypeScript `this` parameter                   |

`qualint explain <rule>` prints the full definition of each one. The scoring
rules are considered public behaviour and are pinned by the test fixtures; a
change that moves scores gets a release note and a version bump.

Every function is measured on its own: declarations, expressions, arrows,
methods, constructors, getters and setters. A nested function doesn't add its
control flow, statements or tokens to the function around it, though its lines
still count toward the outer function's size. Anonymous functions get a name
from context, like `items.map callback`, `onClick` or `<anonymous at 24:7>`.

## Inspect

`qualint inspect <file>` prints every metric for every function, with the
configured limit next to each, plus the step-by-step cognitive complexity
ledger so you can see where a score comes from.

```text
processOrder (42:1–119:2)
  source lines               63  max 60
  statements                 31  max 30
  parameters                  4  max 5
  cyclomatic complexity      12  max 10
  cognitive complexity       18  max 15
  NPath complexity          288  max 200
  maximum nesting             4  max 4
  maximum condition           5  max 5
  Halstead difficulty      17.4  off
  Halstead volume         812.7
  Halstead effort       14146.9
  deepest construct at 67:7
  cognitive contributions
    44:3  if      +1             = 1
    46:5  for-of  +1 +1 nesting  = 3
    ...
```

`inspect --format json` gives the same document as `--format json`, with a
`functions` array added under each file's `metrics`.

## JSON output

```json
{
  "version": 1,
  "files": [
    {
      "path": "src/orders/process-order.ts",
      "metrics": { "physicalLines": 184, "sourceLines": 139, "blankLines": 24, "commentOnlyLines": 21 },
      "diagnostics": [
        {
          "rule": "complexity/cognitive",
          "severity": "error",
          "message": "Function `processOrder` has cognitive complexity 23; maximum is 15",
          "value": 23,
          "maximum": 15,
          "entity": "processOrder",
          "location": { "line": 42, "column": 1 }
        }
      ]
    }
  ],
  "summary": { "analyzedFiles": 1, "failedFiles": 0, "errors": 1, "warnings": 0 }
}
```

Nothing else goes to stdout in JSON mode. A file that failed to parse has an
`error` object instead of `metrics`. NPath values are decimal strings since
they can exceed 2^53.

## Using it from code

```ts
import { analyzeSource, loadConfig, resolveRulesForFile, runRules } from 'qualint';

const metrics = analyzeSource(code, 'src/a.ts');
const loaded = await loadConfig({ cwd: process.cwd() });
const diagnostics = runRules(metrics, resolveRulesForFile(loaded, '/abs/path/src/a.ts'));
```

## What it doesn't do

No autofix, no type-aware rules, no import graphs or cycle detection, no
duplicate-code detection, no style or correctness linting (ESLint does that),
no single "quality score". Baselines for adopting it in an existing codebase
and a changed-lines-only mode are the likely next additions. The design
document in [docs/design.md](docs/design.md) has the full reasoning and the
exact definition of every metric.

## Contributing

```bash
npm install
npm run check        # typecheck, tests, and qualint on its own source
npm run test:verbose # per-test output
npm run bench        # generates 1,000 files and times a full run
```

Tests run straight against the TypeScript sources with Node's built-in type
stripping. Commits follow [Conventional Commits](https://www.conventionalcommits.org/)
and releases follow semantic versioning.

## License

[MIT](LICENSE)
