import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { body, bodyTsx, firstFunction, metricsOf } from './helpers.ts';

describe('size/statements', () => {
  it('counts a declaration once regardless of declarators', () => {
    assert.equal(body('let x = 1, y = 2;').statementCount, 1);
  });

  it('counts a nested function declaration once and excludes its body', () => {
    const metrics = metricsOf('function outer() { function inner() { x(); y(); } inner(); }');
    assert.equal(metrics.functions[0]!.statementCount, 2);
    assert.equal(metrics.functions[1]!.statementCount, 2);
  });

  it('ignores type-only declarations', () => {
    assert.equal(body('type T = 1; interface I {} declare const q: number;').statementCount, 0);
  });

  it('does not count loop-head declarations or else if', () => {
    assert.equal(body('for (const x of xs) { x(); }').statementCount, 2);
    assert.equal(body('for (let i = 0; i < 1; i++) {}').statementCount, 1);
    assert.equal(body('if (a) {} else if (b) {}').statementCount, 1);
  });

  it('counts statements inside branches, cases and try blocks', () => {
    assert.equal(body('if (a) { x(); } else { y(); }').statementCount, 3);
    assert.equal(body('switch (a) { case 1: x(); break; }').statementCount, 3);
    assert.equal(body('try { x(); } catch { y(); } finally { z(); }').statementCount, 4);
  });

  it('does not count JSX nodes as statements', () => {
    assert.equal(bodyTsx('return <div>{a}<b /><c>{b ? <d /> : null}</c></div>;').statementCount, 1);
  });

  it('counts a class declaration once; its methods are separate functions', () => {
    const metrics = metricsOf('function outer() { class A { m() { x(); y(); } } return A; }');
    assert.equal(metrics.functions[0]!.statementCount, 2);
    assert.equal(metrics.functions[1]!.name, 'A.m');
    assert.equal(metrics.functions[1]!.statementCount, 2);
  });
});

describe('size/parameters', () => {
  it('counts destructured, defaulted and rest parameters once each', () => {
    assert.equal(firstFunction('function f(a, b = 1, { c }, [d], ...e) {}').parameterCount, 5);
  });

  it('ignores the TypeScript this parameter', () => {
    assert.equal(firstFunction('function f(this: Foo, a: number) {}').parameterCount, 1);
  });

  it('counts constructor parameter properties', () => {
    assert.equal(firstFunction('class A { constructor(private a: number, b?: string) {} }').parameterCount, 2);
  });

  it('counts arrow parameters', () => {
    const metrics = metricsOf('const a = (x) => x; const b = (x, y) => x; const c = () => 1;');
    assert.deepEqual(metrics.functions.map((fn) => fn.parameterCount), [1, 2, 0]);
  });
});
