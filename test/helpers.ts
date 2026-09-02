import { analyzeFile } from '../src/analysis/analyze-file.ts';
import { parseSource } from '../src/parser/parse-file.ts';
import type { FileMetrics, FunctionMetrics } from '../src/types.ts';

export function metricsOf(code: string, filePath = 'fixture.ts'): FileMetrics {
  return analyzeFile(parseSource(code, filePath));
}

/** Metrics of the first function in `code`. */
export function firstFunction(code: string, filePath = 'fixture.ts'): FunctionMetrics {
  const metrics = metricsOf(code, filePath);
  const fn = metrics.functions[0];
  if (fn === undefined) {
    throw new Error(`fixture contains no function:\n${code}`);
  }
  return fn;
}

/** Metrics of the function with the given derived name. */
export function functionNamed(code: string, name: string, filePath = 'fixture.ts'): FunctionMetrics {
  const metrics = metricsOf(code, filePath);
  const fn = metrics.functions.find((candidate) => candidate.name === name);
  if (fn === undefined) {
    throw new Error(`no function named ${name}; found ${metrics.functions.map((f) => f.name).join(', ')}`);
  }
  return fn;
}

/** Wraps statements in a function body and returns that function's metrics. */
export function body(statements: string, params = 'a, b, c, d, e, f, xs'): FunctionMetrics {
  return firstFunction(`function fixture(${params}) {\n${statements}\n}\n`);
}

/** Same as `body` but parsed as TSX. */
export function bodyTsx(statements: string, params = 'a, b, c, ready, name'): FunctionMetrics {
  return firstFunction(`function fixture(${params}) {\n${statements}\n}\n`, 'fixture.tsx');
}
