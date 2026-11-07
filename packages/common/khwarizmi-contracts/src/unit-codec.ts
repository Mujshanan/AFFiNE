import {
  type ExactRational,
  type ExactScale,
  rational,
  type ScaleRatio,
  unitScaleRatio,
} from './numeric-codec.js';

export interface UnitDimensionTerm {
  base: string;
  numerator: string;
  denominator: string;
}

export interface UnitDefinition {
  unitId: string;
  symbol: string;
  scale: {
    kind: 'exact-rational' | 'piRational';
    numerator: string;
    denominator: string;
  };
  dimension: UnitDimensionTerm[];
}

export interface UnitRegistry {
  format: 'khwarizmi.unit-registry';
  version: string;
  units: UnitDefinition[];
  prefixes?: Array<{
    prefixId: string;
    symbol: string;
    scaleNumerator: string;
    scaleDenominator: string;
  }>;
  prefixableUnitIds?: string[];
}

export interface ResolvedUnit {
  unitId: string;
  symbol: string;
  registryVersion: string;
  scale: ExactScale;
  dimension: ExactRational[];
  dimensionBases: string[];
}

export interface UnitCodecError {
  code:
    | 'UNKNOWN_UNIT'
    | 'UNIT_REGISTRY_VERSION_MISMATCH'
    | 'DIMENSION_MISMATCH'
    | 'INVALID_UNIT_REGISTRY';
  message: string;
}

export class UnitCodecFailure extends Error {
  constructor(
    readonly code: UnitCodecError['code'],
    message: string
  ) {
    super(message);
  }
}

function parseRational(numerator: string, denominator: string): ExactRational {
  if (
    !/^-?(0|[1-9][0-9]*)$/.test(numerator) ||
    !/^[1-9][0-9]*$/.test(denominator)
  ) {
    throw new UnitCodecFailure(
      'INVALID_UNIT_REGISTRY',
      'Unit registry contains an invalid rational'
    );
  }
  return rational(BigInt(numerator), BigInt(denominator));
}

function normalizeDimension(terms: UnitDimensionTerm[]): {
  bases: string[];
  values: ExactRational[];
} {
  const combined = new Map<string, ExactRational>();
  for (const term of terms) {
    if (!term.base)
      throw new UnitCodecFailure(
        'INVALID_UNIT_REGISTRY',
        'Dimension base must be non-empty'
      );
    const exponent = parseRational(term.numerator, term.denominator);
    const previous = combined.get(term.base) ?? rational(0n, 1n);
    combined.set(
      term.base,
      rational(
        previous.numerator * exponent.denominator +
          exponent.numerator * previous.denominator,
        previous.denominator * exponent.denominator
      )
    );
  }
  const entries = [...combined.entries()]
    .filter(([, exponent]) => exponent.numerator !== 0n)
    .sort(([a], [b]) => a.localeCompare(b));
  return {
    bases: entries.map(([base]) => base),
    values: entries.map(([, exponent]) => exponent),
  };
}

export function loadUnitRegistry(value: unknown): UnitRegistry {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new UnitCodecFailure(
      'INVALID_UNIT_REGISTRY',
      'Unit registry must be an object'
    );
  }
  const registry = value as UnitRegistry;
  if (
    registry.format !== 'khwarizmi.unit-registry' ||
    typeof registry.version !== 'string' ||
    !registry.version ||
    !Array.isArray(registry.units)
  ) {
    throw new UnitCodecFailure(
      'INVALID_UNIT_REGISTRY',
      'Unit registry envelope is invalid'
    );
  }
  const ids = new Set<string>();
  for (const unit of registry.units) {
    if (
      !unit ||
      typeof unit.unitId !== 'string' ||
      !unit.unitId ||
      ids.has(unit.unitId) ||
      !Array.isArray(unit.dimension)
    ) {
      throw new UnitCodecFailure(
        'INVALID_UNIT_REGISTRY',
        'Unit IDs must be unique and dimensions must be arrays'
      );
    }
    ids.add(unit.unitId);
    if (
      !unit.scale ||
      typeof unit.scale.numerator !== 'string' ||
      typeof unit.scale.denominator !== 'string'
    ) {
      throw new UnitCodecFailure(
        'INVALID_UNIT_REGISTRY',
        'Unit scale is missing or malformed'
      );
    }
    const scale = parseRational(unit.scale.numerator, unit.scale.denominator);
    if (
      scale.numerator <= 0n ||
      !['exact-rational', 'piRational'].includes(unit.scale.kind)
    ) {
      throw new UnitCodecFailure(
        'INVALID_UNIT_REGISTRY',
        'Unit scale must be positive and use a supported encoding'
      );
    }
    normalizeDimension(unit.dimension);
  }
  return registry;
}

