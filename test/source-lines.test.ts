import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { firstFunction, metricsOf } from './helpers.ts';

describe('source lines', () => {
  it('matches the design document example', () => {
    const metrics = metricsOf('// ignored\n\nfunction answer() {  // counted\n  /* comment */      // ignored\n  return 42;         // counted\n}                    // counted\n');
    assert.equal(metrics.physicalLines, 6);
    assert.equal(metrics.sourceLines, 3);
    assert.equal(metrics.blankLines, 1);
    assert.equal(metrics.commentOnlyLines, 2);
    assert.equal(metrics.functions[0]!.sourceLines, 3);
  });

  it('keeps comment-like text inside strings and templates', () => {
    const metrics = metricsOf('const s = "// not a comment";\nconst t = `/* not\n a comment */`;\nconst r = /\\/\\/ regex/;\n');
    assert.equal(metrics.sourceLines, 4);
    assert.equal(metrics.commentOnlyLines, 0);
  });

  it('ignores every line of a multi-line block comment', () => {
    const metrics = metricsOf('/**\n * doc\n */\nexport const x = 1; /* a\n b */ const y = 2;\n');
    assert.equal(metrics.physicalLines, 5);
    assert.equal(metrics.sourceLines, 2);
    assert.equal(metrics.commentOnlyLines, 3);
  });

  it('counts a shebang line as source', () => {
    const metrics = metricsOf('#!/usr/bin/env node\nconsole.log(1);\n', 'cli.js');
    assert.equal(metrics.sourceLines, 2);
  });

  it('handles CRLF line endings and files without a trailing newline', () => {
    assert.equal(metricsOf('const a = 1;\r\n\r\n// c\r\nconst b = 2;').physicalLines, 4);
    assert.equal(metricsOf('const a = 1;\r\n\r\n// c\r\nconst b = 2;').sourceLines, 2);
    assert.equal(metricsOf('const a = 1;\nconst b = 2;\n').physicalLines, 2);
    assert.equal(metricsOf('').physicalLines, 0);
  });

  it('counts type-only lines as source', () => {
    const metrics = metricsOf('import type { A } from "./a";\ntype B = A;\ninterface C {\n  a: A;\n}\n');
    assert.equal(metrics.sourceLines, 5);
  });

  it('includes nested function lines in the enclosing function but not blank or comment lines', () => {
    const fn = firstFunction('function outer() {\n  // note\n\n  const inner = () => {\n    return 1;\n  };\n  return inner;\n}\n');
    assert.equal(fn.sourceLines, 6);
  });

  it('measures methods from their key', () => {
    const metrics = metricsOf('class A {\n  method(\n    a,\n  ) {\n    return 1;\n  }\n}\n');
    assert.equal(metrics.functions[0]!.sourceLines, 5);
    assert.deepEqual(metrics.functions[0]!.location.start, { line: 2, column: 3 });
  });

  it('counts each physical JSX line containing code', () => {
    const fn = firstFunction('const view = () => (\n  <div>\n    {/* comment */}\n    <span>text</span>\n  </div>\n);\n', 'view.tsx');
    assert.equal(fn.sourceLines, 6);
  });
});
