/* eslint-disable no-template-curly-in-string -- these tests write page SQL that contains ${inputs...} */
import {
  evaluateExpression,
  tryEvaluate,
  UnknownIdentifierError,
} from '../../../../src/shared/analyticsBi/expressions/evaluate';
import {
  collectInputNames,
  parseExpression,
} from '../../../../src/shared/analyticsBi/expressions/parser';
import { ExpressionSyntaxError } from '../../../../src/shared/analyticsBi/expressions/tokenizer';

const orders = [
  { region: 'EMEA', total: 1200.5, orders: 10 },
  { region: 'AMER', total: 800, orders: 4 },
];

describe('analytics expressions', () => {
  it('reads query rows like legacy Evidence inline values', () => {
    const scope = { orders };
    expect(evaluateExpression('orders[0].total', scope)).toBe(1200.5);
    expect(evaluateExpression('orders.length', scope)).toBe(2);
    expect(evaluateExpression("orders[1]['region']", scope)).toBe('AMER');
    expect(evaluateExpression('orders[-1].region', scope)).toBe('AMER');
  });

  it('supports arithmetic, comparison, logic and ternaries with precedence', () => {
    expect(evaluateExpression('1 + 2 * 3', {})).toBe(7);
    expect(evaluateExpression('(1 + 2) * 3', {})).toBe(9);
    expect(evaluateExpression('10 % 4 - -1', {})).toBe(3);
    expect(evaluateExpression('2 > 1 && 1 >= 1', {})).toBe(true);
    expect(evaluateExpression('null ?? "x"', {})).toBe('x');
    expect(evaluateExpression('0 || "fallback"', {})).toBe('fallback');
    expect(
      evaluateExpression('orders.length > 1 ? "many" : "one"', { orders }),
    ).toBe('many');
    expect(evaluateExpression("'a' + 'b' === 'ab'", {})).toBe(true);
    expect(evaluateExpression('!true', {})).toBe(false);
  });

  it('supports optional chaining, arrays and objects', () => {
    expect(
      evaluateExpression('missing?.value', { missing: null }),
    ).toBeUndefined();
    expect(evaluateExpression('[1, 2, 3][2]', {})).toBe(3);
    expect(evaluateExpression("{ a: 1, 'b c': 2 }", {})).toEqual({
      a: 1,
      'b c': 2,
    });
  });

  it('calls whitelisted helpers', () => {
    const scope = { orders };
    expect(evaluateExpression("sum(orders, 'orders')", scope)).toBe(14);
    expect(evaluateExpression("avg(orders, 'orders')", scope)).toBe(7);
    expect(evaluateExpression("fmt(orders[0].total, 'usd0')", scope)).toBe(
      '$1,201',
    );
    expect(evaluateExpression('round(2.345, 2)', scope)).toBe(2.35);
    expect(evaluateExpression('count(orders)', scope)).toBe(2);
    expect(
      evaluateExpression("join(pluck(orders, 'region'), ' / ')", scope),
    ).toBe('EMEA / AMER');
  });

  it('rejects calls to anything but helpers', () => {
    expect(() => evaluateExpression('alert(1)', {})).toThrow(/not a helper/);
    expect(() => parseExpression('orders.map(x)')).toThrow(
      ExpressionSyntaxError,
    );
    expect(() => parseExpression('orders[0](1)')).toThrow(
      ExpressionSyntaxError,
    );
  });

  it('blocks prototype and global access', () => {
    const scope = { orders, obj: { a: 1 } };
    expect(() => evaluateExpression('obj.constructor', scope)).toThrow(
      /cannot be read/,
    );
    expect(() => evaluateExpression("obj['__proto__']", scope)).toThrow(
      /cannot be read/,
    );
    expect(() => evaluateExpression("obj['con' + 'structor']", scope)).toThrow(
      /cannot be read/,
    );
    expect(() => evaluateExpression('constructor', scope)).toThrow(
      /cannot be used/,
    );
    expect(() => evaluateExpression('window', scope)).toThrow(/cannot be used/);
    expect(() => evaluateExpression('globalThis', scope)).toThrow(
      /cannot be used/,
    );
    expect(() => evaluateExpression('{ __proto__: 1 }', scope)).toThrow(
      /cannot be used/,
    );
    expect(evaluateExpression('obj.toString', scope)).toBeUndefined();
    expect(() => evaluateExpression('d.x', { d: new Date() })).toThrow(
      /plain data/,
    );
  });

  it('reports unknown identifiers distinctly', () => {
    const result = tryEvaluate('nope.value', {});
    expect(result).toMatchObject({ ok: false, unknownIdentifier: 'nope' });
    expect((result as { error?: Error }).error).toBeInstanceOf(
      UnknownIdentifierError,
    );
  });

  it('enforces a step limit', () => {
    const big = Array.from({ length: 200 }, (_, i) => `${i}`).join(' + ');
    expect(() => evaluateExpression(big, {}, 50)).toThrow(/too many steps/);
  });

  it('enforces a nesting limit', () => {
    const deep = `${'('.repeat(200)}1${')'.repeat(200)}`;
    expect(() => parseExpression(deep)).toThrow(/too deeply/);
  });

  it('rejects template literal interpolation and unterminated strings', () => {
    expect(() => parseExpression('`a${b}`')).toThrow(/Template literals/);
    expect(() => parseExpression("'abc")).toThrow(/Unterminated/);
  });

  it('collects the input names an expression reads', () => {
    expect(
      Array.from(collectInputNames(parseExpression('inputs.region.value'))),
    ).toEqual(['region']);
    expect(
      Array.from(
        collectInputNames(
          parseExpression("inputs['period'].start + inputs.b.label"),
        ),
      ).sort(),
    ).toEqual(['b', 'period']);
    expect(
      Array.from(collectInputNames(parseExpression('inputs[x].value'))),
    ).toContain('*');
  });

  it('never escapes the sandbox for random inputs (fuzz)', () => {
    const atoms = [
      'constructor',
      '__proto__',
      'prototype',
      'obj',
      'orders',
      '[0]',
      '.length',
      "['constructor']",
      '(',
      ')',
      '+',
      '-',
      '*',
      '?',
      ':',
      '!',
      '1',
      "'x'",
      'fmt(',
      'sum(',
      ',',
      '.',
      'window',
      '{',
      '}',
    ];
    let seed = 42;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const scope = { obj: { a: 1 }, orders };
    for (let i = 0; i < 2000; i += 1) {
      const len = 1 + Math.floor(rand() * 10);
      let src = '';
      for (let j = 0; j < len; j += 1)
        src += atoms[Math.floor(rand() * atoms.length)];
      const result = tryEvaluate(src, scope);
      // Fuzzing: only successful results are checked.
      /* eslint-disable jest/no-conditional-expect */
      if (result.ok) {
        expect(typeof result.value).not.toBe('function');
        if (result.value && typeof result.value === 'object') {
          expect([Object.prototype, Array.prototype, null]).toContain(
            Object.getPrototypeOf(result.value),
          );
        }
      }
      /* eslint-enable jest/no-conditional-expect */
    }
  });
});
