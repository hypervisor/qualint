import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { metricsOf } from './helpers.ts';

const names = (code: string, filePath = 'fixture.tsx'): string[] => metricsOf(code, filePath).functions.map((fn) => fn.name);

describe('function naming', () => {
  it('names declarations, default exports and variables', () => {
    assert.deepEqual(names('function foo() {}\nexport default function () {}'), ['foo', 'default']);
    assert.deepEqual(names('const bar = () => {};\nconst baz = function named() {};\nexport default () => {};'), ['bar', 'named', 'default']);
  });

  it('names assignment targets', () => {
    assert.deepEqual(names('obj.handler = function () {};\nthis.x = () => {};'), ['obj.handler', 'this.x']);
  });

  it('names object members', () => {
    assert.deepEqual(names('const o = { handler() {}, other: () => {}, get v() { return 1; } };'), ['handler', 'other', 'get v']);
  });

  it('qualifies class members with the class name', () => {
    const code = 'class A {\n  constructor() {}\n  m() {}\n  static s() {}\n  get g() { return 1; }\n  set g(v) {}\n  #p() {}\n  prop = () => {};\n}\nconst B = class { m() {} };';
    assert.deepEqual(names(code), ['A.constructor', 'A.m', 'A.s', 'get A.g', 'set A.g', 'A.#p', 'A.prop', 'B.m']);
  });

  it('names callbacks after their callee', () => {
    assert.deepEqual(names('items.map((x) => x);\nsetTimeout(() => {});\nfoo(bar(() => {}));\n["a"].forEach(function () {});'), [
      'items.map callback',
      'setTimeout callback',
      'bar callback',
      'callback',
    ]);
  });

  it('names JSX attribute handlers and default parameter values', () => {
    assert.deepEqual(names('const el = <div onClick={() => {}} />;\nfunction f(cb = () => {}) {}'), ['onClick', 'f', 'cb']);
  });

  it('falls back to a positional anonymous name', () => {
    assert.deepEqual(names('(() => {})();\nexport const x = [function () {}];'), ['<anonymous at 1:2>', '<anonymous at 2:19>']);
  });
});
