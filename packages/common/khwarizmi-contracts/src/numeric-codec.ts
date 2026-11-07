export interface ExactRational {
  numerator: bigint;
  denominator: bigint;
}

export type ExactScale = {
  kind: 'exact-rational' | 'piRational';
  numerator: bigint;
  denominator: bigint;
};

export interface ScaleRatio {
  rational: ExactRational;
  piExponent: -1 | 0 | 1;
}

export type ExactMathJsonNumber = { num: string };
export type ExactMathJsonRational = [
  'Rational',
  ExactMathJsonNumber,
  ExactMathJsonNumber,
];

function abs(value: bigint): bigint {
  return value < 0n ? -value : value;
}

export function gcd(a: bigint, b: bigint): bigint {
  let x = abs(a);
  let y = abs(b);
  while (y !== 0n) [x, y] = [y, x % y];
  return x;
}

export function rational(
  numerator: bigint,
  denominator: bigint
): ExactRational {
  if (denominator === 0n)
    throw new RangeError('Rational denominator must not be zero');
  const sign = denominator < 0n ? -1n : 1n;
  const n = numerator * sign;
  const d = abs(denominator);
  const divisor = gcd(n, d);
  return { numerator: n / divisor, denominator: d / divisor };
}

/** Converts a base-10 decimal lexeme to an exact rational without using JS number. */
export function decimalToRational(lexeme: string): ExactRational {
  const match = /^([+-]?)(\d+)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(
    lexeme.trim()
  );
  if (!match) throw new TypeError('Invalid decimal lexeme');
  const sign = match[1] === '-' ? -1n : 1n;
  const integer = match[2] ?? '';
  const fraction = match[3] ?? '';
  const exponent = Number(match[4] ?? '0');
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 100000)
    throw new RangeError('Decimal exponent is out of range');
  let numerator = sign * BigInt(integer + fraction);
  let denominator = 10n ** BigInt(fraction.length);
  if (exponent > 0) numerator *= 10n ** BigInt(exponent);
  if (exponent < 0) denominator *= 10n ** BigInt(-exponent);
  return rational(numerator, denominator);
}

/** Returns a canonical decimal only when the rational has a finite base-10 expansion. */
export function rationalToTerminatingDecimal(
  value: ExactRational
): string | undefined {
  const normalized = rational(value.numerator, value.denominator);
  let denominator = normalized.denominator;
  let twos = 0;
  let fives = 0;
  while (denominator % 2n === 0n) {
    denominator /= 2n;
    twos++;
  }
  while (denominator % 5n === 0n) {
    denominator /= 5n;
    fives++;
  }
  if (denominator !== 1n) return undefined;
  const places = Math.max(twos, fives);
  const scaled =
    normalized.numerator *
    2n ** BigInt(places - twos) *
    5n ** BigInt(places - fives);
  const negative = scaled < 0n;
  const digits = abs(scaled)
    .toString()
    .padStart(places + 1, '0');
  if (places === 0) return (negative ? '-' : '') + digits;
  const whole = digits.slice(0, -places) || '0';
  const fractional = digits.slice(-places).replace(/0+$/, '');
  return (negative ? '-' : '') + whole + (fractional ? '.' + fractional : '');
}

export function rationalToMathJson(
  value: ExactRational
): ExactMathJsonNumber | ExactMathJsonRational {
  const normalized = rational(value.numerator, value.denominator);
  if (normalized.denominator === 1n)
    return { num: normalized.numerator.toString() };
  return [
    'Rational',
    { num: normalized.numerator.toString() },
    { num: normalized.denominator.toString() },
  ];
}

/** Exact source/target scale ratio; piExponent retains symbolic pi instead of approximating it. */
export function unitScaleRatio(
  source: ExactScale,
  target: ExactScale
): ScaleRatio {
  const sourceRational = rational(source.numerator, source.denominator);
  const targetRational = rational(target.numerator, target.denominator);
  if (sourceRational.numerator <= 0n || targetRational.numerator <= 0n) {
    throw new RangeError('Unit scales must be positive');
  }
  const ratio = rational(
    sourceRational.numerator * targetRational.denominator,
    sourceRational.denominator * targetRational.numerator
  );
  const exponent =
    Number(source.kind === 'piRational') - Number(target.kind === 'piRational');
  return { rational: ratio, piExponent: exponent as -1 | 0 | 1 };
}
