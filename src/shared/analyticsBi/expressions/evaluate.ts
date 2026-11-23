/* eslint-disable max-classes-per-file -- the evaluator and its two error types belong together */
/**
 * Tree-walking evaluator for analytics expressions.
 *
 * Safety model: no eval / Function, no method calls, only whitelisted helper
 * functions, member access restricted to own data properties of plain
 * objects and arrays (plus `.length`), blocked names, and a step budget so a
 * shared page cannot hang the renderer.
 */
import { formatValue } from '../format';
import { ExprNode, parseExpression } from './parser';

export class ExpressionRuntimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExpressionRuntimeError';
  }
}

/** Thrown when an expression reads a name the scope doesn't define. */
export class UnknownIdentifierError extends ExpressionRuntimeError {
  readonly identifier: string;

  constructor(identifier: string) {
    super(`"${identifier}" is not defined on this page`);
    this.name = 'UnknownIdentifierError';
    this.identifier = identifier;
  }
}

export const BLOCKED_NAMES = new Set([
  'constructor',
  '__proto__',
  'prototype',
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__',
  'globalThis',
  'window',
  'document',
  'process',
  'require',
  'Function',
  'eval',
]);

export const DEFAULT_STEP_LIMIT = 10_000;

export type Scope = Record<string, unknown>;

function toNumbers(values: unknown): number[] {
  if (!Array.isArray(values)) return [];
  return values
    .map((v) => (typeof v === 'number' ? v : Number(v)))
    .filter((v) => Number.isFinite(v));
}

/** Pull one column out of query rows, or accept a plain array of values. */
function columnValues(rows: unknown, column?: unknown): unknown[] {
  if (!Array.isArray(rows)) return [];
  if (column === undefined || column === null) return rows;
  return rows.map((row) =>
    row && typeof row === 'object'
      ? (row as Record<string, unknown>)[String(column)]
      : undefined,
  );
}

type Helper = (...args: unknown[]) => unknown;

/** Functions callable from page expressions. */
export const HELPERS: Record<string, Helper> = {
  fmt: (value, format) =>
    formatValue(value, typeof format === 'string' ? format : undefined),
  sum: (rows, column) =>
    toNumbers(columnValues(rows, column)).reduce((a, b) => a + b, 0),
  avg: (rows, column) => {
    const nums = toNumbers(columnValues(rows, column));
    return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
  },
  min: (rows, column) => {
    const nums = toNumbers(columnValues(rows, column));
    return nums.length ? nums.reduce((a, b) => (b < a ? b : a)) : null;
  },
  max: (rows, column) => {
    const nums = toNumbers(columnValues(rows, column));
    return nums.length ? nums.reduce((a, b) => (b > a ? b : a)) : null;
  },
  count: (rows, column) => {
    if (!Array.isArray(rows)) return 0;
    if (column === undefined) return rows.length;
    return columnValues(rows, column).filter(
      (v) => v !== null && v !== undefined,
    ).length;
  },
  countDistinct: (rows, column) =>
    new Set(columnValues(rows, column).map((v) => String(v))).size,
  round: (value, digits) => {
    const n = Number(value);
    const d = Number(digits ?? 0);
    if (!Number.isFinite(n)) return null;
    const f = 10 ** Math.max(0, Math.min(10, Number.isFinite(d) ? d : 0));
    return Math.round(n * f) / f;
  },
  abs: (value) => Math.abs(Number(value)),
  first: (rows) => (Array.isArray(rows) ? rows[0] : undefined),
  last: (rows) => (Array.isArray(rows) ? rows[rows.length - 1] : undefined),
  upper: (value) => String(value ?? '').toUpperCase(),
  lower: (value) => String(value ?? '').toLowerCase(),
  join: (values, separator) =>
    Array.isArray(values)
      ? values
          .map((v) => String(v))
          .join(separator === undefined ? ', ' : String(separator))
      : String(values ?? ''),
  unique: (rows, column) =>
    Array.from(new Set(columnValues(rows, column).map((v) => v))),
  pluck: (rows, column) => columnValues(rows, column),
  includes: (collection, value) =>
    Array.isArray(collection)
      ? collection.includes(value)
      : String(collection ?? '').includes(String(value)),
};

export const HELPER_NAMES = Object.keys(HELPERS);

function readProperty(target: unknown, key: unknown): unknown {
  if (target === null || target === undefined) {
    throw new ExpressionRuntimeError(
      `Cannot read "${String(key)}" of ${target === null ? 'null' : 'undefined'}`,
    );
  }
  const name = typeof key === 'number' ? key : String(key);
  if (typeof name === 'string' && BLOCKED_NAMES.has(name)) {
    throw new ExpressionRuntimeError(`"${name}" cannot be read in a page`);
  }
  if (Array.isArray(target) || typeof target === 'string') {
    if (name === 'length') return target.length;
    const index = typeof name === 'number' ? name : Number(name);
    if (Number.isInteger(index)) {
      // Negative indexes count from the end, like Array.prototype.at.
      const i = index < 0 ? target.length + index : index;
      return target[i];
    }
    return undefined;
  }
  if (typeof target === 'object') {
    const proto = Object.getPrototypeOf(target);
    if (proto !== Object.prototype && proto !== null) {
      throw new ExpressionRuntimeError('Only plain data can be read in a page');
    }
    return Object.prototype.hasOwnProperty.call(target, name)
      ? (target as Record<string, unknown>)[name as string]
      : undefined;
  }
  return undefined;
}