export function resolveUnit(
  unitId: string,
  registryValue: UnitRegistry | unknown,
  expectedVersion?: string
): ResolvedUnit {
  const registry = loadUnitRegistry(registryValue);
  if (expectedVersion && expectedVersion !== registry.version) {
    throw new UnitCodecFailure(
      'UNIT_REGISTRY_VERSION_MISMATCH',
      'Requested unit registry version does not match the loaded registry'
    );
  }
  const unit = registry.units.find(candidate => candidate.unitId === unitId);
  if (!unit)
    throw new UnitCodecFailure('UNKNOWN_UNIT', 'Unknown unit: ' + unitId);
  const dimension = normalizeDimension(unit.dimension);
  return {
    unitId: unit.unitId,
    symbol: unit.symbol,
    registryVersion: registry.version,
    scale: {
      kind: unit.scale.kind,
      numerator: BigInt(unit.scale.numerator),
      denominator: BigInt(unit.scale.denominator),
    },
    dimension: dimension.values,
    dimensionBases: dimension.bases,
  };
}

export function resolvePrefixedUnit(
  symbol: string,
  registryValue: UnitRegistry | unknown
): ResolvedUnit {
  const registry = loadUnitRegistry(registryValue);
  const direct = registry.units.find(unit => unit.symbol === symbol);
  if (direct) return resolveUnit(direct.unitId, registry);
  const prefixable = new Set(registry.prefixableUnitIds ?? []);
  for (const prefix of registry.prefixes ?? []) {
    if (
      !symbol.startsWith(prefix.symbol) ||
      symbol.length === prefix.symbol.length
    )
      continue;
    const baseSymbol = symbol.slice(prefix.symbol.length);
    const base = registry.units.find(
      unit => unit.symbol === baseSymbol && prefixable.has(unit.unitId)
    );
    if (!base) continue;
    if (base.scale.kind !== 'exact-rational') {
      throw new UnitCodecFailure(
        'INVALID_UNIT_REGISTRY',
        'Prefixes on symbolic-pi units are not supported'
      );
    }
    const baseScale = parseRational(
      base.scale.numerator,
      base.scale.denominator
    );
    const prefixScale = parseRational(
      prefix.scaleNumerator,
      prefix.scaleDenominator
    );
    const scale = rational(
      baseScale.numerator * prefixScale.numerator,
      baseScale.denominator * prefixScale.denominator
    );
    const dimension = normalizeDimension(base.dimension);
    return {
      unitId: base.unitId + ':' + prefix.prefixId,
      symbol,
      registryVersion: registry.version,
      scale: {
        kind: 'exact-rational',
        numerator: scale.numerator,
        denominator: scale.denominator,
      },
      dimension: dimension.values,
      dimensionBases: dimension.bases,
    };
  }
  throw new UnitCodecFailure('UNKNOWN_UNIT', 'Unknown unit symbol: ' + symbol);
}

export function dimensionsCompatible(
  left: ResolvedUnit,
  right: ResolvedUnit
): boolean {
  if (left.dimensionBases.length !== right.dimensionBases.length) return false;
  return left.dimensionBases.every(
    (base, index) =>
      base === right.dimensionBases[index] &&
      left.dimension[index]?.numerator === right.dimension[index]?.numerator &&
      left.dimension[index]?.denominator === right.dimension[index]?.denominator
  );
}

export function conversionRatio(
  source: ResolvedUnit,
  target: ResolvedUnit
): ScaleRatio {
  if (!dimensionsCompatible(source, target)) {
    throw new UnitCodecFailure(
      'DIMENSION_MISMATCH',
      'Cannot convert between incompatible unit dimensions'
    );
  }
  return unitScaleRatio(source.scale, target.scale);
}

export function convertRationalMagnitude(
  value: ExactRational,
  ratio: ScaleRatio
): ExactRational {
  if (ratio.piExponent !== 0) {
    throw new UnitCodecFailure(
      'INVALID_UNIT_REGISTRY',
      'Conversion requires a symbolic pi factor and cannot be represented as a rational magnitude'
    );
  }
  return rational(
    value.numerator * ratio.rational.numerator,
    value.denominator * ratio.rational.denominator
  );
}

export function combineDimensions(
  left: ResolvedUnit,
  right: ResolvedUnit,
  operation: 'multiply' | 'divide'
): Array<{ base: string; numerator: string; denominator: string }> {
  const exponents = new Map<string, ExactRational>();
  left.dimensionBases.forEach((base, index) => {
    const exponent = left.dimension[index];
    if (exponent) exponents.set(base, exponent);
  });
  right.dimensionBases.forEach((base, index) => {
    const current = exponents.get(base) ?? rational(0n, 1n);
    const next = right.dimension[index];
    if (!next) return;
    exponents.set(
      base,
      rational(
        current.numerator * next.denominator +
          (operation === 'multiply' ? 1n : -1n) *
            next.numerator *
            current.denominator,
        current.denominator * next.denominator
      )
    );
  });
  return [...exponents.entries()]
    .filter(([, exponent]) => exponent.numerator !== 0n)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([base, exponent]) => ({
      base,
      numerator: exponent.numerator.toString(),
      denominator: exponent.denominator.toString(),
    }));
}
