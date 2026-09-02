import type { TSESTree } from '@typescript-eslint/typescript-estree';
import { childrenOf, type FunctionNode, isFunctionNode, isLogicalAssignment, isLoop, isTypeOnlyNode, type Node } from './ast.ts';

/**
 * NPath: the number of acyclic execution paths through a function.
 *
 * Path counts are grouped by completion kind so that abrupt completions stop
 * multiplying with statements they can never reach:
 *
 * - `normal`   paths that fall through to the next statement;
 * - `abrupt`   paths that leave the function (`return`, `throw`);
 * - `breaks`   paths ending in `break`, keyed by label ('' when unlabeled);
 * - `continues` likewise for `continue`.
 *
 * Composition rules (see design document §7.3):
 *
 * - sequence:      A then B  → normal = A.n·B.n, abrupt = A.ab + A.n·B.ab, …
 * - if:            then + else·(1 + extra(test)); missing else is one path
 * - loop:          body (with its own break/continue folded back) + 1 + extra(test)
 * - conditional:   extra(test) + consequent + alternate
 * - logical `op`:  paths(left) + paths(right), i.e. operators + 1 for a chain
 * - switch:        Σ paths of each case entry including fall-through, + 1 when no default
 * - try:           try + catch as alternatives, then every path passes through finally
 *
 * `extra(e) = paths(e) − 1` is the number of additional short-circuit paths in a
 * test expression. Nested functions contribute one path.
 */
interface Paths {
  normal: bigint;
  abrupt: bigint;
  breaks: Map<string, bigint>;
  continues: Map<string, bigint>;
}

const one = (): Paths => ({ normal: 1n, abrupt: 0n, breaks: new Map(), continues: new Map() });
const none = (): Paths => ({ normal: 0n, abrupt: 0n, breaks: new Map(), continues: new Map() });

export function computeNpath(fn: FunctionNode): bigint {
  const body = fn.body;
  if (body.type === 'BlockStatement') {
    return total(statementList(body.body));
  }
  return expressionPaths(body);
}

function total(paths: Paths): bigint {
  let sum = paths.normal + paths.abrupt;
  for (const count of paths.breaks.values()) {
    sum += count;
  }
  for (const count of paths.continues.values()) {
    sum += count;
  }
  return sum;
}

function addInto(target: Map<string, bigint>, key: string, count: bigint): void {
  if (count === 0n) {
    return;
  }
  target.set(key, (target.get(key) ?? 0n) + count);
}

function sum(a: Paths, b: Paths): Paths {
  const result: Paths = { normal: a.normal + b.normal, abrupt: a.abrupt + b.abrupt, breaks: new Map(a.breaks), continues: new Map(a.continues) };
  for (const [key, count] of b.breaks) {
    addInto(result.breaks, key, count);
  }
  for (const [key, count] of b.continues) {
    addInto(result.continues, key, count);
  }
  return result;
}

function scale(paths: Paths, factor: bigint): Paths {
  const result: Paths = { normal: paths.normal * factor, abrupt: paths.abrupt * factor, breaks: new Map(), continues: new Map() };
  for (const [key, count] of paths.breaks) {
    addInto(result.breaks, key, count * factor);
  }
  for (const [key, count] of paths.continues) {
    addInto(result.continues, key, count * factor);
  }
  return result;
}

/** A followed by B: only A's normal completions ever enter B. */
function sequence(a: Paths, b: Paths): Paths {
  if (a.normal === 0n) {
    return a;
  }
  const result: Paths = { normal: a.normal * b.normal, abrupt: a.abrupt + a.normal * b.abrupt, breaks: new Map(a.breaks), continues: new Map(a.continues) };
  for (const [key, count] of b.breaks) {
    addInto(result.breaks, key, a.normal * count);
  }
  for (const [key, count] of b.continues) {
    addInto(result.continues, key, a.normal * count);
  }
  return result;
}

function statementList(statements: readonly Node[]): Paths {
  let paths = one();
  for (const statement of statements) {
    paths = sequence(paths, statementPaths(statement));
    if (paths.normal === 0n) {
      break;
    }
  }
  return paths;
}

function extra(expression: Node | null | undefined): bigint {
  return expression ? expressionPaths(expression) - 1n : 0n;
}

/** Folds the loop's own break/continue paths into normal completion of the loop statement. */
function resolveLoopBody(body: Paths, label: string | null): Paths {
  const result: Paths = { normal: body.normal, abrupt: body.abrupt, breaks: new Map(body.breaks), continues: new Map(body.continues) };
  for (const key of label === null ? [''] : ['', label]) {
    result.normal += result.breaks.get(key) ?? 0n;
    result.normal += result.continues.get(key) ?? 0n;
    result.breaks.delete(key);
    result.continues.delete(key);
  }
  return result;
}

