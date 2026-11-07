import * as NumericCodec from './numeric-codec.js';
import * as UnitCodec from './unit-codec.js';

type ExactRational = NumericCodec.ExactRational;
type ResolvedUnit = UnitCodec.ResolvedUnit;
type UnitRegistry = UnitCodec.UnitRegistry;
const { rational } = NumericCodec;
const { UnitCodecFailure, resolveUnit } = UnitCodec;

export type MathJsonValue =
  | null
  | boolean
  | number
  | string
  | MathJsonValue[]
  | { [key: string]: MathJsonValue };

export type UnitEvaluationErrorCode =
  | 'DIMENSION_MISMATCH'
  | 'UNSUPPORTED_UNIT_KIND'
  | 'UNIT_REGISTRY_REQUIRED';

export class UnitEvaluationFailure extends Error {
  constructor(
    readonly code: UnitEvaluationErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'UnitEvaluationFailure';
  }
}

export interface UnitScaleValue {
  numerator: bigint;
  denominator: bigint;
  piExponent: number;
}

export interface UnitFactor {
  unitId: string;
  exponent: ExactRational;
}

export interface UnitQuantity {
  unitId: string;
  registryVersion: string;
  symbol: string;
  dimension: ExactRational[];
  dimensionBases: string[];
  scale: UnitScaleValue;
  factors: UnitFactor[];
}

export interface UnitPreparationOptions {
  registry?: UnitRegistry;
  expectedRegistryVersion: string;
  unitAttachments: unknown;
  bindings: ReadonlyMap<
    string,
    { symbolId: string; state: { unit?: UnitQuantity } }
  >;
  resolveSymbolUnit: (symbolId: string) => UnitQuantity | undefined;
  targetUnit?: UnitQuantity;
}

export interface UnitPreparationResult {
  mathJson: MathJsonValue;
  unit?: UnitQuantity;
}

interface NodeResult {
  mathJson: MathJsonValue;
  unit?: UnitQuantity;
}

function exactUnit(unit: ResolvedUnit): UnitQuantity {
  return {
    unitId: unit.unitId,
    registryVersion: unit.registryVersion,
    symbol: unit.symbol,
    dimension: unit.dimension,
    dimensionBases: unit.dimensionBases,
    scale: {
      numerator: unit.scale.numerator,
      denominator: unit.scale.denominator,
      piExponent: unit.scale.kind === 'piRational' ? 1 : 0,
    },
    factors: [{ unitId: unit.unitId, exponent: rational(1n, 1n) }],
  };
}

function rationalMultiply(left: ExactRational, right: ExactRational): ExactRational {
  return rational(
    left.numerator * right.numerator,
    left.denominator * right.denominator
  );
}

function rationalDivide(left: ExactRational, right: ExactRational): ExactRational {
  if (right.numerator === 0n)
    throw new UnitEvaluationFailure('UNSUPPORTED_UNIT_KIND', 'Unit scale division by zero');
  return rational(
    left.numerator * right.denominator,
    left.denominator * right.numerator
  );
}

function rationalAdd(
  left: ExactRational,
  right: ExactRational,
  subtract = false
): ExactRational {
  return rational(
    left.numerator * right.denominator +
      (subtract ? -1n : 1n) * right.numerator * left.denominator,
    left.denominator * right.denominator
  );
}

function multiplyScales(
  left: UnitScaleValue,
  right: UnitScaleValue,
  divide = false
): UnitScaleValue {
  const a = rational(left.numerator, left.denominator);
  const b = rational(right.numerator, right.denominator);
  const ratio = divide ? rationalDivide(a, b) : rationalMultiply(a, b);
  return {
    numerator: ratio.numerator,
    denominator: ratio.denominator,
    piExponent: left.piExponent + (divide ? -1 : 1) * right.piExponent,
  };
}

function powerScale(scale: UnitScaleValue, exponent: number): UnitScaleValue {
  const value = rational(scale.numerator, scale.denominator);
  const absolute = BigInt(Math.abs(exponent));
  const numerator = value.numerator ** absolute;
  const denominator = value.denominator ** absolute;
  const powered =
    exponent < 0
      ? rational(denominator, numerator)
      : rational(numerator, denominator);
  return {
    numerator: powered.numerator,
    denominator: powered.denominator,
    piExponent: scale.piExponent * exponent,
  };
}

