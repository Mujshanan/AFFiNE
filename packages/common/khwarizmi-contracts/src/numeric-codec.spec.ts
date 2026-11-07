import { describe, expect, it } from 'vitest';

import {
  decimalToRational,
  rational,
  rationalToMathJson,
  rationalToTerminatingDecimal,
  unitScaleRatio,
} from './numeric-codec.js';

describe('exact numeric codec', () => {
  it('parses decimals and exponents without binary floating point', () => {
    expect(decimalToRational('0.125')).toEqual({
      numerator: 1n,
      denominator: 8n,
    });
    expect(decimalToRational('-1.25e2')).toEqual({
      numerator: -125n,
      denominator: 1n,
    });
    expect(decimalToRational('9007199254740993')).toEqual({
      numerator: 9007199254740993n,
      denominator: 1n,
    });
  });

  it('reduces rationals and only converts terminating expansions to decimal', () => {
    expect(rational(12n, 16n)).toEqual({ numerator: 3n, denominator: 4n });
    expect(rationalToTerminatingDecimal(rational(1n, 8n))).toBe('0.125');
    expect(rationalToTerminatingDecimal(rational(1n, 3n))).toBeUndefined();
  });

  it('serializes exact values without JS number conversion', () => {
    expect(rationalToMathJson(rational(3n, 1n))).toEqual({ num: '3' });
    expect(rationalToMathJson(rational(3n, 4n))).toEqual([
      'Rational',
      { num: '3' },
      { num: '4' },
    ]);
  });

  it('keeps pi symbolic in unit conversion factors', () => {
    expect(
      unitScaleRatio(
        { kind: 'piRational', numerator: 1n, denominator: 180n },
        { kind: 'exact-rational', numerator: 1n, denominator: 1n }
      )
    ).toEqual({
      rational: { numerator: 1n, denominator: 180n },
      piExponent: 1,
    });
    expect(
      unitScaleRatio(
        { kind: 'piRational', numerator: 1n, denominator: 180n },
        { kind: 'piRational', numerator: 1n, denominator: 2n }
      )
    ).toEqual({ rational: { numerator: 1n, denominator: 90n }, piExponent: 0 });
  });
});