function loopPaths(node: Node, label: string | null): Paths {
  switch (node.type) {
    case 'WhileStatement':
    case 'DoWhileStatement': {
      const body = resolveLoopBody(statementPaths(node.body), label);
      body.normal += 1n + extra(node.test);
      return body;
    }
    case 'ForStatement': {
      const body = resolveLoopBody(statementPaths(node.body), label);
      const initExtra = node.init === null ? 0n : node.init.type === 'VariableDeclaration' ? statementPaths(node.init).normal - 1n : extra(node.init);
      body.normal += 1n + initExtra + extra(node.test) + extra(node.update);
      return body;
    }
    case 'ForInStatement':
    case 'ForOfStatement': {
      const body = resolveLoopBody(statementPaths(node.body), label);
      body.normal += 1n + extra(node.right);
      return body;
    }
    default:
      return one();
  }
}

function switchPaths(node: TSESTree.SwitchStatement): Paths {
  let continuation = one();
  let result = none();
  let hasDefault = false;
  for (let index = node.cases.length - 1; index >= 0; index--) {
    const switchCase = node.cases[index]!;
    if (switchCase.test === null) {
      hasDefault = true;
    }
    continuation = sequence(statementList(switchCase.consequent), continuation);
    result = sum(result, continuation);
  }
  if (!hasDefault) {
    result.normal += 1n;
  }
  result.normal += result.breaks.get('') ?? 0n;
  result.breaks.delete('');
  return scale(result, expressionPaths(node.discriminant));
}

function tryPaths(node: TSESTree.TryStatement): Paths {
  let paths = statementPaths(node.block);
  if (node.handler !== null) {
    paths = sum(paths, statementPaths(node.handler.body));
  }
  if (node.finalizer === null) {
    return paths;
  }
  const finalizer = statementPaths(node.finalizer);
  const entering = total(paths);
  const result = scale(paths, finalizer.normal);
  result.abrupt += entering * finalizer.abrupt;
  for (const [key, count] of finalizer.breaks) {
    addInto(result.breaks, key, entering * count);
  }
  for (const [key, count] of finalizer.continues) {
    addInto(result.continues, key, entering * count);
  }
  return result;
}

function statementPaths(node: Node): Paths {
  if (isTypeOnlyNode(node)) {
    return one();
  }
  switch (node.type) {
    case 'BlockStatement':
      return statementList(node.body);
    case 'IfStatement': {
      const consequent = statementPaths(node.consequent);
      const alternate = node.alternate === null ? one() : statementPaths(node.alternate);
      return sum(consequent, scale(alternate, 1n + extra(node.test)));
    }
    case 'WhileStatement':
    case 'DoWhileStatement':
    case 'ForStatement':
    case 'ForInStatement':
    case 'ForOfStatement':
      return loopPaths(node, null);
    case 'LabeledStatement': {
      const label = node.label.name;
      const inner = isLoop(node.body) ? loopPaths(node.body, label) : statementPaths(node.body);
      inner.normal += inner.breaks.get(label) ?? 0n;
      inner.breaks.delete(label);
      return inner;
    }
    case 'SwitchStatement':
      return switchPaths(node);
    case 'TryStatement':
      return tryPaths(node);
    case 'ReturnStatement':
    case 'ThrowStatement': {
      const paths = none();
      paths.abrupt = node.argument ? expressionPaths(node.argument) : 1n;
      return paths;
    }
    case 'BreakStatement': {
      const paths = none();
      paths.breaks.set(node.label?.name ?? '', 1n);
      return paths;
    }
    case 'ContinueStatement': {
      const paths = none();
      paths.continues.set(node.label?.name ?? '', 1n);
      return paths;
    }
    case 'ExpressionStatement': {
      const paths = one();
      paths.normal = expressionPaths(node.expression);
      return paths;
    }
    case 'VariableDeclaration': {
      const paths = one();
      for (const declarator of node.declarations) {
        if (declarator.init) {
          paths.normal *= expressionPaths(declarator.init);
        }
      }
      return paths;
    }
    case 'WithStatement':
      return statementPaths(node.body);
    default:
      return one();
  }
}

function expressionPaths(node: Node): bigint {
  if (isFunctionNode(node) || isTypeOnlyNode(node) || node.type === 'ClassExpression' || node.type === 'ClassDeclaration') {
    return 1n;
  }
  switch (node.type) {
    case 'LogicalExpression':
      return expressionPaths(node.left) + expressionPaths(node.right);
    case 'AssignmentExpression':
      if (isLogicalAssignment(node)) {
        return expressionPaths(node.left) + expressionPaths(node.right);
      }
      return expressionPaths(node.left) * expressionPaths(node.right);
    case 'ConditionalExpression':
      return extra(node.test) + expressionPaths(node.consequent) + expressionPaths(node.alternate);
    case 'TSAsExpression':
    case 'TSSatisfiesExpression':
    case 'TSNonNullExpression':
    case 'TSInstantiationExpression':
      return expressionPaths(node.expression);
    default: {
      let product = 1n;
      for (const child of childrenOf(node)) {
        product *= expressionPaths(child);
      }
      return product;
    }
  }
}
