import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { body, metricsOf } from './helpers.ts';

describe('complexity/nesting', () => {
  it('reports the depth and the location of the deepest construct', () => {
    const fn = body('if (a) {\n  if (b) {\n    if (c) {\n      if (d) {\n        if (e) {}\n      }\n    }\n  }\n}');
    assert.equal(fn.maximumNestingDepth, 5);
    assert.deepEqual(fn.maximumNestingLocation, { line: 6, column: 9 });
  });

  it('treats else if as a continuation of the chain', () => {
    assert.equal(body('if (a) {} else if (b) { if (c) {} }').maximumNestingDepth, 2);
    assert.equal(body('if (a) {} else if (b) {} else if (c) {} else {}').maximumNestingDepth, 1);
  });

  it('counts the else branch at the same depth as the if body', () => {
    const fn = body('if (a) {} else { for (;;) {} }');
    assert.equal(fn.maximumNestingDepth, 2);
    assert.deepEqual(fn.maximumNestingLocation, { line: 2, column: 18 });
  });

  it('counts try, catch and finally bodies', () => {
    assert.equal(body('try { if (a) {} } catch {} finally {}').maximumNestingDepth, 2);
    assert.equal(body('try {} catch { if (a) {} } finally {}').maximumNestingDepth, 2);
    assert.equal(body('try {} catch {} finally { if (a) {} }').maximumNestingDepth, 2);
  });

  it('counts switch and conditional expressions', () => {
    assert.equal(body('switch (a) { case 1: if (b) {} }').maximumNestingDepth, 2);
    assert.equal(body('return a ? (b ? 1 : 2) : 3;').maximumNestingDepth, 2);
  });

  it('does not count plain blocks, classes or JSX', () => {
    assert.equal(body('{ { if (a) {} } }').maximumNestingDepth, 1);
  });

  it('restarts at zero inside nested functions', () => {
    const metrics = metricsOf('function outer(a, xs) { if (a) { xs.map((x) => { if (x) { if (x) {} } }); } }');
    assert.equal(metrics.functions[0]!.maximumNestingDepth, 1);
    assert.equal(metrics.functions[1]!.maximumNestingDepth, 2);
  });

  it('is zero with no location for flat functions', () => {
    const fn = body('return a;');
    assert.equal(fn.maximumNestingDepth, 0);
    assert.equal(fn.maximumNestingLocation, null);
  });
});