function combineFactors(
  left: UnitFactor[],
  right: UnitFactor[],
  operation: 'multiply' | 'divide'
): UnitFactor[] {
  const values = new Map<string, ExactRational>();
  for (const factor of left) values.set(factor.unitId, factor.exponent);
  for (const factor of right) {
    const previous = values.get(factor.unitId) ?? rational(0n, 1n);
    values.set(
      factor.unitId,
      rationalAdd(previous, factor.exponent, operation === 'divide')
    );
  }
  return [...values.entries()]
    .filter(([, exponent]) => exponent.numerator !== 0n)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([unitId, exponent]) => ({ unitId, exponent }));
}

function combineDimensions(
  left: UnitQuantity,
  right: UnitQuantity,
  operation: 'multiply' | 'divide'
): { bases: string[]; values: ExactRational[] } {
  const values = new Map<string, ExactRational>();
  left.dimensionBases.forEach((base, index) => {
    const exponent = left.dimension[index];
    if (exponent) values.set(base, exponent);
  });
  right.dimensionBases.forEach((base, index) => {
    const previous = values.get(base) ?? rational(0n, 1n);
    const exponent = right.dimension[index];
    if (exponent)
      values.set(
        base,
        rationalAdd(previous, exponent, operation === 'divide')
      );
  });
  const entries = [...values.entries()]
    .filter(([, exponent]) => exponent.numerator !== 0n)
    .sort(([a], [b]) => a.localeCompare(b));
  return {
    bases: entries.map(([base]) => base),
    values: entries.map(([, exponent]) => exponent),
  };
}

function sameDimension(left: UnitQuantity, right: UnitQuantity): boolean {
  return (
    left.dimensionBases.length === right.dimensionBases.length &&
    left.dimensionBases.every(
      (base, index) =>
        base === right.dimensionBases[index] &&
        left.dimension[index]?.numerator === right.dimension[index]?.numerator &&
        left.dimension[index]?.denominator === right.dimension[index]?.denominator
    )
  );
}

function requiredAt<T>(values: readonly T[], index: number, label: string): T {
  const value = values[index];
  if (value === undefined)
    throw new UnitEvaluationFailure(
      'UNSUPPORTED_UNIT_KIND',
      'Missing ' + label + ' at index ' + index
    );
  return value;
}

function factorKey(factors: UnitFactor[]): string {
  return factors
    .map(factor => factor.unitId + '^' + factor.exponent.numerator + '/' + factor.exponent.denominator)
    .join('*');
}

function derivedUnit(
  left: UnitQuantity,
  right: UnitQuantity,
  operation: 'multiply' | 'divide'
): UnitQuantity {
  const dimensions = combineDimensions(left, right, operation);
  const factors = combineFactors(left.factors, right.factors, operation);
  const symbol =
    operation === 'multiply'
      ? left.symbol + '·' + right.symbol
      : left.symbol + '/' + right.symbol;
  return {
    unitId: 'derived:' + factorKey(factors),
    registryVersion: left.registryVersion,
    symbol,
    dimension: dimensions.values,
    dimensionBases: dimensions.bases,
    scale: multiplyScales(left.scale, right.scale, operation === 'divide'),
    factors,
  };
}

function scaleRatio(source: UnitQuantity, target: UnitQuantity): UnitScaleValue {
  if (!sameDimension(source, target))
    throw new UnitEvaluationFailure(
      'DIMENSION_MISMATCH',
      'Cannot combine quantities with incompatible dimensions'
    );
  const ratio = rationalDivide(
    rational(source.scale.numerator, source.scale.denominator),
    rational(target.scale.numerator, target.scale.denominator)
  );
  return {
    numerator: ratio.numerator,
    denominator: ratio.denominator,
    piExponent: source.scale.piExponent - target.scale.piExponent,
  };
}

function rationalMathJson(numerator: bigint, denominator: bigint): MathJsonValue {
  return [
    'Rational',
    { num: numerator.toString() },
    { num: denominator.toString() },
  ];
}

function scaleMathJson(scale: UnitScaleValue): MathJsonValue {
  const factors: MathJsonValue[] = [];
  if (scale.numerator !== 1n || scale.denominator !== 1n)
    factors.push(rationalMathJson(scale.numerator, scale.denominator));
  if (scale.piExponent !== 0)
    factors.push(['Power', 'Pi', scale.piExponent]);
  if (factors.length === 0) return 1;
  return factors.length === 1
    ? requiredAt(factors, 0, 'unit scale factor')
    : ['Multiply', ...factors];
}

