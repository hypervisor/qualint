import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { body, firstFunction, metricsOf } from './helpers.ts';

describe('complexity/cyclomatic', () => {
  it('starts at 1 for an empty function', () => {
    assert.equal(firstFunction('function f() {}').cyclomaticComplexity, 1);
  });

  it('counts if but not else', () => {
    assert.equal(body('if (a) {} else {}').cyclomaticComplexity, 2);
  });

  it('counts every branch of an if / else if / else chain', () => {
    assert.equal(body('if (a) {} else if (b) {} else {}').cyclomaticComplexity, 3);
  });

  it('counts every loop form once', () => {
    const fn = body('for (const x of xs) {} for (let i = 0; i < 1; i++) {} for (const k in xs) {} while (a) {} do {} while (b)');
    assert.equal(fn.cyclomaticComplexity, 6);
  });

  it('counts catch but not try or finally', () => {
    assert.equal(body('try {} catch {} finally {}').cyclomaticComplexity, 2);
  });

  it('counts conditional expressions', () => {
    assert.equal(body('return a ? 1 : 2;').cyclomaticComplexity, 2);
  });

  it('counts non-default switch cases only', () => {
    assert.equal(body('switch (a) { case 1: case 2: break; default: }').cyclomaticComplexity, 3);
  });

  it('counts &&, || and ??', () => {
    assert.equal(body('return (a && b) || (c ?? d);').cyclomaticComplexity, 4);
  });

  it('counts logical assignments', () => {
    assert.equal(body('a &&= 1; b ||= 2; c ??= 3;').cyclomaticComplexity, 4);
  });

  it('counts each optional-chain segment', () => {
    assert.equal(body('return a?.y?.z?.();').cyclomaticComplexity, 4);
  });

  it('counts parameter and destructuring defaults', () => {
    const fn = firstFunction('function f(x = 1, { y = 2 } = {}) { const { z = 3 } = x; }');
    assert.equal(fn.cyclomaticComplexity, 5);
  });

  it('does not count nested function bodies in the enclosing function', () => {
    const metrics = metricsOf('function outer(x) { const f = (y) => y ? 1 : 2; if (x) {} }');
    assert.equal(metrics.functions[0]!.name, 'outer');
    assert.equal(metrics.functions[0]!.cyclomaticComplexity, 2);
    assert.equal(metrics.functions[1]!.name, 'f');
    assert.equal(metrics.functions[1]!.cyclomaticComplexity, 2);
  });

  it('ignores TypeScript-only syntax', () => {
    const fn = firstFunction('function f(x: number | string, y?: string): number { return (x as number)! satisfies number; }');
    assert.equal(fn.cyclomaticComplexity, 1);
  });
});
