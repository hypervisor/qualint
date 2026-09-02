import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { loadConfig, resolveRulesForFile } from '../src/config/load-config.ts';
import { ConfigError, validateConfig } from '../src/config/schema.ts';

const rejects = (raw: unknown, pattern: RegExp): void => {
  assert.throws(() => validateConfig(raw), (error: unknown) => error instanceof ConfigError && pattern.test(error.message));
};

describe('config validation', () => {
  it('accepts every documented rule value form', () => {
    const config = validateConfig({
      rules: {
        'complexity/cyclomatic': 'off',
        'complexity/cognitive': 'warn',
        'complexity/npath': 'error',
        'complexity/nesting': ['warn', { max: 6 }],
        'complexity/halstead-difficulty': ['error', { max: 12.5 }],
        'size/file': ['error'],
      },
    });
    assert.equal(config.rules.get('complexity/cyclomatic'), 'off');
    assert.deepEqual(config.rules.get('complexity/cognitive'), { severity: 'warn', options: { max: 30 } });
    assert.deepEqual(config.rules.get('complexity/nesting'), { severity: 'warn', options: { max: 6 } });
    assert.deepEqual(config.rules.get('complexity/halstead-difficulty'), { severity: 'error', options: { max: 12.5 } });
    assert.deepEqual(config.rules.get('size/file'), { severity: 'error', options: { max: 800 } });
    assert.equal(config.preset, 'standard');
  });

  it('uses the preset for bare severities and rejects unknown presets', () => {
    const strict = validateConfig({ preset: 'strict', rules: { 'size/function': 'warn' } });
    assert.deepEqual(strict.rules.get('size/function'), { severity: 'warn', options: { max: 60 } });
    const relaxed = validateConfig({ preset: 'relaxed', overrides: [{ files: ['*.ts'], rules: { 'size/function': ['error'] } }] });
    assert.deepEqual(relaxed.overrides[0]!.rules.get('size/function'), { severity: 'error', options: { max: 200 } });
    rejects({ preset: 'lenient' }, /"preset" must be one of strict, standard, relaxed; got "lenient"/);
  });

  it('names the invalid property in every error', () => {
    rejects({ includes: [] }, /Unknown property "includes"; expected one of preset, include/);
    rejects({ include: 'src' }, /"include" must be an array of strings/);
    rejects({ rules: { 'complexity/unknown': 'error' } }, /Unknown rule "complexity\/unknown"/);
    rejects({ rules: { 'size/file': 'loud' } }, /rules\["size\/file"\].*invalid severity "loud"/);
    rejects({ rules: { 'size/file': ['error', { max: 1 }, 'x'] } }, /\[severity, \{ "max": n \}\]/);
    rejects({ rules: { 'size/file': ['error', { maximum: 1 }] } }, /Unknown option "maximum"/);
    rejects({ rules: { 'size/file': ['error', { max: -1 }] } }, /max must be a non-negative number/);
    rejects({ rules: { 'size/file': ['error', { max: 1.5 }] } }, /max must be an integer/);
    rejects({ overrides: {} }, /"overrides" must be an array/);
    rejects({ overrides: [{ rules: {} }] }, /overrides\[0\]\.files" must be a non-empty array/);
    rejects({ overrides: [{ files: ['x'], rule: {} }] }, /Unknown property "overrides\[0\]\.rule"/);
    rejects({ overrides: [{ files: ['x'], rules: { nope: 'off' } }] }, /Unknown rule "nope" in "overrides\[0\]\.rules"/);
  });
});

describe('config loading and resolution', () => {
  it('uses defaults without a file', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'qualint-'));
    const loaded = await loadConfig({ cwd: dir });
    assert.equal(loaded.configPath, null);
    const rules = resolveRulesForFile(loaded, path.join(dir, 'a.ts'));
    assert.deepEqual(rules.get('complexity/cyclomatic'), { severity: 'error', options: { max: 20 } });
    assert.equal(rules.has('complexity/halstead-difficulty'), false);
  });

  it('applies a configured preset to every rule not set explicitly', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'qualint-'));
    await fs.writeFile(path.join(dir, '.qualintrc.yaml'), 'preset: relaxed\nrules:\n  size/parameters: [error, { max: 4 }]\n');
    const loaded = await loadConfig({ cwd: dir });
    const rules = resolveRulesForFile(loaded, path.join(dir, 'a.ts'));
    assert.deepEqual(rules.get('complexity/cyclomatic'), { severity: 'error', options: { max: 30 } });
    assert.deepEqual(rules.get('size/function'), { severity: 'error', options: { max: 200 } });
    assert.deepEqual(rules.get('size/parameters'), { severity: 'error', options: { max: 4 } });
  });

  it('searches upward and applies overrides relative to the config directory', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'qualint-'));
    const nested = path.join(root, 'packages', 'api', 'src');
    await fs.mkdir(nested, { recursive: true });
    await fs.writeFile(
      path.join(root, '.qualintrc.json'),
      JSON.stringify({
        rules: { 'size/function': ['warn', { max: 40 }], 'complexity/halstead-difficulty': 'error' },
        overrides: [
          { files: ['**/*.test.*'], rules: { 'size/function': ['error'], 'size/file': 'off' } },
          { files: ['packages/api/**'], rules: { 'complexity/nesting': ['error', { max: 3 }] } },
        ],
      }),
    );
    const loaded = await loadConfig({ cwd: nested });
    assert.equal(loaded.configPath, path.join(root, '.qualintrc.json'));
    assert.equal(loaded.baseDir, root);

    const plain = resolveRulesForFile(loaded, path.join(nested, 'a.ts'));
    assert.deepEqual(plain.get('size/function'), { severity: 'warn', options: { max: 40 } });
    assert.deepEqual(plain.get('complexity/halstead-difficulty'), { severity: 'error', options: { max: 30 } });
    assert.deepEqual(plain.get('complexity/nesting'), { severity: 'error', options: { max: 3 } });
    assert.equal(plain.has('size/file'), true);

    const test = resolveRulesForFile(loaded, path.join(nested, 'a.test.ts'));
    // An override replaces the whole value: max falls back to the rule default, not to 40.
    assert.deepEqual(test.get('size/function'), { severity: 'error', options: { max: 120 } });
    assert.equal(test.has('size/file'), false);

    const elsewhere = resolveRulesForFile(loaded, path.join(root, 'packages', 'web', 'a.ts'));
    assert.deepEqual(elsewhere.get('complexity/nesting'), { severity: 'error', options: { max: 5 } });
  });

  it('reads YAML with comments and prefers it over JSON in the same directory', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'qualint-'));
    await fs.writeFile(
      path.join(dir, '.qualintrc.yaml'),
      ['# project limits', 'include:', '  - src/**/*', 'rules:', '  size/function: [warn, { max: 80 }]  # tests are long', '  size/file: off', ''].join('\n'),
    );
    await fs.writeFile(path.join(dir, '.qualintrc.json'), JSON.stringify({ rules: { 'size/file': 'error' } }));
    const loaded = await loadConfig({ cwd: dir });
    assert.equal(loaded.configPath, path.join(dir, '.qualintrc.yaml'));
    assert.deepEqual(loaded.config.include, ['src/**/*']);
    const rules = resolveRulesForFile(loaded, path.join(dir, 'src', 'a.ts'));
    assert.deepEqual(rules.get('size/function'), { severity: 'warn', options: { max: 80 } });
    assert.equal(rules.has('size/file'), false);
  });

  it('treats an empty YAML file as an empty configuration', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'qualint-'));
    await fs.writeFile(path.join(dir, '.qualintrc.yml'), '# nothing yet\n');
    const loaded = await loadConfig({ cwd: dir });
    assert.equal(loaded.configPath, path.join(dir, '.qualintrc.yml'));
    assert.equal(loaded.config.include, null);
  });

  it('reports unreadable and malformed files as configuration errors', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'qualint-'));
    await assert.rejects(loadConfig({ cwd: dir, explicitPath: 'missing.yaml' }), ConfigError);
    await fs.writeFile(path.join(dir, 'bad.yaml'), 'rules:\n  - [oops\n');
    await assert.rejects(loadConfig({ cwd: dir, explicitPath: 'bad.yaml' }), /not valid YAML: .* at line 3, column 1/);
    await fs.writeFile(path.join(dir, 'bad.json'), '{ not json');
    await assert.rejects(loadConfig({ cwd: dir, explicitPath: 'bad.json' }), /not valid YAML/);
  });
});
