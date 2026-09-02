import type { TSESTree } from '@typescript-eslint/typescript-estree';
import type { CognitiveContribution, ConditionGroup } from '../types.ts';
import {
  childrenOf,
  entityNodeOf,
  type FunctionNode,
  isCountedStatement,
  isFunctionNode,
  isLogicalAssignment,
  isTypeOnlyNode,
  type Node,
  positionOf,
} from './ast.ts';
import { MARK_IGNORE, MARK_NONE, MARK_OPERAND, MARK_OPERATOR, type TokenMarks } from './halstead.ts';

/**
 * Metrics accumulated for one function (or for module scope) during the single
 * shared traversal. Nested functions get their own accumulator.
 */
export interface FlowAccumulator {
  cyclomatic: number;
  cognitive: number;
  contributions: CognitiveContribution[];
  statements: number;
  maxDepth: number;
  maxDepthNode: Node | null;
  conditions: ConditionGroup[];
  /** Entity ranges of directly nested functions, excluded from Halstead counting. */
  nestedRanges: Array<readonly [number, number]>;
}

export interface FoundFunction {
  node: FunctionNode;
  entity: Node;
  /** Ancestors from the outermost node down to the direct parent. */
  ancestors: Node[];
  flow: FlowAccumulator;
}

interface ConditionGroupState {
  root: Node;
  base: number;
  operators: number;
}

function newAccumulator(): FlowAccumulator {
  return {
    cyclomatic: 1,
    cognitive: 0,
    contributions: [],
    statements: 0,
    maxDepth: 0,
    maxDepthNode: null,
    conditions: [],
    nestedRanges: [],
  };
}

/**
 * Walks a program once, computing cyclomatic complexity, cognitive complexity,
 * nesting depth, condition-group complexity and statement counts for every
 * function, and marking tokens for Halstead classification along the way.
 */
export class ControlFlowWalker {
  readonly functions: FoundFunction[] = [];
  private readonly marks: TokenMarks;
  private readonly ancestors: Node[] = [];
  private flow: FlowAccumulator = newAccumulator();
  private group: ConditionGroupState | null = null;

  constructor(marks: TokenMarks) {
    this.marks = marks;
  }

  walkProgram(program: TSESTree.Program): FlowAccumulator {
    this.flow = newAccumulator();
    this.ancestors.length = 0;
    this.ancestors.push(program);
    for (const statement of program.body) {
      this.visit(statement, program, 0, 0);
    }
    this.ancestors.pop();
    return this.flow;
  }