function compare(op: string, a: unknown, b: unknown): boolean {
  switch (op) {
    case '==':
      // eslint-disable-next-line eqeqeq
      return a == b;
    case '!=':
      // eslint-disable-next-line eqeqeq
      return a != b;
    case '===':
      return a === b;
    case '!==':
      return a !== b;
    case '<':
      return (a as number) < (b as number);
    case '<=':
      return (a as number) <= (b as number);
    case '>':
      return (a as number) > (b as number);
    case '>=':
      return (a as number) >= (b as number);
    default:
      throw new ExpressionRuntimeError(`Unknown operator ${op}`);
  }
}

class Evaluator {
  private steps = 0;

  private readonly scope: Scope;

  private readonly stepLimit: number;

  constructor(scope: Scope, stepLimit: number) {
    this.scope = scope;
    this.stepLimit = stepLimit;
  }

  private tick() {
    this.steps += 1;
    if (this.steps > this.stepLimit) {
      throw new ExpressionRuntimeError('Expression took too many steps');
    }
  }

  evaluate(node: ExprNode): unknown {
    this.tick();
    switch (node.type) {
      case 'literal':
        return node.value;
      case 'identifier': {
        if (BLOCKED_NAMES.has(node.name)) {
          throw new ExpressionRuntimeError(
            `"${node.name}" cannot be used in a page`,
          );
        }
        if (!Object.prototype.hasOwnProperty.call(this.scope, node.name)) {
          throw new UnknownIdentifierError(node.name);
        }
        return this.scope[node.name];
      }
      case 'array':
        return node.elements.map((el) => this.evaluate(el));
      case 'object': {
        const out: Record<string, unknown> = {};
        node.entries.forEach((entry) => {
          if (BLOCKED_NAMES.has(entry.key)) {
            throw new ExpressionRuntimeError(
              `"${entry.key}" cannot be used as a key`,
            );
          }
          out[entry.key] = this.evaluate(entry.value);
        });
        return out;
      }
      case 'member': {
        const target = this.evaluate(node.object);
        if (node.optional && (target === null || target === undefined)) {
          return undefined;
        }
        const key = node.computed
          ? this.evaluate(node.property)
          : (node.property as { value: unknown }).value;
        return readProperty(target, key);
      }
      case 'call': {
        if (!Object.prototype.hasOwnProperty.call(HELPERS, node.callee)) {
          throw new ExpressionRuntimeError(
            `"${node.callee}" is not a helper function. Available: ${HELPER_NAMES.join(', ')}`,
          );
        }
        const args = node.args.map((arg) => this.evaluate(arg));
        return HELPERS[node.callee](...args);
      }
      case 'unary': {
        const value = this.evaluate(node.argument);
        if (node.operator === '!') return !value;
        if (node.operator === '-') return -(value as number);
        return +(value as number);
      }
      case 'logical': {
        const left = this.evaluate(node.left);
        if (node.operator === '&&')
          return left ? this.evaluate(node.right) : left;
        if (node.operator === '||') return left || this.evaluate(node.right);
        return left ?? this.evaluate(node.right);
      }
      case 'binary': {
        const left = this.evaluate(node.left) as any;
        const right = this.evaluate(node.right) as any;
        switch (node.operator) {
          case '+':
            if (typeof left === 'object' || typeof right === 'object') {
              throw new ExpressionRuntimeError('Cannot add objects or arrays');
            }
            return left + right;
          case '-':
            return left - right;
          case '*':
            return left * right;
          case '/':
            return left / right;
          case '%':
            return left % right;
          default:
            return compare(node.operator, left, right);
        }
      }
      case 'conditional':
        return this.evaluate(node.test)
          ? this.evaluate(node.consequent)
          : this.evaluate(node.alternate);
      default:
        throw new ExpressionRuntimeError('Unsupported expression');
    }
  }
}

export function evaluateAst(
  ast: ExprNode,
  scope: Scope,
  stepLimit = DEFAULT_STEP_LIMIT,
): unknown {
  return new Evaluator(scope, stepLimit).evaluate(ast);
}

/** Parse and evaluate an expression against a scope. Throws on error. */
export function evaluateExpression(
  source: string,
  scope: Scope,
  stepLimit = DEFAULT_STEP_LIMIT,
): unknown {
  return evaluateAst(parseExpression(source), scope, stepLimit);
}

export type SafeEvalResult =
  | { ok: true; value: unknown }
  | { ok: false; error: Error; unknownIdentifier?: string };

/** Like evaluateExpression, but returns errors instead of throwing. */
export function tryEvaluate(source: string, scope: Scope): SafeEvalResult {
  try {
    return { ok: true, value: evaluateExpression(source, scope) };
  } catch (error) {
    return {
      ok: false,
      error: error as Error,
      unknownIdentifier:
        error instanceof UnknownIdentifierError ? error.identifier : undefined,
    };
  }
}
