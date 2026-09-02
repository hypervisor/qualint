# Qualint design document

## 1. Summary

Qualint is a deterministic code-quality CLI for JavaScript and TypeScript. It is intended to run alongside tools such as `tsc` and ESLint after code changes, particularly in agent-driven development workflows.

Qualint measures structural properties that are easy for code-generating agents to degrade: complex control flow, deep nesting, oversized functions, dense conditions, and excessive amounts of code. It reports precise diagnostics and exits unsuccessfully when configured limits are exceeded. The calling agent is responsible for refactoring the code and running Qualint again.

```text
agent writes code
      ↓
tsc → eslint → qualint
                   ↓
             diagnostics
                   ↓
          agent refactors code
```

The first release analyzes individual source files without building a TypeScript program or resolving imports. This makes it fast, predictable, and naturally compatible with monorepos.

## 2. Goals

- Support `.js`, `.jsx`, `.ts`, `.tsx`, `.mjs`, `.cjs`, `.mts`, and `.cts` files.
- Provide deterministic, actionable quality diagnostics suitable for humans and coding agents.
- Measure several complementary aspects of maintainability rather than producing one opaque quality score.
- Work on a file, directory, glob, package, or repository without project discovery.
- Provide sensible zero-configuration defaults and an ESLint-like configuration model.
- Parse each file once and derive all metrics through a shared analysis pass.
- Remain fast enough to run after every meaningful code change and in CI.

## 3. Non-goals for v1

- Automatically editing or refactoring source code. There is no `--fix` option.
- Type-aware analysis or use of the TypeScript type checker.
- Module resolution, dependency graphs, cycles, fan-in, or fan-out.
- Framework-specific React rules or JSX-specific quality scoring.
- Duplicate-code detection.
- Test coverage, CRAP scores, Git history, or churn analysis.
- Style, naming, formatting, correctness, or security linting already covered by ESLint and other tools.
- A combined quality grade or maintainability score.
- Inline suppression comments. Exceptions belong in configuration overrides.
- Baselines and changed-lines-only analysis. These may be introduced later.

## 4. User experience

### 4.1 Commands

```bash
# Analyze configured files in the current directory
qualint

# Analyze explicit files or directories
qualint src
qualint src/orders/process-order.ts
qualint apps/api packages/shared

# Select output format
qualint --format stylish
qualint --format json

# Show every calculated metric for a file
qualint inspect src/orders/process-order.ts

# Explain a rule and its calculation
qualint explain complexity/cognitive

# Use a specific configuration file
qualint --config ./config/.qualintrc.json
```

Directories are traversed recursively. Explicit paths are still filtered by supported extensions and configured exclusions. Shell-expanded globs work as ordinary positional arguments; Qualint does not need a separate glob expression language on the command line.

### 4.2 Default diagnostic format

```text
src/orders/process-order.ts

  42:1  error  Function `processOrder` has cognitive complexity 23; maximum is 15  complexity/cognitive
  42:1  error  Function `processOrder` contains 78 source lines; maximum is 60   size/function
  67:7  error  Nesting depth is 5; maximum is 4                               complexity/nesting

✖ 3 problems (3 errors, 0 warnings)
```

Every diagnostic must include:

- file path;
- source location;
- severity;
- entity name where available;
- measured value;
- configured maximum;
- rule identifier.

Diagnostics must be stably sorted by file path, line, column, and rule identifier. Stable output matters for agents, tests, and CI logs.

### 4.3 Exit codes

| Code | Meaning |
| ---: | --- |
| `0` | Analysis completed without rule errors. |
| `1` | One or more rule errors were reported, or the warning limit was exceeded. |
| `2` | Qualint could not complete because of invalid configuration, an unreadable file, a parse error, or an internal failure. |

Warnings do not change the exit code unless `--max-warnings <n>` is supplied and the number of warnings exceeds that limit.

## 5. Configuration

The canonical v1 configuration file is `.qualintrc.yaml` (`.qualintrc.yml` and `.qualintrc.json` are also recognized; JSON is a subset of YAML). Qualint searches upward from the current working directory and uses the first file found, checking the YAML names before JSON in each directory. Configuration lookup stops at the filesystem root. The example below is shown as JSON for compactness; the YAML form is equivalent.

