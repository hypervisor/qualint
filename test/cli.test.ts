import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { promisify } from 'node:util';
import { Writable } from 'node:stream';
import { run } from '../src/cli/index.ts';

const execFileAsync = promisify(execFile);
const BIN = path.resolve(import.meta.dirname, '..', 'bin', 'qualint.js');

const COMPLEX = `export function process(order, opts) {
  if (order.a) {
    if (order.b) {
      if (order.c) {
        if (order.d) {
          if (order.e) {
            if (order.f) {
              return 1;
            }
          }
        }
      }
    }
  }
  return 0;
}
`;
const SIMPLE = 'export const add = (a: number, b: number): number => a + b;\n';

async function fixture(files: Record<string, string>): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'qualint-cli-'));
  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(dir, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content);
  }
  return dir;
}

function sink(): { stream: Writable; text: () => string } {
  let buffer = '';
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      buffer += String(chunk);
      callback();
    },
  });
  return { stream, text: () => buffer };
}

async function cli(cwd: string, ...argv: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  const out = sink();
  const err = sink();
  const code = await run(argv, { cwd, stdout: out.stream, stderr: err.stream, env: { NO_COLOR: '1' } });
  return { code, stdout: out.text(), stderr: err.text() };
}

describe('cli', () => {
  it('discovers files with zero configuration and skips default exclusions', async () => {
    const dir = await fixture({
      'src/complex.ts': COMPLEX,
      'src/simple.ts': SIMPLE,
      'src/types.d.ts': COMPLEX,
      'src/gen.generated.ts': COMPLEX,
      'node_modules/dep/index.js': COMPLEX,
      'dist/out.js': COMPLEX,
      '.hidden/x.ts': COMPLEX,
      'README.md': '# nope',
    });
    const result = await cli(dir);
    assert.equal(result.code, 1);
    assert.equal(result.stdout, `src/complex.ts

  7:13  error  Nesting depth is 6; maximum is 5  complexity/nesting

✖ 1 problem (1 error, 0 warnings)
`);
  });

  it('prints a single confirmation line when everything passes', async () => {
    const dir = await fixture({ 'src/simple.ts': SIMPLE, 'src/other.ts': SIMPLE });
    const result = await cli(dir);
    assert.equal(result.code, 0);
    assert.equal(result.stdout, '✔ 2 files analyzed, no problems\n');
    assert.equal(result.stderr, '');
  });

  it('lists clean files and the configuration only in verbose mode', async () => {
    const dir = await fixture({ 'src/simple.ts': SIMPLE, 'src/complex.ts': COMPLEX, '.qualintrc.yaml': '# defaults\n' });
    const normal = await cli(dir);
    assert.doesNotMatch(normal.stdout, /simple\.ts/);
    assert.equal(normal.stderr, '');

    const verbose = await cli(dir, '--verbose');
    assert.equal(verbose.code, 1);
    assert.equal(verbose.stderr, 'qualint: configuration: .qualintrc.yaml\n');
    assert.equal(
      verbose.stdout,
      `src/complex.ts

  7:13  error  Nesting depth is 6; maximum is 5  complexity/nesting

✔ src/simple.ts

✖ 1 problem (1 error, 0 warnings)
`,
    );

    const allClean = await cli(dir, '--verbose', 'src/simple.ts');
    assert.equal(allClean.stdout, '✔ src/simple.ts\n\n✔ 1 file analyzed, no problems\n');
  });

  it('accepts explicit files and directories, filtered by extension and exclusions', async () => {
    const dir = await fixture({ 'src/complex.ts': COMPLEX, 'lib/complex.ts': COMPLEX, 'lib/notes.txt': 'x', 'dist/complex.js': COMPLEX });
    const byFile = await cli(dir, 'src/complex.ts');
    assert.equal(byFile.code, 1);
    assert.match(byFile.stdout, /^src\/complex\.ts\n/);
    assert.doesNotMatch(byFile.stdout, /lib\//);

    const byDir = await cli(dir, 'lib', 'dist');
    assert.equal(byDir.code, 1);
    assert.match(byDir.stdout, /^lib\/complex\.ts\n/);
    assert.doesNotMatch(byDir.stdout, /dist\//);
  });

  it('exits 2 for a missing path', async () => {
    const dir = await fixture({});
    const result = await cli(dir, 'nope.ts');
    assert.equal(result.code, 2);
    assert.match(result.stderr, /path not found: nope\.ts/);
  });

  it('applies include, exclude and overrides from .qualintrc.yaml', async () => {
    const dir = await fixture({
      '.qualintrc.yaml': `
include: [src/**/*]
exclude: ['**/legacy/**']
rules:
  complexity/nesting: [warn, { max: 2 }]
overrides:
  - files: ['**/*.test.*']
    rules:
      complexity/nesting: off
`,
      'src/a.ts': COMPLEX,
      'src/a.test.ts': COMPLEX,
      'src/legacy/old.ts': COMPLEX,
      'other/b.ts': COMPLEX,
    });
    const result = await cli(dir);
    assert.equal(result.code, 0, result.stdout);
    assert.match(result.stdout, /^src\/a\.ts\n\n  7:13  warning  Nesting depth is 6; maximum is 2  complexity\/nesting\n/);
    assert.doesNotMatch(result.stdout, /a\.test\.ts|legacy|other/);
    assert.match(result.stdout, /✖ 1 problem \(0 errors, 1 warning\)/);

    const limited = await cli(dir, '--max-warnings', '0');
    assert.equal(limited.code, 1);
    assert.match(limited.stderr, /1 warnings exceed --max-warnings 0/);
  });

  it('rejects invalid configuration with exit 2 and a precise message', async () => {
    const unknownRule = await fixture({ '.qualintrc.json': JSON.stringify({ rules: { 'complexity/bogus': 'error' } }), 'a.ts': SIMPLE });
    const first = await cli(unknownRule);
    assert.equal(first.code, 2);
    assert.match(first.stderr, /configuration error: .*Unknown rule "complexity\/bogus"/);
    assert.equal(first.stdout, '');

    const badJson = await fixture({ '.qualintrc.json': '{ "rules": ', 'a.ts': SIMPLE });
    const second = await cli(badJson);
    assert.equal(second.code, 2);
    assert.match(second.stderr, /not valid YAML/);
  });

  it('reports parse errors with exit 2 while still reporting other files', async () => {
    const dir = await fixture({ 'src/broken.ts': 'export function (\n', 'src/complex.ts': COMPLEX });
    const result = await cli(dir);
    assert.equal(result.code, 2);
    assert.match(result.stdout, /src\/broken\.ts\n\n  1:17  error  Parse error: .*  parse\n/);
    assert.match(result.stdout, /src\/complex\.ts/);
    assert.match(result.stdout, /✖ 1 file could not be analyzed/);
  });

  it('emits a single JSON document that agrees with stylish output', async () => {
    const dir = await fixture({ 'src/complex.ts': COMPLEX, 'src/broken.ts': 'let = ;' });
    const result = await cli(dir, '--format', 'json');
    assert.equal(result.code, 2);
    const document = JSON.parse(result.stdout);
    assert.equal(document.version, 1);
    assert.deepEqual(document.summary, { analyzedFiles: 1, failedFiles: 1, errors: 1, warnings: 0 });
    assert.deepEqual(document.files.map((file: { path: string }) => file.path), ['src/broken.ts', 'src/complex.ts']);
    assert.match(document.files[0].error.message, /^Parse error/);
    assert.deepEqual(document.files[1].metrics, { physicalLines: 16, sourceLines: 16, blankLines: 0, commentOnlyLines: 0 });
    assert.deepEqual(document.files[1].diagnostics, [
      {
        rule: 'complexity/nesting',
        severity: 'error',
        message: 'Nesting depth is 6; maximum is 5',
        value: 6,
        maximum: 5,
        entity: 'process',
        location: { line: 7, column: 13 },
      },
    ]);
  });

  it('inspects a file in text and JSON', async () => {
    const dir = await fixture({ 'src/complex.ts': COMPLEX });
    const text = await cli(dir, 'inspect', 'src/complex.ts');
    assert.equal(text.code, 0);
    assert.match(text.stdout, /^src\/complex\.ts\n  physical lines +16\n  source lines +16  max 800\n/);
    assert.match(text.stdout, /\nprocess \(1:8–16:2\)\n/);
    assert.match(text.stdout, /  cyclomatic complexity +7  max 20\n/);
    assert.match(text.stdout, /  cognitive complexity +21  max 30\n/);
    assert.match(text.stdout, /  NPath complexity +7  max 1000\n/);
    assert.match(text.stdout, /  maximum nesting +6  max 5\n/);
    assert.match(text.stdout, /  Halstead difficulty +[\d.]+  off\n/);
    assert.match(text.stdout, /cognitive contributions\n    2:3 +if +\+1 +\= 1\n    3:5 +if +\+1 \+1 nesting +\= 3\n/);

    const json = await cli(dir, 'inspect', 'src/complex.ts', '--format', 'json');
    const document = JSON.parse(json.stdout);
    const fn = document.files[0].metrics.functions[0];
    assert.equal(fn.name, 'process');
    assert.equal(fn.npathComplexity, '7');
    assert.equal(fn.cognitiveContributions.length, 6);
    assert.equal(document.files[0].diagnostics.length, 1);
  });

  it('explains rules', async () => {
    const dir = await fixture({});
    const known = await cli(dir, 'explain', 'complexity/cognitive');
    assert.equal(known.code, 0);
    assert.match(known.stdout, /^complexity\/cognitive\n/);
    assert.match(known.stdout, /Default: error, maximum 30\nPresets: strict 15, standard 30, relaxed 50/);
    const list = await cli(dir, 'explain');
    assert.equal(list.code, 0);
    assert.match(list.stdout, /size\/parameters/);
    const unknown = await cli(dir, 'explain', 'nope');
    assert.equal(unknown.code, 2);
  });

  it('writes a starter configuration with init', async () => {
    const dir = await fixture({ 'src/complex.ts': COMPLEX });
    const first = await cli(dir, 'init', '--preset', 'strict');
    assert.equal(first.code, 0);
    assert.equal(first.stdout, '✔ wrote .qualintrc.yaml (strict preset)\n');
    const written = await fs.readFile(path.join(dir, '.qualintrc.yaml'), 'utf8');
    assert.match(written, /^preset: strict$/m);
    assert.match(written, /^#   complexity\/cyclomatic: \[error, \{ max: 10 \}\]$/m);
    assert.match(written, /^#   complexity\/halstead-difficulty: off$/m);

    // The generated file loads, and its preset is in effect.
    const run = await cli(dir);
    assert.equal(run.code, 1);
    assert.match(run.stdout, /Nesting depth is 6; maximum is 4/);

    const second = await cli(dir, 'init');
    assert.equal(second.code, 2);
    assert.match(second.stderr, /\.qualintrc\.yaml already exists; pass --force/);

    const forced = await cli(dir, 'init', '--force');
    assert.equal(forced.code, 0);
    assert.match(await fs.readFile(path.join(dir, '.qualintrc.yaml'), 'utf8'), /^preset: standard$/m);

    const bad = await cli(dir, 'init', '--preset', 'lenient');
    assert.equal(bad.code, 2);
    assert.match(bad.stderr, /Unknown preset "lenient"/);
  });

  it('analyzes only changed files with --changed and --since', async () => {
    const dir = await fixture({ 'src/old.ts': COMPLEX, 'src/kept.ts': SIMPLE });
    const git = (...args: string[]) =>
      execFileAsync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', ...args], { cwd: dir });
    await git('init', '-q', '-b', 'main');
    await git('add', '-A');
    await git('commit', '-q', '-m', 'base');

    const nothing = await cli(dir, '--changed');
    assert.equal(nothing.code, 0);
    assert.equal(nothing.stdout, '✔ no changed files to analyze\n');

    // Committed on a branch, then modified in the working tree, then a new untracked file.
    await git('checkout', '-q', '-b', 'feature');
    await fs.writeFile(path.join(dir, 'src', 'kept.ts'), COMPLEX.replace('process', 'branchChange'));
    await git('commit', '-q', '-am', 'branch work');
    await fs.writeFile(path.join(dir, 'src', 'old.ts'), COMPLEX.replace('process', 'workingTree'));
    await fs.writeFile(path.join(dir, 'src', 'fresh.ts'), COMPLEX.replace('process', 'untracked'));
    await fs.writeFile(path.join(dir, 'notes.txt'), 'ignored by extension');

    const working = await cli(dir, '--changed', '--verbose');
    assert.equal(working.code, 1);
    assert.match(working.stderr, /2 of 3 files changed in the working tree/);
    assert.match(working.stdout, /src\/fresh\.ts/);
    assert.match(working.stdout, /src\/old\.ts/);
    assert.doesNotMatch(working.stdout, /src\/kept\.ts/);

    const since = await cli(dir, '--since', 'main');
    assert.equal(since.code, 1);
    assert.match(since.stdout, /src\/kept\.ts/);
    assert.match(since.stdout, /src\/old\.ts/);
    assert.match(since.stdout, /src\/fresh\.ts/);
    assert.match(since.stdout, /✖ 3 problems/);

    const scoped = await cli(dir, '--changed', 'src/old.ts', 'src/kept.ts');
    assert.match(scoped.stdout, /^src\/old\.ts\n/);
    assert.doesNotMatch(scoped.stdout, /fresh|kept/);

    const json = await cli(dir, '--changed', '--format', 'json');
    assert.equal(JSON.parse(json.stdout).summary.analyzedFiles, 2);
  });

  it('fails clearly when --changed is used outside a git repository', async () => {
    const dir = await fixture({ 'src/a.ts': SIMPLE });
    const result = await cli(dir, '--changed');
    assert.equal(result.code, 2);
    assert.match(result.stderr, /^qualint: git rev-parse --show-toplevel failed/);
  });

  it('rejects bad arguments with exit 2 and usage', async () => {
    const dir = await fixture({});
    const result = await cli(dir, '--format', 'xml');
    assert.equal(result.code, 2);
    assert.match(result.stderr, /Unknown format "xml"/);
    assert.match(result.stderr, /Usage: qualint/);
  });

  it('runs as an installed binary', async () => {
    const dir = await fixture({ 'src/complex.ts': COMPLEX });
    const result: { code?: number; stdout: string } = await execFileAsync(process.execPath, [BIN, '--format', 'json'], {
      cwd: dir,
      env: { ...process.env, NO_COLOR: '1' },
    }).catch((error: { code: number; stdout: string }) => error);
    assert.equal(result.code, 1);
    assert.equal(JSON.parse(result.stdout).summary.errors, 1);
  });
});
