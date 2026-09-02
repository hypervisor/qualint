import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { deriveHalstead } from '../src/analysis/halstead.ts';
import { firstFunction, functionNamed } from './helpers.ts';

const counts = (code: string, filePath = 'fixture.ts') => {
  const { distinctOperators, distinctOperands, totalOperators, totalOperands } = firstFunction(code, filePath).halstead;
  return { n1: distinctOperators, n2: distinctOperands, N1: totalOperators, N2: totalOperands };
};

describe('halstead', () => {
  it('classifies keywords and arithmetic as operators and names as operands', () => {
    const fn = firstFunction('function add(a, b) { return a + b; }');
    assert.deepEqual(counts('function add(a, b) { return a + b; }'), { n1: 3, n2: 3, N1: 3, N2: 5 });
    assert.equal(fn.halstead.vocabulary, 6);
    assert.equal(fn.halstead.length, 8);
    assert.ok(Math.abs(fn.halstead.volume - 8 * Math.log2(6)) < 1e-9);
    assert.ok(Math.abs(fn.halstead.difficulty - 2.5) < 1e-9);
    assert.ok(Math.abs(fn.halstead.effort - 2.5 * 8 * Math.log2(6)) < 1e-9);
  });

  it('ignores type annotations, assertions, generics and non-null operators', () => {
    assert.deepEqual(
      counts('function add<T>(a: number, b?: number): number { return (a as number) + b!; }'),
      counts('function add(a, b) { return a + b; }'),
    );
  });

  it('counts call parentheses, member access and index brackets as operators', () => {
    assert.deepEqual(counts('function f(o) { o.g(1); }'), { n1: 3, n2: 4, N1: 3, N2: 5 });
    assert.deepEqual(counts('function f(o) { o[1]; }'), { n1: 2, n2: 3, N1: 2, N2: 4 });
  });

  it('counts an optional call as a single ?. operator', () => {
    assert.deepEqual(counts('function f(o) { o?.g?.(1); }'), { n1: 2, n2: 4, N1: 3, N2: 5 });
  });

  it('counts array and object literals as operators and ignores delimiters', () => {
    assert.deepEqual(counts('function f() { return [1, { a: 2 }]; }'), { n1: 4, n2: 4, N1: 4, N2: 4 });
  });

  it('treats JSX names and text as operands and JSX delimiters as nothing', () => {
    assert.deepEqual(counts('function f(name) { return <div className="x">hi {name}</div>; }', 'f.tsx'), { n1: 2, n2: 6, N1: 2, N2: 8 });
  });

  it('excludes nested function bodies from the enclosing function', () => {
    assert.deepEqual(counts('function f() { const g = () => a + b; return g; }'), { n1: 4, n2: 2, N1: 4, N2: 3 });
  });

  it('ignores TypeScript modifiers and includes method keys', () => {
    const method = functionNamed('class A { private readonly x = 1; m() { return this.x; } }', 'A.m');
    assert.equal(method.halstead.distinctOperators, 2);
    assert.equal(method.halstead.totalOperators, 2);
    assert.equal(method.halstead.distinctOperands, 3);
    assert.equal(method.halstead.totalOperands, 3);
  });

  it('treats template parts as operands', () => {
    assert.deepEqual(counts('function f(a) { return `x${a}y`; }'), { n1: 2, n2: 4, N1: 2, N2: 5 });
  });

  it('ignores comments', () => {
    assert.deepEqual(counts('function f(a) { /* a + b */ return a; // c\n }'), { n1: 2, n2: 2, N1: 2, N2: 3 });
  });

  it('returns zeros instead of NaN when vocabulary is empty', () => {
    const empty = deriveHalstead(0, 0, 0, 0);
    assert.equal(empty.volume, 0);
    assert.equal(empty.difficulty, 0);
    assert.equal(empty.effort, 0);
    assert.equal(deriveHalstead(2, 0, 2, 0).difficulty, 0);
  });
});