function applyScale(
  mathJson: MathJsonValue,
  ratio: UnitScaleValue
): MathJsonValue {
  if (
    ratio.numerator === 1n &&
    ratio.denominator === 1n &&
    ratio.piExponent === 0
  )
    return mathJson;
  const factors: MathJsonValue[] = [];
  if (ratio.numerator !== 1n || ratio.denominator !== 1n)
    factors.push(rationalMathJson(ratio.numerator, ratio.denominator));
  if (ratio.piExponent !== 0)
    factors.push(['Power', 'Pi', ratio.piExponent]);
  return ['Multiply', mathJson, ...factors];
}

function integerLiteral(value: MathJsonValue | undefined): number | undefined {
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value;
  if (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof value.num === 'string'
  ) {
    const numeric = Number(value.num);
    return Number.isSafeInteger(numeric) ? numeric : undefined;
  }
  return undefined;
}

function perfectSquareRoot(value: bigint): bigint | undefined {
  if (value < 0n) return undefined;
  if (value < 2n) return value;
  let low = 1n;
  let high = value;
  while (low <= high) {
    const middle = (low + high) / 2n;
    const square = middle * middle;
    if (square === value) return middle;
    if (square < value) low = middle + 1n;
    else high = middle - 1n;
  }
  return undefined;
}

function squareRootUnit(unit: UnitQuantity): UnitQuantity {
  const dimension: ExactRational[] = [];
  for (const exponent of unit.dimension) {
    dimension.push(rational(exponent.numerator, exponent.denominator * 2n));
  }
  const factors = unit.factors.map(factor => ({
    unitId: factor.unitId,
    exponent: rational(factor.exponent.numerator, factor.exponent.denominator * 2n),
  }));
  const numerator = perfectSquareRoot(unit.scale.numerator);
  const denominator = perfectSquareRoot(unit.scale.denominator);
  if (
    numerator === undefined ||
    denominator === undefined ||
    unit.scale.piExponent % 2 !== 0
  )
    throw new UnitEvaluationFailure(
      'UNSUPPORTED_UNIT_KIND',
      'Square root requires exact square unit scales and even pi exponents'
    );
  const scale = rational(numerator, denominator);
  return {
    unitId: 'derived:' + factorKey(factors),
    registryVersion: unit.registryVersion,
    symbol: '√(' + unit.symbol + ')',
    dimension,
    dimensionBases: unit.dimensionBases,
    scale: {
      numerator: scale.numerator,
      denominator: scale.denominator,
      piExponent: unit.scale.piExponent / 2,
    },
    factors,
  };
}

function unitRecord(unit: UnitQuantity): Record<string, unknown> {
  return {
    unitId: unit.unitId,
    registryVersion: unit.registryVersion,
    symbol: unit.symbol,
    dimension: unit.dimension.map((exponent, index) => ({
      base: unit.dimensionBases[index],
      numerator: exponent.numerator.toString(),
      denominator: exponent.denominator.toString(),
    })),
    factors: unit.factors.map(factor => ({
      unitId: factor.unitId,
      numerator: factor.exponent.numerator.toString(),
      denominator: factor.exponent.denominator.toString(),
    })),
    scaleToBaseMathJson: scaleMathJson(unit.scale),
  };
}

