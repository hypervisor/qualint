import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { runRules } from '../src/rules/registry.ts';
import { defaultRuleSettings } from '../src/config/defaults.ts';
import type { ResolvedRules } from '../src/types.ts';
import { body, bodyTsx, metricsOf } from './helpers.ts';

const complexities = (statements: string): number[] => body(statements).conditions.map((group) => group.complexity);

describe('complexity/condition', () => {
  it('scores the examples from the design document', () => {
    assert.deepEqual(complexities('if (a) {}'), [1]);
    assert.deepEqual(complexities('if (a && b && c) {}'), [3]);
    assert.deepEqual(complexities('if (a && (b || c) && d) {}'), [4]);
    assert.deepEqual(complexities('const value = a ? b : c ? d : e;'), [2]);
    assert.deepEqual(bodyTsx('return ready && <Panel />;').conditions.map((g) => g.complexity), [2]);
  });

  it('scores loop tests', () => {
    assert.deepEqual(complexities('while (a || b) {}'), [2]);
    assert.deepEqual(complexities('for (; a && b; ) {}'), [2]);
    assert.deepEqual(complexities('do {} while (a && b)'), [2]);
  });

  it('folds nested logical and conditional nodes into the outermost group', () => {
    assert.deepEqual(complexities('if (f(a && b) || c) {}'), [3]);
    assert.deepEqual(complexities('const v = a ?? b ?? c;'), [3]);
    assert.deepEqual(complexities('const v = a && b ? c : d;'), [2]);
    assert.deepEqual(complexities('if (a ? b : c) {}'), [2]);
  });

  it('keeps nested-function conditions in the nested function', () => {
    const metrics = metricsOf('function outer(xs) { if (xs.some((x) => x.a && x.b)) {} }');
    assert.deepEqual(metrics.functions[0]!.conditions.map((g) => g.complexity), [1]);
    assert.deepEqual(metrics.functions[1]!.conditions.map((g) => g.complexity), [2]);
  });

  it('records module-level condition groups', () => {
    const metrics = metricsOf('declare const a: boolean, b: boolean;\nif (a && b && a && b && a && b) {}\n');
    assert.deepEqual(metrics.moduleConditions, [{ location: { line: 2, column: 5 }, complexity: 6 }]);
  });

  it('reports every group over the limit, pointing at the group', () => {
    const metrics = metricsOf('function f(a, b, c, d, e, g) {\n  if (a && b && c && d && e && g) {}\n  const v = a || b || c || d || e || g;\n  if (a) {}\n}\n');
    const rules: ResolvedRules = new Map([...defaultRuleSettings()].flatMap(([id, s]) => (s === 'off' ? [] : [[id, s] as const])));
    const diagnostics = runRules(metrics, rules).filter((d) => d.rule === 'complexity/condition');
    assert.deepEqual(
      diagnostics.map((d) => [d.location.line, d.location.column, d.value, d.entity, d.message]),
      [
        [2, 7, 6, 'f', 'Condition in `f` has complexity 6; maximum is 5'],
        [3, 13, 6, 'f', 'Condition in `f` has complexity 6; maximum is 5'],
      ],
    );
    assert.equal(metrics.functions[0]!.maximumConditionComplexity, 6);
  });
});
