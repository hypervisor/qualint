import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { body, firstFunction, metricsOf } from './helpers.ts';

const npath = (statements: string): bigint => body(statements).npathComplexity;

describe('complexity/npath', () => {
  it('is 1 for straight-line code', () => {
    assert.equal(npath(''), 1n);
    assert.equal(npath('x(); y(); const z = 1;'), 1n);
  });

  it('adds if branches and multiplies sequential ifs', () => {
    assert.equal(npath('if (a) {}'), 2n);
    assert.equal(npath('if (a) {} else {}'), 2n);
    assert.equal(npath('if (a) {} if (b) {} if (c) {}'), 8n);
    assert.equal(npath(Array.from({ length: 10 }, (_, i) => `if (xs[${i}]) {}`).join('\n')), 1024n);
  });

  it('adds short-circuit paths of the test to the construct', () => {
    assert.equal(npath('if (a && b) {}'), 3n);
    assert.equal(npath('if (a && b) {} else {}'), 3n);
    assert.equal(npath('if (a || b || c) {}'), 4n);
    assert.equal(npath('while (a && b) {}'), 3n);
    assert.equal(npath('return a && b ? 1 : 2;'), 3n);
  });

  it('gives loops one skip path plus the body paths', () => {
    assert.equal(npath('while (a) {}'), 2n);
    assert.equal(npath('for (;;) {}'), 2n);
    assert.equal(npath('for (const x of xs) {}'), 2n);
    assert.equal(npath('for (const k in xs) {}'), 2n);
    assert.equal(npath('do {} while (a)'), 2n);
    assert.equal(npath('for (let i = a ? 0 : 1; ; ) {}'), 3n);
    assert.equal(npath('for (const x of xs) { if (a) {} }'), 3n);
  });

  it('sums conditional branches and logical operands', () => {
    assert.equal(npath('return a ? 1 : 2;'), 2n);
    assert.equal(npath('return a ? b ? 1 : 2 : 3;'), 3n);
    assert.equal(npath('a = b && c;'), 2n);
    assert.equal(npath('a = b && c && d;'), 3n);
    assert.equal(npath('a = (b || c) && (d || e);'), 4n);
    assert.equal(npath('a ||= b;'), 2n);
    assert.equal(npath('f(a && b, c && d);'), 4n);
  });

  it('handles switch with default, no default and fall-through', () => {
    assert.equal(npath('switch (a) { case 1: x(); break; case 2: y(); break; }'), 3n);
    assert.equal(npath('switch (a) { case 1: x(); break; case 2: y(); break; default: z(); }'), 3n);
    assert.equal(npath('switch (a) { case 1: if (b) {} case 2: y(); break; default: z(); }'), 4n);
    assert.equal(npath('switch (a ? b : c) { case 1: break; default: }'), 4n);
  });

  it('stops multiplying after abrupt completion', () => {
    assert.equal(npath('if (a) { return; } if (b) {} if (c) {}'), 5n);
    assert.equal(npath('if (a) { return 1; } else { return 2; } x(); if (b) {}'), 2n);
    assert.equal(npath('if (a) throw new Error(); if (b) {}'), 3n);
    assert.equal(npath('return a ? 1 : 2;'), 2n);
  });

  it('folds break and continue back into their loop', () => {
    assert.equal(npath('for (;;) { if (a) break; x(); } if (b) {}'), 6n);
    assert.equal(npath('for (;;) { if (a) continue; x(); }'), 3n);
    assert.equal(npath('outer: for (;;) { for (;;) { if (a) break outer; } }'), 4n);
    assert.equal(npath('block: { if (a) break block; x(); } if (b) {}'), 4n);
  });

  it('treats try and catch as alternatives that all pass through finally', () => {
    assert.equal(npath('try { x(); } catch { y(); }'), 2n);
    assert.equal(npath('try { if (a) {} } catch { if (b) {} } finally { if (c) {} }'), 8n);
    assert.equal(npath('try { return a; } catch {} finally { x(); }'), 2n);
    assert.equal(npath('try { x(); } finally { if (a) {} }'), 2n);
  });

  it('counts nested functions as a single path', () => {
    assert.equal(npath('xs.map((x) => (x ? 1 : 2)); if (a) {}'), 2n);
    assert.equal(firstFunction('const f = (a) => (a ? 1 : 2);').npathComplexity, 2n);
  });

  it('exceeds the safe integer range exactly', () => {
    const fn = body(Array.from({ length: 60 }, (_, i) => `if (xs[${i}]) {}`).join('\n'));
    assert.equal(fn.npathComplexity, 2n ** 60n);
    assert.equal(fn.npathComplexity.toString(), '1152921504606846976');
    assert.ok(fn.npathComplexity > BigInt(Number.MAX_SAFE_INTEGER));
  });

  it('ignores TypeScript-only syntax', () => {
    const metrics = metricsOf('function f(a: number): number { type T = 1; return (a as number)!; }');
    assert.equal(metrics.functions[0]!.npathComplexity, 1n);
  });
});
