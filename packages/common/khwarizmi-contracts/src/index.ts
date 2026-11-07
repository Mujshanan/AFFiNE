export {
  evaluateMathJson,
  type BoxedExpressionPort,
  type ComputeEngineAdapterOptions,
  type ComputeEngineEvaluation,
  type ComputeEngineFactory,
  type ComputeEnginePort,
} from './compute-engine-adapter.js';
export {
  evaluateCalculationDocument,
  type AssignmentDependency,
  type DocumentEvaluationOptions,
  type DocumentEvaluationResult,
  type EvaluationDiagnostic,
} from './document-evaluator.js';
export {
  runFixtureManifest,
  type FixtureManifestEntry,
  type FixtureRunReport,
  type FixtureRunResult,
  type FixtureRunnerOptions,
} from './fixture-runner.js';
export {
  validateJsonSchema,
  validateSchemaBundle,
  type JsonSchema,
  type JsonValue,
  type SchemaIssue,
  type SchemaValidationResult,
} from './json-schema.js';
export {
  decimalToRational,
  gcd,
  rational,
  rationalToMathJson,
  rationalToTerminatingDecimal,
  unitScaleRatio,
  type ExactMathJsonNumber,
  type ExactMathJsonRational,
  type ExactRational,
  type ExactScale,
  type ScaleRatio,
} from './numeric-codec.js';
export {
  decodeRpcPayload,
  encodeRpcFrame,
  RequestCancellationRegistry,
  RPC_MAX_FRAME_BYTES,
  RpcFrameDecoder,
  RpcTransportError,
  type RpcRequestId,
} from './rpc-transport.js';
export {
  validateCalculationSemantics,
  validateDependencyGraph,
  validateDiagnosticCodeMembership,
  validateDiagnosticRegistrySemantics,
  validateUnitReference,
  validateUnitRegistrySemantics,
  type SemanticIssue,
  type SemanticValidationResult,
} from './semantic-validator.js';
export {
  combineDimensions,
  conversionRatio,
  convertRationalMagnitude,
  dimensionsCompatible,
  loadUnitRegistry,
  resolvePrefixedUnit,
  resolveUnit,
  UnitCodecFailure,
  type ResolvedUnit,
  type UnitDefinition,
  type UnitRegistry,
} from './unit-codec.js';
