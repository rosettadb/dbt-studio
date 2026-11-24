/**
 * Pratt parser for the analytics expression language.
 *
 * Supported: literals (number, string, true/false/null/undefined), arrays,
 * plain objects, identifiers, member access (a.b, a[0], a?.b), calls to
 * whitelisted helper functions, unary ! - +, binary arithmetic, comparison,
 * logical && || ??, and the ternary operator. Nothing else parses.
 */
import { ExpressionSyntaxError, Token, tokenize } from './tokenizer';

export type ExprNode =
  | { type: 'literal'; value: unknown }
  | { type: 'identifier'; name: string }
  | { type: 'array'; elements: ExprNode[] }
  | { type: 'object'; entries: Array<{ key: string; value: ExprNode }> }
  | {
      type: 'member';
      object: ExprNode;
      property: ExprNode;
      computed: boolean;
      optional: boolean;
    }
  | { type: 'call'; callee: string; args: ExprNode[] }
  | { type: 'unary'; operator: '!' | '-' | '+'; argument: ExprNode }
  | { type: 'binary'; operator: string; left: ExprNode; right: ExprNode }
  | {
      type: 'logical';
      operator: '&&' | '||' | '??';
      left: ExprNode;
      right: ExprNode;
    }
  | {
      type: 'conditional';
      test: ExprNode;
      consequent: ExprNode;
      alternate: ExprNode;
    };

const BINARY_PRECEDENCE: Record<string, number> = {
  '??': 1,
  '||': 2,
  '&&': 3,
  '==': 4,
  '!=': 4,
  '===': 4,
  '!==': 4,
  '<': 5,
  '<=': 5,
  '>': 5,
  '>=': 5,
  '+': 6,
  '-': 6,
  '*': 7,
  '/': 7,
  '%': 7,
};

const MAX_DEPTH = 64;

class Parser {
  private tokens: Token[];

  private index = 0;

  private depth = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(): Token {
    return this.tokens[this.index];
  }

  private next(): Token {
    const token = this.tokens[this.index];
    this.index += 1;
    return token;
  }

  private isPunct(value: string): boolean {
    const token = this.peek();
    return token.type === 'punct' && token.value === value;
  }

  private expectPunct(value: string): Token {
    const token = this.next();
    if (token.type !== 'punct' || token.value !== value) {
      throw new ExpressionSyntaxError(
        `Expected "${value}" but found "${token.value || 'end of expression'}"`,
        token.pos,
      );
    }
    return token;
  }

  parseProgram(): ExprNode {
    const expr = this.parseExpression();
    const token = this.peek();
    if (token.type !== 'eof') {
      throw new ExpressionSyntaxError(`Unexpected "${token.value}"`, token.pos);
    }
    return expr;
  }

  private enter() {
    this.depth += 1;
    if (this.depth > MAX_DEPTH) {
      throw new ExpressionSyntaxError(
        'Expression is nested too deeply',
        this.peek().pos,
      );
    }
  }

  private leave() {
    this.depth -= 1;
  }

  parseExpression(): ExprNode {
    this.enter();
    try {
      const test = this.parseBinary(0);
      if (this.isPunct('?')) {
        this.next();
        const consequent = this.parseExpression();
        this.expectPunct(':');
        const alternate = this.parseExpression();
        return { type: 'conditional', test, consequent, alternate };
      }
      return test;
    } finally {
      this.leave();
    }
  }

  private parseBinary(minPrecedence: number): ExprNode {
    let left = this.parseUnary();
    for (;;) {
      const token = this.peek();
      const precedence =
        token.type === 'punct' ? BINARY_PRECEDENCE[token.value] : undefined;
      if (precedence === undefined || precedence <= minPrecedence) {
        return left;
      }
      this.next();
      const right = this.parseBinary(precedence);
      if (
        token.value === '&&' ||
        token.value === '||' ||
        token.value === '??'
      ) {
        left = { type: 'logical', operator: token.value, left, right };
      } else {
        left = { type: 'binary', operator: token.value, left, right };
      }
    }
  }

  private parseUnary(): ExprNode {
    const token = this.peek();
    if (
      token.type === 'punct' &&
      (token.value === '!' || token.value === '-' || token.value === '+')
    ) {
      this.next();
      this.enter();
      try {
        return {
          type: 'unary',
          operator: token.value as '!' | '-' | '+',
          argument: this.parseUnary(),
        };
      } finally {
        this.leave();
      }
    }
    return this.parsePostfix(this.parsePrimary());
  }

  private parsePostfix(base: ExprNode): ExprNode {
    let expr = base;
    for (;;) {
      if (this.isPunct('.') || this.isPunct('?.')) {
        const optional = this.next().value === '?.';
        if (optional && this.isPunct('[')) {
          this.next();
          const property = this.parseExpression();
          this.expectPunct(']');
          expr = {
            type: 'member',
            object: expr,
            property,
            computed: true,
            optional,
          };
        } else {
          const name = this.next();
          if (name.type !== 'identifier') {
            throw new ExpressionSyntaxError(
              'Expected a property name after "."',
              name.pos,
            );
          }
          expr = {
            type: 'member',
            object: expr,
            property: { type: 'literal', value: name.value },
            computed: false,
            optional,
          };
        }
      } else if (this.isPunct('[')) {
        this.next();
        const property = this.parseExpression();
        this.expectPunct(']');
        expr = {
          type: 'member',
          object: expr,
          property,
          computed: true,
          optional: false,
        };
      } else if (this.isPunct('(')) {
        const open = this.peek();
        if (expr.type !== 'identifier') {
          throw new ExpressionSyntaxError(
            'Only helper functions such as fmt() or sum() can be called',
            open.pos,
          );
        }
        this.next();
        const args: ExprNode[] = [];
        if (!this.isPunct(')')) {
          do {
            args.push(this.parseExpression());
          } while (this.isPunct(',') && this.next());
        }
        this.expectPunct(')');
        expr = { type: 'call', callee: expr.name, args };
      } else {
        return expr;
      }
    }
  }