```json
{
  "include": ["src/**/*", "apps/**/*", "packages/**/*"],
  "exclude": [
    "**/node_modules/**",
    "**/dist/**",
    "**/build/**",
    "**/coverage/**",
    "**/*.generated.*"
  ],
  "rules": {
    "complexity/cyclomatic": ["error", { "max": 10 }],
    "complexity/cognitive": ["error", { "max": 15 }],
    "complexity/npath": ["error", { "max": 200 }],
    "complexity/nesting": ["error", { "max": 4 }],
    "complexity/condition": ["error", { "max": 5 }],
    "complexity/halstead-difficulty": "off",
    "size/file": ["error", { "max": 500 }],
    "size/function": ["error", { "max": 60 }],
    "size/statements": ["error", { "max": 30 }],
    "size/parameters": ["error", { "max": 5 }]
  },
  "overrides": [
    {
      "files": ["**/*.test.*", "**/*.spec.*"],
      "rules": {
        "size/function": ["error", { "max": 100 }],
        "size/file": "off"
      }
    }
  ]
}
```

Rule values use one of these forms:

```json
"off"
"warn"
"error"
["warn", { "max": 20 }]
["error", { "max": 10 }]
```

When only a severity is provided, the rule uses the default threshold. An override replaces the matching rule value; it does not merge the options object.

Thresholds come in three presets, selected with the top-level `preset` property: `strict` (the values in the example above), `standard` (the default: cyclomatic 20, cognitive 30, NPath 1000, nesting 5, condition 7, Halstead difficulty 30, file 800, function 120, statements 60, parameters 6) and `relaxed` (30, 50, 5000, 6, 10, 45, 1500, 200, 100, 8). A rule value with only a severity uses the active preset's maximum. The per-rule sections below quote the `strict` value as the "default maximum" for the algorithm description; the effective default is the `standard` preset.

With no configuration file, Qualint uses the `standard` preset and analyzes supported files below the current directory. `node_modules`, common build/output directories, hidden directories, declaration files (`*.d.ts`), and generated files matching `*.generated.*` are excluded by default.

Configuration errors must name the invalid property or rule and terminate with exit code `2`. Unknown rule identifiers are errors rather than ignored values.

## 6. Analysis model

### 6.1 Parser

Use `@typescript-eslint/typescript-estree` to parse all supported JavaScript, JSX, TypeScript, and TSX syntax into a common ESTree-compatible AST. Parsing is type-unaware and does not require a `tsconfig.json`.

The parser must retain:

- node ranges and line/column locations;
- tokens;
- comments;
- JSX nodes;
- optional-chain and TypeScript syntax nodes.

Type-only syntax contributes to source-line counts because it occupies source code, but it does not contribute artificial runtime branches or statements to control-flow metrics.

### 6.2 Measured entities

Function metrics apply independently to:

- function declarations;
- function expressions;
- arrow functions;
- object and class methods;
- constructors;
- getters and setters.

Nested functions are separate entities. Their bodies do not contribute control-flow, statement, or Halstead metrics to the enclosing function. The line occupied by a nested function declaration still contributes to the enclosing function's source-line footprint because it remains physically inside that function.

Anonymous functions should receive a useful derived name where possible, such as `renderItem`, `items.map callback`, or `<anonymous at 24:7>`.

### 6.3 Shared analysis pass

Qualint must not traverse the complete AST separately for every rule. The analyzer builds reusable file and function measurements, after which rules compare those measurements with configured thresholds.

```ts
interface FunctionMetrics {
  location: SourceLocation;
  sourceLines: number;
  statementCount: number;
  parameterCount: number;
  cyclomaticComplexity: number;
  cognitiveComplexity: number;
  npathComplexity: bigint;
  maximumNestingDepth: number;
  maximumConditionComplexity: number;
  halstead: HalsteadMetrics;
}

interface FileMetrics {
  physicalLines: number;
  sourceLines: number;
  blankLines: number;
  commentOnlyLines: number;
  functions: FunctionMetrics[];
}
```

`bigint` is used for NPath because the value can grow beyond JavaScript's safe integer range. Human-readable output may display very large values in scientific notation, while JSON output serializes the exact value as a decimal string.

## 7. V1 rules and algorithms

The metric definitions below are part of Qualint's public behavior. Changes that alter existing scores require release notes and metric regression tests.

### 7.1 `complexity/cyclomatic`

Scope: function. Default: `error`, maximum `10`.

Start each function at complexity `1`. Add one for each runtime decision point owned by that function:

