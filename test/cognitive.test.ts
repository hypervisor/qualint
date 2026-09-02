import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { body, metricsOf } from './helpers.ts';

describe('complexity/cognitive', () => {
  it('penalizes nesting incrementally', () => {
    assert.equal(body('if (a) { if (b) { if (c) {} } }').cognitiveComplexity, 6);
  });

  it('charges else if and else one each without nesting penalty', () => {
    assert.equal(body('if (a) {} else if (b) {} else {}').cognitiveComplexity, 3);
  });

  it('charges one per sequence of identical logical operators', () => {
    assert.equal(body('return a && b && c;').cognitiveComplexity, 1);
    assert.equal(body('return a && b || c;').cognitiveComplexity, 2);
    assert.equal(body('return a || b && c;').cognitiveComplexity, 2);
    assert.equal(body('return a && (b || c) && d;').cognitiveComplexity, 2);
    assert.equal(body('return a ?? b ?? c;').cognitiveComplexity, 1);
  });

  it('nests loops', () => {
    assert.equal(body('for (const x of xs) { while (a) {} }').cognitiveComplexity, 3);
  });

  it('charges switch as a whole and nests its cases', () => {
    assert.equal(body('if (a) { switch (b) { case 1: break; case 2: break; } }').cognitiveComplexity, 3);
    assert.equal(body('switch (a) { case 1: if (b) {} }').cognitiveComplexity, 3);
  });

  it('charges catch and nests its body', () => {
    assert.equal(body('try {} catch (e) { if (e) {} }').cognitiveComplexity, 3);
  });

  it('charges conditional expressions with nesting', () => {
    assert.equal(body('if (a) { const y = b ? 1 : 2; }').cognitiveComplexity, 3);
    assert.equal(body('return a ? b ? 1 : 2 : 3;').cognitiveComplexity, 3);
  });

  it('charges labeled break and continue', () => {
    assert.equal(body('outer: for (const x of xs) { for (const y of xs) { if (y) break outer; continue outer; } }').cognitiveComplexity, 8);
  });

  it('does not charge guard returns, plain break, optional chaining, try or finally', () => {
    assert.equal(body('if (a) return; for (;;) { break; } try {} finally {} return a?.b?.c;').cognitiveComplexity, 2);
  });

  it('scores nested functions separately and restarts their nesting', () => {
    const metrics = metricsOf('function outer(x, xs) { if (x) { xs.forEach((y) => { if (y) {} }); } }');
    assert.equal(metrics.functions[0]!.cognitiveComplexity, 1);
    assert.equal(metrics.functions[1]!.cognitiveComplexity, 1);
  });

  it('exposes an explainable contribution ledger', () => {
    const fn = body('if (a) {\n  for (const x of xs) {\n    if (b && c) {}\n  }\n} else {}');
    assert.deepEqual(
      fn.cognitiveContributions.map((c) => [`${c.location.line}:${c.location.column}`, c.construct, c.base, c.nesting, c.total]),
      [
        ['2:1', 'if', 1, 0, 1],
        ['3:3', 'for-of', 1, 1, 3],
        ['4:5', 'if', 1, 2, 6],
        ['4:9', '&&', 1, 0, 7],
        ['6:8', 'else', 1, 0, 8],
      ],
    );
    assert.equal(fn.cognitiveComplexity, 8);
  });
});
