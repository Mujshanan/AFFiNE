export interface BoxedExpressionPort {
  evaluate(): BoxedExpressionPort;
  toMathJson(options: { digits: 'max' }): unknown;
}

export interface ComputeEnginePort {
  precision: number;
  box(mathJson: never): BoxedExpressionPort;
}

export type ComputeEngineFactory = () => ComputeEnginePort;

export interface ComputeEngineEvaluation {
  mathJson: unknown;
  precision: number;
}

export interface ComputeEngineAdapterOptions {
  /** Decimal digits used for approximate evaluation. Each request gets its own engine. */
  precision?: number;
}

/**
 * Thin evaluator boundary around a host-provided Compute Engine factory.
 * The calculation host pins @cortex-js/compute-engine to 0.180.0 and supplies a factory.
 * Khwarizmi resolves worksheet symbols, assignment versions, dependencies, units, and
 * substitution provenance before calling this adapter.
 */
export function evaluateMathJson(
  mathJson: unknown,
  createEngine: ComputeEngineFactory,
  options: ComputeEngineAdapterOptions = {}
): ComputeEngineEvaluation {
  const precision = options.precision ?? 34;
  if (!Number.isInteger(precision) || precision < 1 || precision > 10000) {
    throw new RangeError('Precision must be an integer between 1 and 10000');
  }
  const engine = createEngine();
  engine.precision = precision;
  const boxed = engine.box(mathJson as never);
  const evaluated = boxed.evaluate();
  return {
    // Use the precision-preserving serializer, not BoxedExpression.json.
    mathJson: evaluated.toMathJson({ digits: 'max' }),
    precision,
  };
}
