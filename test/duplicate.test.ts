import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { duplicateFunctionRule } from '../src/rules/duplicate/function.ts';
import type { ProjectFile } from '../src/rules/registry.ts';
import type { RuleOptions } from '../src/types.ts';
import { metricsOf } from './helpers.ts';

/** A function big enough to clear any sensible minimum size. */
const shaped = (name: string, threshold: string, message: string): string => `
export function ${name}(input) {
  const errors = [];
  if (!input.id) { errors.push('${message}'); }
  if (input.qty < ${threshold}) { errors.push('${message}'); }
  for (const tag of input.tags) {
    if (tag.length > ${threshold}) { errors.push(tag); }
  }
  return errors;
}
`;

const project = (files: Record<string, string>): ProjectFile[] =>
  Object.entries(files).map(([path, code]) => ({ path, metrics: metricsOf(code, path) }));

const check = (files: Record<string, string>, options: Partial<RuleOptions> = {}) =>
  duplicateFunctionRule.checkProject!(project(files), { max: 1, minSize: 20, ...options });

const hashOf = (code: string): string => metricsOf(code, 'a.ts').functions[0]!.structure.hash;

describe('duplicate/function fingerprinting', () => {
  it('ignores the things a copy-paste changes', () => {
    assert.equal(hashOf(shaped('a', '1', 'x')), hashOf(shaped('b', '99', 'totally different text')));
    assert.equal(hashOf('function f(a: number): string { return String(a); }'), hashOf('function g(b) { return String(b); }'));
    assert.equal(hashOf('function f(a) { return (a as Foo)!; }'), hashOf('function g(b) { return b; }'));
    assert.equal(hashOf('function f<T>(a: T[]): T { return a[0]!; }'), hashOf('function g(a) { return a[0]; }'));
  });

  it('keeps the things that change behaviour', () => {
    const base = 'function f(a, b) { return a + b; }';
    assert.notEqual(hashOf(base), hashOf('function f(a, b) { return a - b; }'));
    assert.notEqual(hashOf('function f() { const a = 1; }'), hashOf('function f() { let a = 1; }'));
    assert.notEqual(hashOf('function f(a) { return a.b; }'), hashOf('function f(a) { return a?.b; }'));
    assert.notEqual(hashOf('function f(a) { return a.b; }'), hashOf('function f(a) { return a[b]; }'));
    assert.notEqual(hashOf(base), hashOf('function f(a, b) { if (a) { return b; } return a; }'));
  });

  it('includes nested functions in their parent', () => {
    const withCallback = (op: string) => `function f(xs) { return xs.map((x) => x ${op} 1); }`;
    assert.notEqual(hashOf(withCallback('+')), hashOf(withCallback('-')));
  });
});

describe('duplicate/function reporting', () => {
  it('reports one diagnostic per group, on the first occurrence', () => {
    const drafts = check({
      'src/a.ts': shaped('validateOrder', '1', 'bad'),
      'src/b.ts': shaped('validateCart', '5', 'nope'),
      'src/c.ts': shaped('validateBasket', '9', 'other'),
    });
    assert.equal(drafts.length, 1);
    assert.equal(drafts[0]!.path, 'src/a.ts');
    assert.equal(drafts[0]!.entity, 'validateOrder');
    assert.equal(drafts[0]!.value, 3);
    assert.equal(drafts[0]!.message, 'Function `validateOrder` is one of 3 identical implementations; maximum is 1');
    assert.equal(drafts[0]!.detail, 'also at src/b.ts:2 validateCart, src/c.ts:2 validateBasket');
  });

  it('names only the first few other locations', () => {
    const files = Object.fromEntries(Array.from({ length: 7 }, (_, i) => [`src/f${i}.ts`, shaped(`fn${i}`, '1', 'x')]));
    const drafts = check(files);
    assert.equal(drafts[0]!.value, 7);
    assert.match(drafts[0]!.detail!, /^also at src\/f1\.ts:2 fn1, src\/f2\.ts:2 fn2, src\/f3\.ts:2 fn3, and 3 more$/);
  });

  it('says nothing about functions that differ, or that appear once', () => {
    assert.deepEqual(check({ 'src/a.ts': shaped('a', '1', 'x'), 'src/b.ts': 'export function b(q) { return q * 2; }' }), []);
  });

  it('ignores structures smaller than minSize', () => {
    const files = { 'src/a.ts': 'export const a = (x) => x + 1;', 'src/b.ts': 'export const b = (y) => y + 2;' };
    assert.equal(check(files, { minSize: 5 }).length, 1);
    assert.deepEqual(check(files, { minSize: 60 }), []);
  });

  it('allows more copies when max is raised', () => {
    const files = { 'src/a.ts': shaped('a', '1', 'x'), 'src/b.ts': shaped('b', '2', 'y') };
    assert.equal(check(files, { max: 1 }).length, 1);
    assert.deepEqual(check(files, { max: 2 }), []);
  });

  it('reports the outer function, not the callbacks it duplicates too', () => {
    const outer = (name: string) => `
export function ${name}(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (seen.has(item.id)) { return false; }
    seen.add(item.id);
    return true;
  });
}
`;
    const drafts = check({ 'src/a.ts': outer('dedupeOrders'), 'src/b.ts': outer('dedupeCarts') });
    assert.equal(drafts.length, 1);
    assert.equal(drafts[0]!.entity, 'dedupeOrders');
  });

  it('finds duplicates inside a single file', () => {
    const drafts = check({ 'src/a.ts': `${shaped('one', '1', 'x')}${shaped('two', '2', 'y')}` });
    assert.equal(drafts.length, 1);
    assert.equal(drafts[0]!.value, 2);
  });

  it('orders diagnostics by path and line', () => {
    const drafts = check({
      'src/z.ts': `${shaped('z1', '1', 'x')}${shaped('z2', '2', 'y')}`,
      'src/a.ts': 'export function q(n) { return n > 1 ? n * 2 : n - 2; }\nexport function r(m) { return m > 5 ? m * 3 : m - 3; }\n',
    }, { minSize: 10 });
    assert.deepEqual(drafts.map((d) => d.path), ['src/a.ts', 'src/z.ts']);
  });
});