- `if`;
- each `for`, `for...in`, `for...of`, `while`, and `do...while` loop;
- `catch`;
- conditional (`condition ? a : b`) expression;
- each non-default `switch` case;
- each logical `&&`, `||`, or `??` operator;
- each logical assignment `&&=`, `||=`, or `??=`;
- each optional-chain segment that may short-circuit, such as `value?.member` or `fn?.()`;
- a default parameter or destructuring default evaluated by the function.

`else`, `finally`, `default`, plain lexical blocks, and nested function bodies add nothing. A chain such as `a?.b?.c` contains two optional-chain decision points. TypeScript-only syntax such as `as`, `satisfies`, type annotations, and non-null assertions adds nothing.

Report the diagnostic at the function's declaration or derived name.

### 7.2 `complexity/cognitive`

Scope: function. Default: `error`, maximum `15`.

Cognitive complexity estimates the effort required to follow a function. It rewards flat control flow and penalizes nested flow more heavily.

Maintain a current control-flow nesting level, initially `0`.

Add `1 + current nesting` for:

- the first `if` in an `if`/`else if` chain;
- loops;
- `catch`;
- `switch` as a whole;
- conditional expressions.

These constructs increase the nesting level while visiting their controlled body. `else if` adds `1` but does not add an extra nesting penalty beyond the chain's existing level. A final `else` adds `1`. Individual `case` labels add nothing.

Add `1` without a nesting penalty for:

- each sequence of identical logical operators (`&&`, `||`, or `??`), and another `1` whenever the operator changes; for example, `a && b && c` adds `1`, while `a && b || c` adds `2`;
- labeled `break` and labeled `continue` statements.

Do not add complexity for guard-clause returns, ordinary `break`/`continue`, optional chaining, `try`, `finally`, or syntax-only TypeScript nodes.

Nested functions are scored separately and do not add their internal score to the enclosing function. The `inspect` command must expose a contribution list with location, construct, base increment, nesting increment, and running total so a score is explainable.

### 7.3 `complexity/npath`

Scope: function. Default: `error`, maximum `200`.

NPath estimates the number of acyclic execution paths through a function. Unlike cyclomatic complexity, independent decisions in sequence multiply. Ten sequential simple `if` statements therefore produce up to `2^10 = 1024` paths.

The implementation uses recursive composition:

- an ordinary statement has one path;
- sequential statements multiply their path counts;
- `if` paths are the sum of the `then` and `else` paths; a missing `else` contributes one empty path;
- a loop contributes one path that skips the body plus the body's paths;
- a conditional expression contributes the sum of its two branch paths;
- a logical short-circuit expression contributes a skip-right path plus the right-hand expression's paths;
- a `switch` contributes the sum of its possible case-entry paths, plus one no-match path when there is no `default`; fall-through statements belong to every case entry that can reach them;
- `try` and `catch` are alternative paths, after which every path passes through `finally` when present;
- nested function bodies contribute one ordinary expression/declaration path to the enclosing function and are analyzed independently.

Boolean operators inside an `if`, loop, or conditional test must affect the result because short-circuit evaluation creates additional acyclic paths. Loops are treated as zero iterations or one representative iteration; repeated traversal is excluded because NPath is acyclic.

Abrupt completion (`return`, `throw`, `break`, and `continue`) must stop multiplication by unreachable later statements on that path. Implement this by returning path counts grouped by completion kind rather than using a single scalar during recursive analysis.

NPath is the most implementation-sensitive v1 algorithm. Its fixture suite is authoritative for edge cases including nested conditionals, fall-through switches, early returns, logical expressions, loops, and `try`/`catch`/`finally`.

### 7.4 `complexity/nesting`

Scope: function. Default: `error`, maximum `4`.

Measure the greatest number of simultaneously enclosing control-flow constructs within a function. The following increase depth by one while their controlled body is visited:

- `if` and `else` branches;
- loops;
- `switch`;
- `try`, `catch`, and `finally` bodies;
- conditional expressions.

An `else if` continues the existing conditional chain and does not introduce a second level solely because of its AST representation. `case` labels, plain blocks, functions, classes, callbacks, and JSX elements do not increase depth. Nested functions restart at depth `0`.

Report the location of the construct at the maximum depth, not only the function declaration.

### 7.5 `complexity/condition`

Scope: individual condition or short-circuit expression. Default: `error`, maximum `5`.

This rule detects a single condition that contains too many decisions even when its enclosing function remains small.