  private parsePrimary(): ExprNode {
    const token = this.next();
    switch (token.type) {
      case 'number':
        return { type: 'literal', value: Number(token.value) };
      case 'string':
        return { type: 'literal', value: token.value };
      case 'identifier':
        if (token.value === 'true') return { type: 'literal', value: true };
        if (token.value === 'false') return { type: 'literal', value: false };
        if (token.value === 'null') return { type: 'literal', value: null };
        if (token.value === 'undefined')
          return { type: 'literal', value: undefined };
        return { type: 'identifier', name: token.value };
      case 'punct':
        if (token.value === '(') {
          const inner = this.parseExpression();
          this.expectPunct(')');
          return inner;
        }
        if (token.value === '[') {
          const elements: ExprNode[] = [];
          while (!this.isPunct(']')) {
            elements.push(this.parseExpression());
            if (!this.isPunct(']')) this.expectPunct(',');
          }
          this.expectPunct(']');
          return { type: 'array', elements };
        }
        if (token.value === '{') {
          const entries: Array<{ key: string; value: ExprNode }> = [];
          while (!this.isPunct('}')) {
            const keyToken = this.next();
            if (
              keyToken.type !== 'identifier' &&
              keyToken.type !== 'string' &&
              keyToken.type !== 'number'
            ) {
              throw new ExpressionSyntaxError(
                'Expected an object key',
                keyToken.pos,
              );
            }
            let value: ExprNode;
            if (this.isPunct(':')) {
              this.next();
              value = this.parseExpression();
            } else if (keyToken.type === 'identifier') {
              value = { type: 'identifier', name: keyToken.value };
            } else {
              throw new ExpressionSyntaxError('Expected ":"', keyToken.pos);
            }
            entries.push({ key: keyToken.value, value });
            if (!this.isPunct('}')) this.expectPunct(',');
          }
          this.expectPunct('}');
          return { type: 'object', entries };
        }
        throw new ExpressionSyntaxError(
          `Unexpected "${token.value}"`,
          token.pos,
        );
      default:
        throw new ExpressionSyntaxError(
          'Unexpected end of expression',
          token.pos,
        );
    }
  }
}

const AST_CACHE = new Map<string, ExprNode>();
const AST_CACHE_LIMIT = 500;

/** Parse an expression; results are cached by source text. */
export function parseExpression(source: string): ExprNode {
  const cached = AST_CACHE.get(source);
  if (cached) return cached;
  const trimmed = source.trim();
  if (!trimmed) {
    throw new ExpressionSyntaxError('Empty expression', 0);
  }
  const ast = new Parser(tokenize(trimmed)).parseProgram();
  if (AST_CACHE.size >= AST_CACHE_LIMIT) {
    const firstKey = AST_CACHE.keys().next().value;
    if (firstKey !== undefined) AST_CACHE.delete(firstKey);
  }
  AST_CACHE.set(source, ast);
  return ast;
}

/** Root identifiers an expression reads (used for dependency tracking). */
export function collectRootIdentifiers(
  node: ExprNode,
  out = new Set<string>(),
) {
  switch (node.type) {
    case 'identifier':
      out.add(node.name);
      break;
    case 'array':
      node.elements.forEach((el) => collectRootIdentifiers(el, out));
      break;
    case 'object':
      node.entries.forEach((entry) => collectRootIdentifiers(entry.value, out));
      break;
    case 'member':
      collectRootIdentifiers(node.object, out);
      if (node.computed) collectRootIdentifiers(node.property, out);
      break;
    case 'call':
      node.args.forEach((arg) => collectRootIdentifiers(arg, out));
      break;
    case 'unary':
      collectRootIdentifiers(node.argument, out);
      break;
    case 'binary':
    case 'logical':
      collectRootIdentifiers(node.left, out);
      collectRootIdentifiers(node.right, out);
      break;
    case 'conditional':
      collectRootIdentifiers(node.test, out);
      collectRootIdentifiers(node.consequent, out);
      collectRootIdentifiers(node.alternate, out);
      break;
    default:
      break;
  }
  return out;
}

/**
 * Paths under `inputs` that an expression reads, e.g. `inputs.region.value`
 * yields "region". Returns '*' when the input name is computed.
 */
export function collectInputNames(node: ExprNode, out = new Set<string>()) {
  const visit = (n: ExprNode) => {
    if (
      n.type === 'member' &&
      n.object.type === 'identifier' &&
      n.object.name === 'inputs'
    ) {
      if (!n.computed && n.property.type === 'literal') {
        out.add(String(n.property.value));
      } else if (n.computed && n.property.type === 'literal') {
        out.add(String(n.property.value));
      } else {
        out.add('*');
        visit(n.property);
      }
      return;
    }
    if (n.type === 'identifier' && n.name === 'inputs') {
      out.add('*');
      return;
    }
    switch (n.type) {
      case 'array':
        n.elements.forEach(visit);
        break;
      case 'object':
        n.entries.forEach((e) => visit(e.value));
        break;
      case 'member':
        visit(n.object);
        if (n.computed) visit(n.property);
        break;
      case 'call':
        n.args.forEach(visit);
        break;
      case 'unary':
        visit(n.argument);
        break;
      case 'binary':
      case 'logical':
        visit(n.left);
        visit(n.right);
        break;
      case 'conditional':
        visit(n.test);
        visit(n.consequent);
        visit(n.alternate);
        break;
      default:
        break;
    }
  };
  visit(node);
  return out;
}
