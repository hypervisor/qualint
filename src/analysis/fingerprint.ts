import { createHash } from 'node:crypto';
import type { StructuralFingerprint } from '../types.ts';
import { childrenOf, type FunctionNode, isTypeOnlyNode, type Node } from './ast.ts';

/**
 * Structural fingerprint of a function, used to find copy-paste.
 *
 * This is the standard "type 2" clone definition: two functions match when
 * their syntax trees have the same shape, ignoring the things a copy-paste
 * usually changes.
 *
 * Ignored:
 *
 *   - identifier and property names, so `validateOrder` matches `validateCart`
 *   - literal values, so a threshold of 10 matches a threshold of 20
 *   - type annotations, generics and other erasable TypeScript syntax
 *   - assertion wrappers (`as`, `satisfies`, `!`), so adding one to a copy
 *     does not hide it
 *   - comments and formatting, which never reach the tree
 *
 * Kept, because changing them changes what the code does:
 *
 *   - the shape and nesting of every construct
 *   - operators, so `a + b` does not match `a - b`
 *   - declaration kinds, so `const` does not match `let`
 *   - computed and optional access, so `a?.b` does not match `a.b`
 *
 * Nested functions are part of their parent's fingerprint as well as having
 * their own, so two functions differing only inside an inline callback do not
 * match.
 */

/** Wrappers that carry no runtime shape of their own; their child stands in for them. */
const TRANSPARENT: ReadonlySet<string> = new Set([
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSNonNullExpression',
  'TSInstantiationExpression',
  'ChainExpression',
]);

export function fingerprintFunction(fn: FunctionNode): StructuralFingerprint {
  const hash = createHash('sha1');
  let size = 0;

  const visit = (node: Node): void => {
    if (isTypeOnlyNode(node)) {
      return;
    }
    if (TRANSPARENT.has(node.type)) {
      for (const child of childrenOf(node)) {
        visit(child);
      }
      return;
    }
    size++;
    // Parentheses make the flattened preorder unambiguous, so two different
    // trees cannot produce the same sequence of tokens.
    hash.update(tokenOf(node));
    hash.update('(');
    for (const child of childrenOf(node)) {
      visit(child);
    }
    hash.update(')');
  };

  visit(fn);
  return { hash: hash.digest('hex').slice(0, 16), size };
}

/** The part of a node that survives normalization. */
function tokenOf(node: Node): string {
  switch (node.type) {
    case 'BinaryExpression':
    case 'LogicalExpression':
    case 'AssignmentExpression':
    case 'UnaryExpression':
    case 'UpdateExpression':
      return `${node.type}:${node.operator}`;
    case 'VariableDeclaration':
      return `${node.type}:${node.kind}`;
    case 'MethodDefinition':
    case 'Property':
      return `${node.type}:${node.kind}`;
    case 'MemberExpression':
      return `${node.type}:${node.computed ? 'computed' : 'plain'}${node.optional ? ':optional' : ''}`;
    case 'CallExpression':
      return node.optional ? `${node.type}:optional` : node.type;
    default:
      return node.type;
  }
}