A condition group is:

- the test expression of `if` and loops;
- the test expression of a `for` loop when present;
- a complete conditional expression, where the root `?:` is the first decision;
- a top-level logical expression used as a value, including JSX conditional rendering.

The score represents the number of atomic decision clauses in the group:

- an `if` or loop test scores `1 + logical operators + conditional operators`;
- a standalone logical-expression group uses the same formula;
- a conditional-expression group scores `conditional operators + logical operators`, so a simple ternary scores `1` and each nested ternary adds another decision clause.

The counted logical operators are `&&`, `||`, and `??`. Parentheses do not split a group. Nested logical and conditional nodes are reported only as part of their outermost group, preventing duplicate diagnostics. Unary negation and comparison operators do not add points.

Examples:

```ts
if (a) {}                         // 1
if (a && b && c) {}               // 3
if (a && (b || c) && d) {}        // 4
const value = a ? b : c ? d : e; // 2 for the outer condition group
return ready && <Panel />;        // 2
```

The diagnostic points to the outermost condition group and reports its score.

### 7.6 `complexity/halstead-difficulty`

Scope: function. Default: `off`, default maximum `20` when enabled.

Halstead metrics use operator and operand token counts:

```text
n1 = number of distinct operators
n2 = number of distinct operands
N1 = total operator occurrences
N2 = total operand occurrences

vocabulary = n1 + n2
length     = N1 + N2
volume     = length × log2(vocabulary)
difficulty = (n1 / 2) × (N2 / n2)
effort     = difficulty × volume
```

When the vocabulary or operand divisor is zero, the corresponding derived value is `0` rather than `NaN` or infinity.

Qualint must define one central, versioned token-classification table:

- runtime keywords and punctuators that perform an operation are operators;
- identifier references, property names when explicitly written, and literal values are operands;
- delimiters used only for grouping or separation are ignored;
- comments, whitespace, and type-only TypeScript syntax are ignored;
- JSX tag names, attribute names, and text are operands; JSX delimiters are ignored;
- nested function bodies are excluded from the enclosing function.

The exact classification table must be included in source documentation and covered by token-level fixtures. It must not depend on parser-internal numeric token kinds.

Qualint always calculates vocabulary, length, volume, difficulty, and effort for `inspect` and JSON output. Only difficulty has a v1 threshold rule. The rule is disabled by default because useful thresholds vary considerably between code styles and domains.

### 7.7 `size/file`

Scope: file. Default: `error`, maximum `500` source lines.

A source line is a physical line containing at least one non-whitespace source character after comment ranges are removed. This excludes blank lines and comment-only lines while retaining lines that contain both code and a trailing or embedded comment.

```ts
// ignored

function answer() {  // counted
  /* comment */      // ignored
  return 42;         // counted
}                    // counted
```

The example contains three source lines. Multiline expressions and JSX count once for each physical line containing code. Imports, exports, types, interfaces, decorators, and declarations count normally. A shebang line counts as source code.

String and template-literal contents containing comment-like text must not be removed. Use parser-provided comment ranges instead of regular expressions.

### 7.8 `size/function`

Scope: function. Default: `error`, maximum `60` source lines.

Apply the same source-line definition as `size/file`, limited to physical lines intersecting the function's source range. The declaration/signature, braces, and expression body count when they contain code. Comment-only and blank lines inside the function do not count.

Nested function source remains part of the enclosing function's physical size, even though its statements and complexity are measured independently.

### 7.9 `size/statements`

Scope: function. Default: `error`, maximum `30`.

Count executable ESTree statement nodes owned by the function. Do not count:

- `BlockStatement` containers;
- type-only declarations;
- nested function bodies;
- JSX nodes or expressions merely because they contain several AST nodes.

A variable declaration counts as one statement regardless of the number of declarators. A nested function declaration counts as one declaration statement in its enclosing function, but the nested function's body is excluded. Statements nested inside branches and loops count normally.

### 7.10 `size/parameters`

Scope: function. Default: `error`, maximum `5`.

Each syntactic parameter counts once. Destructured, defaulted, and rest parameters each count as one. A TypeScript fake `this` parameter does not count because callers do not supply it.

## 8. Inspect output

`qualint inspect <file>` ignores rule severities and prints every calculated measurement. It still loads configuration so the output may show configured limits.