export function prepareUnitAwareMathJson(
  mathJson: MathJsonValue,
  options: UnitPreparationOptions
): UnitPreparationResult {
  const registry = options.registry;
  if (registry && registry.version !== options.expectedRegistryVersion)
    throw new UnitCodecFailure(
      'UNIT_REGISTRY_VERSION_MISMATCH',
      'Unit registry version does not match the authored expression'
    );
  const attachments = new Map<string, UnitQuantity>();
  for (const attachment of Array.isArray(options.unitAttachments)
    ? options.unitAttachments
    : []) {
    if (
      !attachment ||
      typeof attachment !== 'object' ||
      typeof (attachment as Record<string, unknown>).path !== 'string' ||
      typeof (attachment as Record<string, unknown>).unitId !== 'string'
    )
      continue;
    if (!registry)
      throw new UnitEvaluationFailure(
        'UNIT_REGISTRY_REQUIRED',
        'A unit registry is required to resolve expression unit attachments'
      );
    const record = attachment as Record<string, string>;
    attachments.set(
      record.path,
      exactUnit(
        resolveUnit(record.unitId, registry, options.expectedRegistryVersion)
      )
    );
  }

  const infer = (node: MathJsonValue, path: string): NodeResult => {
    let result: NodeResult = { mathJson: node };

    if (typeof node === 'string' && /^kz_[A-Za-z0-9_-]{1,80}$/.test(node)) {
      const binding = options.bindings.get(node);
      if (binding)
        result.unit =
          binding.state.unit ?? options.resolveSymbolUnit(binding.symbolId);
    } else if (Array.isArray(node)) {
      const operator = node[0];
      if (typeof operator !== 'string') return result;
      const children = node.slice(1).map((child, index) =>
        infer(child, path + '/' + (index + 1))
      );
      const childMath = children.map(child => child.mathJson);
      const childUnits = children.map(child => child.unit);

      if (operator === 'Add' || operator === 'Subtract') {
        const base = childUnits[0];
        if (childUnits.some(unit => Boolean(unit) !== Boolean(base)))
          throw new UnitEvaluationFailure(
            'DIMENSION_MISMATCH',
            'Addition and subtraction require operands with compatible dimensions'
          );
        if (base) {
          for (let index = 1; index < children.length; index++) {
            const source = childUnits[index];
            if (source)
              childMath[index] = applyScale(
                requiredAt(childMath, index, 'MathJSON operand'),
                scaleRatio(source, base)
              );
          }
        }
        result = {
          mathJson: [operator, ...childMath],
          ...(base ? { unit: base } : {}),
        };
      } else if (operator === 'Multiply' || operator === 'Divide') {
        let unit = childUnits[0];
        for (let index = 1; index < childUnits.length; index++) {
          const next = childUnits[index];
          if (!unit) {
            if (operator === 'Multiply') unit = next;
            else if (next) {
              const one: UnitQuantity = {
                unitId: 'derived:1',
                registryVersion: next.registryVersion,
                symbol: '1',
                dimension: [],
                dimensionBases: [],
                scale: { numerator: 1n, denominator: 1n, piExponent: 0 },
                factors: [],
              };
              unit = derivedUnit(one, next, 'divide');
            }
          } else if (next) {
            unit = derivedUnit(
              unit,
              next,
              operator === 'Multiply' ? 'multiply' : 'divide'
            );
          }
        }
        result = {
          mathJson: [operator, ...childMath],
          ...(unit ? { unit } : {}),
        };
      } else if (operator === 'Power') {
        const base = childUnits[0];
        if (childUnits[1])
          throw new UnitEvaluationFailure(
            'UNSUPPORTED_UNIT_KIND',
            'A unitful exponent is not supported'
          );
        const exponent = integerLiteral(node[2]);
        if (base && exponent === undefined)
          throw new UnitEvaluationFailure(
            'UNSUPPORTED_UNIT_KIND',
            'Unitful powers require an integer exponent in v1'
          );
        if (base && exponent !== undefined) {
          const dimensionEntries = base.dimensionBases
            .map((dimensionBase, index) => {
              const dimensionExponent = requiredAt(
                base.dimension,
                index,
                'unit dimension exponent'
              );
              return {
                base: dimensionBase,
                exponent: rational(
                  dimensionExponent.numerator * BigInt(exponent),
                  dimensionExponent.denominator
                ),
              };
            })
            .filter(entry => entry.exponent.numerator !== 0n);
          const dimension = dimensionEntries.map(entry => entry.exponent);
          const dimensionBases = dimensionEntries.map(entry => entry.base);
          const factors = base.factors
            .map(factor => ({
              unitId: factor.unitId,
              exponent: rational(
                factor.exponent.numerator * BigInt(exponent),
                factor.exponent.denominator
              ),
            }))
            .filter(factor => factor.exponent.numerator !== 0n);
          const powered = powerScale(base.scale, exponent);
          result = {
            mathJson: [operator, ...childMath],
            unit: {
              unitId: 'derived:' + factorKey(factors),
              registryVersion: base.registryVersion,
              symbol: base.symbol + '^' + exponent,
              dimension,
              dimensionBases,
              scale: powered,
              factors,
            },
          };
        } else {
          result = { mathJson: [operator, ...childMath] };
        }
      } else if (operator === 'Sqrt') {
        const base = childUnits[0];
        result = base
          ? { mathJson: [operator, ...childMath], unit: squareRootUnit(base) }
          : { mathJson: [operator, ...childMath] };
      } else if (operator === 'Sin' || operator === 'Cos' || operator === 'Tan') {
        const angle = childUnits[0];
        if (angle) {
          if (!registry)
            throw new UnitEvaluationFailure(
              'UNIT_REGISTRY_REQUIRED',
              'A unit registry is required for angle conversion'
            );
          const radianDefinition = registry.units.find(
            unit => unit.unitId === 'radian' || unit.symbol === 'rad'
          );
          if (!radianDefinition)
            throw new UnitEvaluationFailure(
              'UNSUPPORTED_UNIT_KIND',
              'The unit registry must define radians for trigonometric conversion'
            );
          const radians = exactUnit(
            resolveUnit(
              radianDefinition.unitId,
              registry,
              options.expectedRegistryVersion
            )
          );
          childMath[0] = applyScale(
            requiredAt(childMath, 0, 'trigonometric argument'),
            scaleRatio(angle, radians)
          );
        }
        result = { mathJson: [operator, ...childMath] };
      } else if (operator === 'Min' || operator === 'Max') {
        const base = childUnits[0];
        if (childUnits.some(unit => Boolean(unit) !== Boolean(base)))
          throw new UnitEvaluationFailure(
            'DIMENSION_MISMATCH',
            'Minimum and maximum require operands with compatible dimensions'
          );
        if (base) {
          for (let index = 1; index < children.length; index++) {
            const source = childUnits[index];
            if (source)
              childMath[index] = applyScale(
                requiredAt(childMath, index, 'comparison operand'),
                scaleRatio(source, base)
              );
          }
        }
        result = { mathJson: [operator, ...childMath], ...(base ? { unit: base } : {}) };
      } else if (
        operator === 'Equal' ||
        operator === 'NotEqual' ||
        operator === 'Less' ||
        operator === 'LessEqual' ||
        operator === 'Greater' ||
        operator === 'GreaterEqual'
      ) {
        const base = childUnits[0];
        if (childUnits.some(unit => Boolean(unit) !== Boolean(base)))
          throw new UnitEvaluationFailure(
            'DIMENSION_MISMATCH',
            'Comparison operands must have compatible dimensions'
          );
        if (base) {
          for (let index = 1; index < children.length; index++) {
            const source = childUnits[index];
            if (source)
              childMath[index] = applyScale(
                childMath[index]!,
                scaleRatio(source, base)
              );
          }
        }
        result = { mathJson: [operator, ...childMath] };
      } else if (
        operator === 'Negate' ||
        operator === 'Abs' ||
        operator === 'Floor' ||
        operator === 'Ceiling' ||
        operator === 'Round'
      ) {
        const unit = childUnits[0];
        result = {
          mathJson: [operator, ...childMath],
          ...(unit ? { unit } : {}),
        };
      } else {
        if (childUnits.some(Boolean))
          throw new UnitEvaluationFailure(
            'UNSUPPORTED_UNIT_KIND',
            'This MathJSON operator has no v1 unit rule: ' + operator
          );
        result = { mathJson: [operator, ...childMath] };
      }
    }

    const attachment = attachments.get(path);
    if (attachment) {
      if (result.unit)
        result.mathJson = applyScale(
          result.mathJson,
          scaleRatio(result.unit, attachment)
        );
      result.unit = attachment;
    }
    return result;
  };

  const inferred = infer(mathJson, '');
  let finalMathJson = inferred.mathJson;
  let finalUnit = inferred.unit;
  if (options.targetUnit) {
    if (finalUnit)
      finalMathJson = applyScale(
        finalMathJson,
        scaleRatio(finalUnit, options.targetUnit)
      );
    finalUnit = options.targetUnit;
  }

  return {
    mathJson: finalMathJson,
    ...(finalUnit ? { unit: finalUnit } : {}),
  };
}

export function serializeUnitQuantity(unit: UnitQuantity): Record<string, unknown> {
  return unitRecord(unit);
}

export function unitQuantityFromMetadata(
  metadata: unknown,
  registry: UnitRegistry | undefined,
  expectedRegistryVersion: string
): UnitQuantity | undefined {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata))
    return undefined;
  const record = metadata as Record<string, unknown>;
  if (typeof record.unitId !== 'string') return undefined;
  if (!registry)
    throw new UnitEvaluationFailure(
      'UNIT_REGISTRY_REQUIRED',
      'A unit registry is required to evaluate unit-bearing symbols'
    );
  return exactUnit(
    resolveUnit(
      record.unitId,
      registry,
      typeof record.registryVersion === 'string'
        ? record.registryVersion
        : expectedRegistryVersion
    )
  );
}