  private visit(node: Node, parent: Node, nesting: number, depth: number): void {
    if (isFunctionNode(node)) {
      this.visitFunction(node, parent);
      return;
    }
    if (isTypeOnlyNode(node)) {
      this.marks.markRange(node.range, MARK_IGNORE);
      return;
    }
    if (isCountedStatement(node)) {
      this.flow.statements++;
    }

    switch (node.type) {
      case 'IfStatement':
        this.visitIf(node, nesting, depth, false, depth + 1);
        return;
      case 'ForStatement':
        this.enterLoop(node, 'for', nesting, depth);
        if (node.init) {
          this.visitLoopClause(node.init, node, nesting, depth);
        }
        if (node.test) {
          this.visitTest(node.test, node, nesting, depth);
        }
        if (node.update) {
          this.visitChild(node.update, node, nesting, depth);
        }
        this.visitChild(node.body, node, nesting + 1, depth + 1);
        return;
      case 'ForInStatement':
      case 'ForOfStatement':
        this.enterLoop(node, node.type === 'ForInStatement' ? 'for-in' : 'for-of', nesting, depth);
        this.visitLoopClause(node.left, node, nesting, depth);
        this.visitChild(node.right, node, nesting, depth);
        this.visitChild(node.body, node, nesting + 1, depth + 1);
        return;
      case 'WhileStatement':
      case 'DoWhileStatement':
        this.enterLoop(node, node.type === 'WhileStatement' ? 'while' : 'do-while', nesting, depth);
        this.visitTest(node.test, node, nesting, depth);
        this.visitChild(node.body, node, nesting + 1, depth + 1);
        return;
      case 'SwitchStatement':
        this.enterConstruct(node, 'switch', nesting, depth);
        this.visitChild(node.discriminant, node, nesting, depth);
        for (const switchCase of node.cases) {
          if (switchCase.test !== null) {
            this.flow.cyclomatic++;
            this.visitChild(switchCase.test, switchCase, nesting, depth + 1);
          }
          for (const statement of switchCase.consequent) {
            this.visitChild(statement, switchCase, nesting + 1, depth + 1);
          }
        }
        return;
      case 'TryStatement':
        this.enterDepth(node, depth);
        this.visitChild(node.block, node, nesting, depth + 1);
        if (node.handler !== null) {
          const handler = node.handler;
          this.flow.cyclomatic++;
          this.addCognitive(handler, 'catch', 1, nesting);
          if (handler.param !== null) {
            this.visitChild(handler.param, handler, nesting, depth + 1);
          }
          this.visitChild(handler.body, handler, nesting + 1, depth + 1);
        }
        if (node.finalizer !== null) {
          this.visitChild(node.finalizer, node, nesting, depth + 1);
        }
        return;
      case 'ConditionalExpression': {
        this.flow.cyclomatic++;
        this.enterConstruct(node, 'conditional', nesting, depth);
        const opened = this.openGroupIfNone(node, 0);
        this.group!.operators++;
        this.visitChild(node.test, node, nesting, depth);
        this.visitChild(node.consequent, node, nesting + 1, depth + 1);
        this.visitChild(node.alternate, node, nesting + 1, depth + 1);
        if (opened) {
          this.closeGroup(null);
        }
        return;
      }
      case 'LogicalExpression': {
        this.flow.cyclomatic++;
        const continuesSequence = parent.type === 'LogicalExpression' && parent.operator === node.operator;
        if (!continuesSequence) {
          this.addCognitive(node, node.operator, 1, 0);
        }
        const opened = this.openGroupIfNone(node, 1);
        this.group!.operators++;
        this.visitLoopClause(node.left, node, nesting, depth);
        this.visitChild(node.right, node, nesting, depth);
        if (opened) {
          this.closeGroup(null);
        }
        return;
      }
      case 'AssignmentExpression':
        if (isLogicalAssignment(node)) {
          this.flow.cyclomatic++;
        }
        break;
      case 'AssignmentPattern':
        this.flow.cyclomatic++;
        break;
      case 'MemberExpression':
        if (node.optional) {
          this.flow.cyclomatic++;
        } else if (node.computed) {
          this.marks.markPunctuator(node.object.range[1], node.property.range[0], '[', MARK_OPERATOR);
        }
        break;
      case 'CallExpression':
        if (node.optional) {
          this.flow.cyclomatic++;
        } else {
          const from = node.typeArguments ? node.typeArguments.range[1] : node.callee.range[1];
          this.marks.markPunctuator(from, node.range[1], '(', MARK_OPERATOR);
        }
        break;
      case 'NewExpression': {
        const from = node.typeArguments ? node.typeArguments.range[1] : node.callee.range[1];
        this.marks.markPunctuator(from, node.range[1], '(', MARK_OPERATOR);
        break;
      }
      case 'BreakStatement':
      case 'ContinueStatement':
        if (node.label !== null) {
          this.addCognitive(node, node.type === 'BreakStatement' ? 'break label' : 'continue label', 1, 0);
        }
        break;
      case 'Identifier':
      case 'PrivateIdentifier':
      case 'JSXIdentifier':
      case 'Literal':
        this.marks.markAt(node.range[0], MARK_OPERAND);
        break;
      case 'JSXText':
        this.marks.markAt(node.range[0], node.value.trim() === '' ? MARK_IGNORE : MARK_OPERAND);
        return;
      case 'ArrayExpression':
      case 'ArrayPattern':
      case 'ObjectExpression':
      case 'ObjectPattern':
        this.marks.markAt(node.range[0], MARK_OPERATOR);
        break;
      case 'JSXOpeningElement':
      case 'JSXClosingElement':
      case 'JSXOpeningFragment':
      case 'JSXClosingFragment':
        this.marks.markRange(node.range, MARK_IGNORE);
        break;
      case 'JSXExpressionContainer':
        if (node.expression.type !== 'JSXEmptyExpression') {
          this.marks.markRange(node.expression.range, MARK_NONE);
        }
        break;
      case 'JSXSpreadAttribute':
        this.marks.markRange(node.argument.range, MARK_NONE);
        break;
      case 'TSAsExpression':
      case 'TSSatisfiesExpression':
      case 'TSNonNullExpression':
      case 'TSInstantiationExpression':
        this.marks.markRange([node.expression.range[1], node.range[1]], MARK_IGNORE);
        this.visitChild(node.expression, node, nesting, depth);
        return;
      default:
        break;
    }

    for (const child of childrenOf(node)) {
      this.visitChild(child, node, nesting, depth);
    }
  }

  private visitChild(child: Node, parent: Node, nesting: number, depth: number): void {
    this.ancestors.push(parent);
    this.visit(child, parent, nesting, depth);
    this.ancestors.pop();
  }

