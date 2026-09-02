import type { TSESTree } from '@typescript-eslint/typescript-estree';
import { visitorKeys } from '@typescript-eslint/visitor-keys';
import type { SourceLocation, SourcePosition } from '../types.ts';

export type Node = TSESTree.Node;
export type FunctionNode =
  | TSESTree.FunctionDeclaration
  | TSESTree.FunctionExpression
  | TSESTree.ArrowFunctionExpression;

export function isFunctionNode(node: Node): node is FunctionNode {
  return (
    node.type === 'FunctionDeclaration' ||
    node.type === 'FunctionExpression' ||
    node.type === 'ArrowFunctionExpression'
  );
}

/** TS-prefixed node types that carry runtime semantics and must be analyzed. */
const RUNTIME_TS_NODES: ReadonlySet<string> = new Set([
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSNonNullExpression',
  'TSInstantiationExpression',
  'TSParameterProperty',
  'TSEnumDeclaration',
  'TSEnumBody',
  'TSEnumMember',
  'TSModuleDeclaration',
  'TSModuleBlock',
  'TSImportEqualsDeclaration',
  'TSExternalModuleReference',
  'TSExportAssignment',
  'TSQualifiedName',
]);

/**
 * True for syntax that is erased at compile time: type annotations, interfaces,
 * type aliases, generics, `declare` statements, type-only imports and exports,
 * abstract members and overload signatures. Such nodes contribute nothing to
 * control flow, statements or Halstead tokens.
 */
export function isTypeOnlyNode(node: Node): boolean {
  if ('declare' in node && node.declare === true) {
    return true;
  }
  switch (node.type) {
    case 'ImportDeclaration':
      return node.importKind === 'type';
    case 'ExportNamedDeclaration':
      return node.exportKind === 'type';
    case 'ExportAllDeclaration':
      return node.exportKind === 'type';
    case 'TSModuleDeclaration':
      return node.kind === 'global';
    default:
      return node.type.startsWith('TS') && !RUNTIME_TS_NODES.has(node.type);
  }
}

const STATEMENT_TYPES: ReadonlySet<string> = new Set([
  'ExpressionStatement',
  'VariableDeclaration',
  'ReturnStatement',
  'IfStatement',
  'ForStatement',
  'ForInStatement',
  'ForOfStatement',
  'WhileStatement',
  'DoWhileStatement',
  'SwitchStatement',
  'ThrowStatement',
  'TryStatement',
  'BreakStatement',
  'ContinueStatement',
  'LabeledStatement',
  'FunctionDeclaration',
  'ClassDeclaration',
  'DebuggerStatement',
  'WithStatement',
  'TSEnumDeclaration',
  'TSModuleDeclaration',
  'TSImportEqualsDeclaration',
  'TSExportAssignment',
  'ImportDeclaration',
  'ExportAllDeclaration',
]);

/**
 * Executable statements that count towards `size/statements`. Blocks are
 * containers, empty statements do nothing, and export wrappers only count when
 * they do not wrap a declaration that is counted on its own.
 */
export function isCountedStatement(node: Node): boolean {
  if (isTypeOnlyNode(node)) {
    return false;
  }
  if (node.type === 'ExportNamedDeclaration') {
    return node.declaration === null;
  }
  if (node.type === 'ExportDefaultDeclaration') {
    const declaration = node.declaration;
    return !(
      declaration.type === 'FunctionDeclaration' ||
      declaration.type === 'ClassDeclaration' ||
      declaration.type === 'TSDeclareFunction' ||
      declaration.type === 'TSInterfaceDeclaration' ||
      declaration.type === 'TSTypeAliasDeclaration' ||
      declaration.type === 'TSEnumDeclaration' ||
      declaration.type === 'TSModuleDeclaration'
    );
  }
  return STATEMENT_TYPES.has(node.type);
}

export function isLoop(node: Node): boolean {
  return (
    node.type === 'ForStatement' ||
    node.type === 'ForInStatement' ||
    node.type === 'ForOfStatement' ||
    node.type === 'WhileStatement' ||
    node.type === 'DoWhileStatement'
  );
}

export function isLogicalAssignment(node: TSESTree.AssignmentExpression): boolean {
  return node.operator === '&&=' || node.operator === '||=' || node.operator === '??=';
}

/** Children in visitor-key order. Handles both single nodes and node arrays. */
export function childrenOf(node: Node): Node[] {
  const keys = (visitorKeys as Record<string, readonly string[] | undefined>)[node.type];
  if (keys === undefined) {
    return [];
  }
  const children: Node[] = [];
  const record = node as unknown as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      for (const item of value) {
        if (isNode(item)) {
          children.push(item);
        }
      }
    } else if (isNode(value)) {
      children.push(value);
    }
  }
  return children;
}

function isNode(value: unknown): value is Node {
  return typeof value === 'object' && value !== null && typeof (value as { type?: unknown }).type === 'string';
}

/** Converts an ESTree position (0-based column) to Qualint's 1-based position. */
export function positionOf(position: TSESTree.Position): SourcePosition {
  return { line: position.line, column: position.column + 1 };
}

export function locationOf(node: Node): SourceLocation {
  return { start: positionOf(node.loc.start), end: positionOf(node.loc.end) };
}

/**
 * The syntactic range that a function occupies as an entity. Methods include
 * their key and modifiers because those belong to the method's signature.
 */
export function entityNodeOf(node: FunctionNode, parent: Node | undefined): Node {
  if (parent === undefined) {
    return node;
  }
  if (parent.type === 'MethodDefinition') {
    return parent;
  }
  if (parent.type === 'Property' && (parent.method || parent.kind === 'get' || parent.kind === 'set')) {
    return parent;
  }
  return node;
}
