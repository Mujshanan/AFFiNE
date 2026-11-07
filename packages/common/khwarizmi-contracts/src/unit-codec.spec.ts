import { describe, expect, it } from 'vitest';

import { rational } from './numeric-codec.js';
import {
  combineDimensions,
  conversionRatio,
  convertRationalMagnitude,
  dimensionsCompatible,
  resolvePrefixedUnit,
  resolveUnit,
} from './unit-codec.js';

const registry = {
  format: 'khwarizmi.unit-registry' as const,
  version: 'test-1',
  units: [
    { unitId: 'metre', symbol: 'm', scale: { kind: 'exact-rational' as const, numerator: '1', denominator: '1' }, dimension: [{ base: 'length', numerator: '1', denominator: '1' }] },
    { unitId: 'millimetre', symbol: 'mm', scale: { kind: 'exact-rational' as const, numerator: '1', denominator: '1000' }, dimension: [{ base: 'length', numerator: '1', denominator: '1' }] },
    { unitId: 'second', symbol: 's', scale: { kind: 'exact-rational' as const, numerator: '1', denominator: '1' }, dimension: [{ base: 'time', numerator: '1', denominator: '1' }] },
    { unitId: 'radian', symbol: 'rad', scale: { kind: 'exact-rational' as const, numerator: '1', denominator: '1' }, dimension: [{ base: 'angle', numerator: '1', denominator: '1' }] },
    { unitId: 'degree', symbol: 'deg', scale: { kind: 'piRational' as const, numerator: '1', denominator: '180' }, dimension: [{ base: 'angle', numerator: '1', denominator: '1' }] },
  ],
  prefixes: [{ prefixId: 'kilo', symbol: 'k', scaleNumerator: '1000', scaleDenominator: '1' }],
  prefixableUnitIds: ['metre'],
};

describe('exact unit codec', () => {
  it('converts between compatible units using exact rational scales', () => {
    const mm = resolveUnit('millimetre', registry, 'test-1');
    const m = resolveUnit('metre', registry);
    expect(dimensionsCompatible(mm, m)).toBe(true);
    const ratio = conversionRatio(mm, m);
    expect(ratio).toEqual({ rational: { numerator: 1n, denominator: 1000n }, piExponent: 0 });
    expect(convertRationalMagnitude(rational(1250n, 1n), ratio)).toEqual(rational(5n, 4n));
  });

  it('rejects incompatible dimensions before conversion', () => {
    const mm = resolveUnit('millimetre', registry);
    const seconds = resolveUnit('second', registry);
    expect(dimensionsCompatible(mm, seconds)).toBe(false);
    expect(() => conversionRatio(mm, seconds)).toThrow(/incompatible/);
  });

  it('keeps degree-to-radian conversion symbolic', () => {
    const degrees = resolveUnit('degree', registry);
    const radians = resolveUnit('radian', registry);
    expect(conversionRatio(degrees, radians)).toEqual({
      rational: { numerator: 1n, denominator: 180n },
      piExponent: 1,
    });
    expect(() => convertRationalMagnitude(rational(180n, 1n), conversionRatio(degrees, radians))).toThrow(/symbolic pi/);
  });

  it('resolves allowed SI prefixes without changing dimensions', () => {
    const km = resolvePrefixedUnit('km', registry);
    expect(km.scale).toEqual({ kind: 'exact-rational', numerator: 1000n, denominator: 1n });
    expect(km.dimensionBases).toEqual(['length']);
  });

  it('combines dimensions by adding or subtracting rational exponents', () => {
    const metre = resolveUnit('metre', registry);
    const seconds = resolveUnit('second', registry);
    expect(combineDimensions(metre, seconds, 'divide')).toEqual([
      { base: 'length', numerator: '1', denominator: '1' },
      { base: 'time', numerator: '-1', denominator: '1' },
    ]);
    expect(combineDimensions(metre, metre, 'divide')).toEqual([]);
  });
});