```text
src/orders/process-order.ts
  physical lines       184
  source lines         139
  blank lines           24
  comment-only lines    21

processOrder (42:1–119:2)
  source lines                 63   max 60
  statements                   31   max 30
  parameters                    4   max 5
  cyclomatic complexity        12   max 10
  cognitive complexity         18   max 15
  NPath complexity            288   max 200
  maximum nesting               4   max 4
  maximum condition             5   max 5
  Halstead difficulty        17.4   off
  Halstead volume           812.7
  Halstead effort         14146.9
```

With `--format json`, inspect output must use the same metric model as ordinary JSON diagnostics so integrations do not need two schemas.

## 9. JSON output

The JSON formatter writes a single document to standard output. Informational logs go to standard error.

```json
{
  "version": 1,
  "files": [
    {
      "path": "src/orders/process-order.ts",
      "metrics": {
        "physicalLines": 184,
        "sourceLines": 139,
        "blankLines": 24,
        "commentOnlyLines": 21
      },
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
  "summary": {
    "analyzedFiles": 1,
    "errors": 1,
    "warnings": 0
  }
}
```

The top-level `version` identifies the output schema version. NPath values are decimal strings in JSON when they belong to metric data or may exceed the safe integer range.

## 10. Suggested implementation structure

```text
src/
  cli/
    index.ts
    commands/
      analyze.ts
      inspect.ts
      explain.ts
  config/
    load-config.ts
    schema.ts
    defaults.ts
  files/
    discover-files.ts
    ignore.ts
  parser/
    parse-file.ts
  analysis/
    analyze-file.ts
    function-context.ts
    source-lines.ts
    control-flow.ts
    npath.ts
    halstead.ts
  rules/
    registry.ts
    complexity/
    size/
  formatters/
    stylish.ts
    json.ts
  types.ts
```

The rule engine should consume metric records rather than AST nodes. AST traversal and metric calculation belong to `analysis`; threshold comparison, severity, and diagnostic construction belong to `rules`.

File analysis can run concurrently, but result ordering must be deterministic. A failure in one file should not cause partially ordered output from other workers.

## 11. Testing strategy

### 11.1 Metric fixtures

Each metric needs small source fixtures with hand-calculated expected values. Include:

- every supported function form;
- nested functions;
- TS and TSX syntax that should not affect runtime complexity;
- logical and optional-chain expressions;
- `switch` with default and fall-through;
- early returns and unreachable statements;
- loops and nested control flow;
- `try`/`catch`/`finally`;
- multiline comments, inline comments, strings containing comment markers, and template literals;
- JSX trees and conditional rendering;
- destructured, defaulted, rest, and TypeScript `this` parameters;
- NPath values larger than `Number.MAX_SAFE_INTEGER`.

### 11.2 Integration tests

Test the installed CLI against temporary fixture directories:

- zero-configuration discovery;
- explicit file and directory arguments;
- exclusions and overrides;
- malformed source files;
- invalid and unknown configuration values;
- stable stylish output;
- valid JSON with no extra standard-output text;
- exit codes `0`, `1`, and `2`;
- Linux, macOS, and Windows path handling.

### 11.3 Performance target

As an initial acceptance target, Qualint should analyze 1,000 typical source files in under 5 seconds on a modern developer laptop after process startup, excluding dependency installation. Measure and publish a repeatable benchmark before treating this as a hard compatibility promise.

## 12. V1 acceptance criteria

Qualint v1 is complete when:

1. It analyzes every supported extension without requiring a TypeScript project.
2. All 10 rules follow the definitions in this document and have hand-verified fixtures.
3. Running `qualint` with no configuration provides a useful quality gate.
4. Configuration overrides work across packages in a monorepo without workspace awareness.
5. Diagnostics are stable, precise, and give an agent enough information to refactor the failing entity.
6. Stylish and JSON output agree on every reported value.
7. Parse and configuration failures cannot be mistaken for a clean analysis.
8. The CLI never changes source files.

## 13. Likely post-v1 work

Potential additions, in approximate order of value:

1. baseline files for adopting Qualint in an existing codebase;
2. Git diff/regression mode;
3. SARIF output for code-hosting annotations;
4. duplicate/clone detection;
5. expression-depth and local-variable metrics;
6. optional TypeScript-aware rules;
7. optional coverage input and CRAP scoring;
8. project-level dependency and architecture analysis.

These should remain separate capabilities with explicit metrics. Qualint should continue to report the concrete reason code failed rather than collapsing measurements into a grade.
