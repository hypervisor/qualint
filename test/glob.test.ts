import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { literalPrefix, matchesGlob, toPosixPath } from '../src/files/glob.ts';

describe('glob matching', () => {
  it('matches ** across any number of segments', () => {
    assert.equal(matchesGlob('**/node_modules/**', 'a/node_modules/b.js'), true);
    assert.equal(matchesGlob('**/node_modules/**', 'node_modules/b.js'), true);
    assert.equal(matchesGlob('**/node_modules/**', 'a/nodemodules/b.js'), false);
    assert.equal(matchesGlob('src/**/*', 'src/a.ts'), true);
    assert.equal(matchesGlob('src/**/*', 'src/a/b/c.ts'), true);
    assert.equal(matchesGlob('src/**/*', 'lib/a.ts'), false);
    assert.equal(matchesGlob('src/**', 'src/a/b.ts'), true);
  });

  it('keeps * within a segment', () => {
    assert.equal(matchesGlob('src/*.ts', 'src/a.ts'), true);
    assert.equal(matchesGlob('src/*.ts', 'src/a/b.ts'), false);
    assert.equal(matchesGlob('**/*.d.ts', 'x/y.d.ts'), true);
    assert.equal(matchesGlob('**/*.d.ts', 'x/y.ts'), false);
    assert.equal(matchesGlob('**/*.generated.*', 'a/b.generated.ts'), true);
  });

  it('matches slash-free patterns against the basename at any depth', () => {
    assert.equal(matchesGlob('*.test.*', 'a/b/c.test.ts'), true);
    assert.equal(matchesGlob('*.test.*', 'c.test.ts'), true);
    assert.equal(matchesGlob('*.test.*', 'a/test.ts'), false);
  });

  it('supports alternation, classes, ?, hidden directories and trailing slashes', () => {
    assert.equal(matchesGlob('{apps,packages}/**', 'apps/x.ts'), true);
    assert.equal(matchesGlob('{apps,packages}/**', 'packages/x.ts'), true);
    assert.equal(matchesGlob('{apps,packages}/**', 'libs/x.ts'), false);
    assert.equal(matchesGlob('src/[ab].ts', 'src/a.ts'), true);
    assert.equal(matchesGlob('src/[!ab].ts', 'src/a.ts'), false);
    assert.equal(matchesGlob('src/?.ts', 'src/a.ts'), true);
    assert.equal(matchesGlob('**/.*/**', '.git/x.ts'), true);
    assert.equal(matchesGlob('**/.*/**', 'a/.cache/x.ts'), true);
    assert.equal(matchesGlob('**/.*/**', 'a/cache/x.ts'), false);
    assert.equal(matchesGlob('src/', 'src/a.ts'), true);
    assert.equal(matchesGlob('./src/**', 'src/a.ts'), true);
  });

  it('extracts literal prefixes for traversal roots', () => {
    assert.equal(literalPrefix('src/**/*'), 'src');
    assert.equal(literalPrefix('apps/*/src/**'), 'apps');
    assert.equal(literalPrefix('**/*.ts'), '');
    assert.equal(literalPrefix('src/lib/a.ts'), 'src/lib');
  });

  it('normalizes Windows separators', () => {
    assert.equal(toPosixPath('src\\lib\\a.ts'), 'src/lib/a.ts');
  });
});
