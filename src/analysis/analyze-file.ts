import type { TSESTree } from '@typescript-eslint/typescript-estree';
import type { FileMetrics, FunctionMetrics } from '../types.ts';
import type { ParsedFile } from '../parser/parse-file.ts';
import { locationOf, positionOf } from './ast.ts';
import { ControlFlowWalker, type FoundFunction } from './control-flow.ts';
import { deriveFunctionName } from './function-context.ts';
import { computeHalstead, TokenMarks } from './halstead.ts';
import { computeNpath } from './npath.ts';
import { buildLineTable, countSourceLines, type LineTable } from './source-lines.ts';

/**
 * Parses nothing and traverses the AST once: the walker gathers control-flow
 * metrics and token marks, after which per-function NPath, Halstead and
 * source-line figures are derived from the same parse result.
 */
export function analyzeFile(parsed: ParsedFile): FileMetrics {
  const lines = buildLineTable(parsed.code, parsed.comments);
  const marks = new TokenMarks(parsed.tokens);
  const walker = new ControlFlowWalker(marks);
  const moduleFlow = walker.walkProgram(parsed.ast);

  const functions = walker.functions
    .map((found) => buildFunctionMetrics(found, parsed.code, marks, lines))
    .sort(compareByPosition);

  return {
    physicalLines: lines.physicalLines,
    sourceLines: lines.sourceLines,
    blankLines: lines.blankLines,
    commentOnlyLines: lines.commentOnlyLines,
    functions,
    moduleConditions: moduleFlow.conditions,
  };
}

function buildFunctionMetrics(found: FoundFunction, code: string, marks: TokenMarks, lines: LineTable): FunctionMetrics {
  const { node, entity, flow } = found;
  const location = locationOf(entity);
  const nested = [...flow.nestedRanges].sort((a, b) => a[0] - b[0]);
  let maximumConditionComplexity = 0;
  for (const condition of flow.conditions) {
    maximumConditionComplexity = Math.max(maximumConditionComplexity, condition.complexity);
  }

  return {
    name: deriveFunctionName(node, found.ancestors, code),
    location,
    sourceLines: countSourceLines(lines, location.start.line, location.end.line),
    statementCount: flow.statements,
    parameterCount: countParameters(node.params),
    cyclomaticComplexity: flow.cyclomatic,
    cognitiveComplexity: flow.cognitive,
    cognitiveContributions: flow.contributions,
    npathComplexity: computeNpath(node),
    maximumNestingDepth: flow.maxDepth,
    maximumNestingLocation: flow.maxDepthNode === null ? null : positionOf(flow.maxDepthNode.loc.start),
    maximumConditionComplexity,
    conditions: flow.conditions,
    halstead: computeHalstead(marks, entity.range, nested),
  };
}

/** Every syntactic parameter counts once; the TypeScript `this` pseudo-parameter does not. */
function countParameters(params: readonly TSESTree.Parameter[]): number {
  let count = 0;
  for (const parameter of params) {
    if (parameter.type === 'Identifier' && parameter.name === 'this') {
      continue;
    }
    count++;
  }
  return count;
}

function compareByPosition(a: FunctionMetrics, b: FunctionMetrics): number {
  return a.location.start.line - b.location.start.line || a.location.start.column - b.location.start.column;
}