  /** A loop-head declaration (`for (const x of xs)`) is part of the loop, not a statement of its own. */
  private visitLoopClause(clause: Node, loop: Node, nesting: number, depth: number): void {
    if (clause.type === 'VariableDeclaration') {
      this.ancestors.push(loop);
      for (const child of childrenOf(clause)) {
        this.visitChild(child, clause, nesting, depth);
      }
      this.ancestors.pop();
      return;
    }
    this.visitChild(clause, loop, nesting, depth);
  }

  private visitIf(node: TSESTree.IfStatement, nesting: number, depth: number, isElseIf: boolean, chainDepth: number): void {
    this.flow.cyclomatic++;
    if (isElseIf) {
      this.addCognitive(node, 'else if', 1, 0);
    } else {
      this.enterConstruct(node, 'if', nesting, depth);
    }
    this.visitTest(node.test, node, nesting, depth);
    this.visitChild(node.consequent, node, nesting + 1, chainDepth);
    if (node.alternate === null) {
      return;
    }
    if (node.alternate.type === 'IfStatement') {
      this.ancestors.push(node);
      this.visitIf(node.alternate, nesting, depth, true, chainDepth);
      this.ancestors.pop();
      return;
    }
    this.addCognitive(node.alternate, 'else', 1, 0);
    this.visitChild(node.alternate, node, nesting + 1, chainDepth);
  }

  /** Visits the test of an `if` or loop as its own condition group with base score 1. */
  private visitTest(test: Node, parent: Node, nesting: number, depth: number): void {
    const previous = this.group;
    this.group = { root: test, base: 1, operators: 0 };
    this.visitChild(test, parent, nesting, depth);
    this.closeGroup(previous);
  }

  /** Starts a value-position group unless one is already open; returns whether this call opened it. */
  private openGroupIfNone(root: Node, base: number): boolean {
    if (this.group !== null) {
      return false;
    }
    this.group = { root, base, operators: 0 };
    return true;
  }

  private closeGroup(previous: ConditionGroupState | null): void {
    const current = this.group!;
    this.flow.conditions.push({ location: positionOf(current.root.loc.start), complexity: current.base + current.operators });
    this.group = previous;
  }

  /** Enters a structural construct: cognitive increment with nesting penalty plus one nesting level. */
  private enterConstruct(node: Node, construct: string, nesting: number, depth: number): void {
    this.addCognitive(node, construct, 1, nesting);
    this.enterDepth(node, depth);
  }

  /** Loops are decision points as well as structural constructs. */
  private enterLoop(node: Node, construct: string, nesting: number, depth: number): void {
    this.flow.cyclomatic++;
    this.enterConstruct(node, construct, nesting, depth);
  }

  private enterDepth(node: Node, depth: number): void {
    const inner = depth + 1;
    if (inner > this.flow.maxDepth) {
      this.flow.maxDepth = inner;
      this.flow.maxDepthNode = node;
    }
  }

  private addCognitive(node: Node, construct: string, base: number, nesting: number): void {
    this.flow.cognitive += base + nesting;
    this.flow.contributions.push({
      location: positionOf(node.loc.start),
      construct,
      base,
      nesting,
      total: this.flow.cognitive,
    });
  }

  private visitFunction(node: FunctionNode, parent: Node): void {
    const entity = entityNodeOf(node, parent);
    this.flow.nestedRanges.push(entity.range);
    if (node.type === 'FunctionDeclaration') {
      this.flow.statements++;
    }

    const outerFlow = this.flow;
    const outerGroup = this.group;
    const flow = newAccumulator();
    this.flow = flow;
    this.group = null;
    const ancestors = [...this.ancestors];

    this.ancestors.push(node);
    if (node.type !== 'ArrowFunctionExpression' && node.id !== null) {
      this.marks.markAt(node.id.range[0], MARK_OPERAND);
    }
    for (const parameter of node.params) {
      this.visit(parameter, node, 0, 0);
    }
    if (node.returnType) {
      this.marks.markRange(node.returnType.range, MARK_IGNORE);
    }
    if (node.typeParameters) {
      this.marks.markRange(node.typeParameters.range, MARK_IGNORE);
    }
    if (node.body) {
      if (node.body.type === 'BlockStatement') {
        for (const statement of node.body.body) {
          this.visit(statement, node.body, 0, 0);
        }
      } else {
        this.visit(node.body, node, 0, 0);
      }
    }
    this.ancestors.pop();

    this.flow = outerFlow;
    this.group = outerGroup;
    this.functions.push({ node, entity, ancestors, flow });
  }
}
