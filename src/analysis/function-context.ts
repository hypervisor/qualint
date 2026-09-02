import type { TSESTree } from '@typescript-eslint/typescript-estree';
import { type FunctionNode, type Node, positionOf } from './ast.ts';

/**
 * Derives a human-readable name for a function from its syntactic context.
 *
 * `ancestors` lists the enclosing nodes from the outermost (index 0) to the
 * direct parent (last element). Naming never inspects the function body.
 */
export function deriveFunctionName(node: FunctionNode, ancestors: readonly Node[], code: string): string {
  if (node.type !== 'ArrowFunctionExpression' && node.id !== null) {
    return node.id.name;
  }
  if (node.type === 'FunctionDeclaration') {
    return 'default';
  }

  let index = ancestors.length - 1;
  let parent = ancestors[index];
  // Look through wrappers that do not change what the function is bound to.
  while (
    parent !== undefined &&
    (parent.type === 'TSAsExpression' ||
      parent.type === 'TSSatisfiesExpression' ||
      parent.type === 'TSNonNullExpression' ||
      parent.type === 'TSInstantiationExpression' ||
      parent.type === 'AwaitExpression')
  ) {
    index--;
    parent = ancestors[index];
  }
  if (parent === undefined) {
    return anonymousName(node);
  }

  switch (parent.type) {
    case 'MethodDefinition':
      return methodName(parent, ancestors, index, code);
    case 'PropertyDefinition':
    case 'AccessorProperty': {
      const key = keyName(parent.key, parent.computed, code);
      const owner = classNameOf(ancestors, index);
      return owner === null ? key : `${owner}.${key}`;
    }
    case 'Property': {
      const key = keyName(parent.key, parent.computed, code);
      if (parent.kind === 'get' || parent.kind === 'set') {
        return `${parent.kind} ${key}`;
      }
      return key;
    }
    case 'VariableDeclarator':
      return parent.id.type === 'Identifier' ? parent.id.name : anonymousName(node);
    case 'AssignmentExpression': {
      const target = simpleChainText(parent.left);
      return target ?? anonymousName(node);
    }
    case 'AssignmentPattern':
      return parent.left.type === 'Identifier' ? parent.left.name : anonymousName(node);
    case 'CallExpression':
    case 'NewExpression': {
      if (parent.callee === node) {
        return anonymousName(node);
      }
      const callee = simpleChainText(parent.callee);
      return callee === null ? 'callback' : `${callee} callback`;
    }
    case 'ExportDefaultDeclaration':
      return 'default';
    case 'JSXExpressionContainer': {
      const attribute = ancestors[index - 1];
      if (attribute !== undefined && attribute.type === 'JSXAttribute' && attribute.name.type === 'JSXIdentifier') {
        return attribute.name.name;
      }
      return anonymousName(node);
    }
    default:
      return anonymousName(node);
  }
}

function methodName(
  method: TSESTree.MethodDefinition,
  ancestors: readonly Node[],
  index: number,
  code: string,
): string {
  const key = keyName(method.key, method.computed, code);
  const owner = classNameOf(ancestors, index);
  const qualified = owner === null ? key : `${owner}.${key}`;
  if (method.kind === 'get' || method.kind === 'set') {
    return `${method.kind} ${qualified}`;
  }
  return qualified;
}

/** Finds the name of the class whose body is the direct ancestor of `ancestors[index]`. */
function classNameOf(ancestors: readonly Node[], memberIndex: number): string | null {
  const body = ancestors[memberIndex - 1];
  const classNode = ancestors[memberIndex - 2];
  if (body === undefined || body.type !== 'ClassBody' || classNode === undefined) {
    return null;
  }
  if (classNode.type !== 'ClassDeclaration' && classNode.type !== 'ClassExpression') {
    return null;
  }
  if (classNode.id !== null) {
    return classNode.id.name;
  }
  const classParent = ancestors[memberIndex - 3];
  if (classParent !== undefined && classParent.type === 'VariableDeclarator' && classParent.id.type === 'Identifier') {
    return classParent.id.name;
  }
  return null;
}

function keyName(key: Node, computed: boolean, code: string): string {
  if (!computed) {
    if (key.type === 'Identifier') {
      return key.name;
    }
    if (key.type === 'PrivateIdentifier') {
      return `#${key.name}`;
    }
    if (key.type === 'Literal') {
      return String(key.value);
    }
  }
  const text = code.slice(key.range[0], key.range[1]).replace(/\s+/g, ' ');
  return `[${text.length > 40 ? `${text.slice(0, 37)}...` : text}]`;
}

/** Renders `a.b.c`, `this.x` or `#p.q`; null for anything with calls or computed access. */
function simpleChainText(node: Node): string | null {
  switch (node.type) {
    case 'Identifier':
      return node.name;
    case 'ThisExpression':
      return 'this';
    case 'Super':
      return 'super';
    case 'PrivateIdentifier':
      return `#${node.name}`;
    case 'MemberExpression': {
      if (node.computed) {
        return null;
      }
      const object = simpleChainText(node.object);
      const property = simpleChainText(node.property);
      return object === null || property === null ? null : `${object}.${property}`;
    }
    case 'TSNonNullExpression':
      return simpleChainText(node.expression);
    default:
      return null;
  }
}

function anonymousName(node: Node): string {
  const position = positionOf(node.loc.start);
  return `<anonymous at ${position.line}:${position.column}>`;
}
