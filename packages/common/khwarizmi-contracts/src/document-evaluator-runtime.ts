import {
  type ComputeEngineFactory,
  evaluateMathJson,
} from './compute-engine-adapter.js';
import { rationalToTerminatingDecimal } from './numeric-codec.js';

type RecordValue = Record<string, unknown>;
type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface DocumentEvaluationOptions {
  createEngine: ComputeEngineFactory;
  validateDocument: (document: unknown) => {
    valid: boolean;
    diagnostics?: Array<{ code: string; message: string }>;
  };
  engineVersion: string;
  documentRevision: string;
  evaluationId: string;
  precision?: number;
  createEventId?: (assignmentId: string, version: number) => string;
  maxLoopIterations?: number;
}

export interface EvaluationDiagnostic {
  code: string;
  message: string;
  statementId?: string;
  symbolId?: string;
}

export interface AssignmentDependency {
  symbolId: string;
  assignmentId: string;
  assignmentVersion: number;
  assignmentEventId: string;
}

export interface DocumentEvaluationResult {
  format: 'khwarizmi.evaluation-result';
  schemaVersion: 1;
  evaluationId: string;
  documentId: string;
  documentRevision: string;
  semanticVersion: string;
  unitRegistryVersion: string;
  engine: { name: 'cortexjs-compute-engine'; version: string };
  status: 'completed' | 'completedWithErrors';
  results: Array<RecordValue>;
  diagnostics: EvaluationDiagnostic[];
  assignmentEvents: Array<RecordValue>;
}

interface AssignmentState {
  assignmentId: string;
  assignmentVersion: number;
  assignmentEventId: string;
  mathJsonValue: JsonValue;
  numericValue: RecordValue;
  unit?: RecordValue;
}

interface EvaluatedExpression {
  mathJson: JsonValue;
  substitutedMathJson: JsonValue;
  value: RecordValue | null;
  dependencies: AssignmentDependency[];
  substitutions: RecordValue[];
}

class EvaluationFailure extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

const isRecord = (value: unknown): value is RecordValue =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function setOwnProperty(target: RecordValue, key: string, value: JsonValue) {
  Object.defineProperty(target, key, {
    configurable: true,
    enumerable: true,
    writable: true,
    value,
  });
}

function replaceTokens(
  value: JsonValue,
  bindings: Map<string, { state: AssignmentState; symbolId: string }>,
  paths: string[] = [],
  substitutions: RecordValue[] = [],
  dependencies: Map<string, AssignmentDependency> = new Map()
): JsonValue {
  if (typeof value === 'string' && /^kz_[A-Za-z0-9_-]{1,80}$/.test(value)) {
    const binding = bindings.get(value);
    if (!binding)
      throw new EvaluationFailure(
        'UNRESOLVED_SYMBOL',
        'No preceding successful assignment exists for ' + value
      );
    const { state, symbolId } = binding;
    substitutions.push({
      mathJsonPath: paths.length ? '/' + paths.join('/') : '',
      engineSymbol: value,
      symbolId,
      value: state.numericValue,
      ...(state.unit ? { unit: state.unit } : {}),
      assignmentId: state.assignmentId,
      assignmentVersion: state.assignmentVersion,
      assignmentEventId: state.assignmentEventId,
    });
    dependencies.set(state.assignmentEventId, {
      symbolId,
      assignmentId: state.assignmentId,
      assignmentVersion: state.assignmentVersion,
      assignmentEventId: state.assignmentEventId,
    });
    return state.mathJsonValue;
  }
  if (Array.isArray(value))
    return value.map((child, index) =>
      replaceTokens(child, bindings, [...paths, String(index)], substitutions, dependencies)
    );
  if (isRecord(value)) {
    const result: RecordValue = {};
    for (const [key, child] of Object.entries(value))
      setOwnProperty(
        result,
        key,
        replaceTokens(child as JsonValue, bindings, [...paths, key], substitutions, dependencies)
      );
    return result as JsonValue;
  }
  return value;
}

function restoreAuthoredNumbers(
  mathJson: JsonValue,
  authoredNumbers: unknown
): JsonValue {
  let result: any = Array.isArray(mathJson)
    ? mathJson.map(item => restoreAuthoredNumbers(item, []))
    : isRecord(mathJson)
      ? Object.fromEntries(
          Object.entries(mathJson).map(([key, value]) => [
            key,
            restoreAuthoredNumbers(value as JsonValue, []),
          ])
        )
      : mathJson;

  for (const entry of Array.isArray(authoredNumbers) ? authoredNumbers : []) {
    if (
      !isRecord(entry) ||
      typeof entry.path !== 'string' ||
      typeof entry.lexeme !== 'string'
    )
      continue;
    const replacement: JsonValue =
      entry.representation === 'exactRational' &&
      typeof entry.numerator === 'string' &&
      typeof entry.denominator === 'string'
        ? ['Rational', { num: entry.numerator }, { num: entry.denominator }]
        : { num: entry.lexeme };
    const tokens =
      entry.path === ''
        ? []
        : entry.path
            .slice(1)
            .split('/')
            .map(token => token.replace(/~1/g, '/').replace(/~0/g, '~'));
    if (tokens.length === 0) {
      result = replacement;
      continue;
    }
    let parent = result;
    for (const token of tokens.slice(0, -1))
      parent = Array.isArray(parent) ? parent[Number(token)] : parent?.[token];
    const finalToken = tokens.at(-1);
    if (finalToken === undefined) continue;
    if (Array.isArray(parent) && /^(0|[1-9][0-9]*)$/.test(finalToken))
      parent[Number(finalToken)] = replacement;
    else if (isRecord(parent)) setOwnProperty(parent, finalToken, replacement);
  }
  return result as JsonValue;
}

function scalarValue(mathJson: unknown, expression: RecordValue): RecordValue | null {
  const authored = Array.isArray(expression.authoredNumbers)
    ? expression.authoredNumbers.find(entry => isRecord(entry) && entry.path === '')
    : undefined;
  if (
    isRecord(authored) &&
    authored.representation === 'exactDecimal' &&
    typeof authored.lexeme === 'string' &&
    /^-?(0|[1-9][0-9]*)(\.[0-9]*[1-9])?$/.test(authored.lexeme)
  )
    return { kind: 'exactDecimal', decimal: authored.lexeme };

  if (typeof mathJson === 'number' && Number.isFinite(mathJson)) {
    const decimal = String(mathJson);
    if (/^-?(0|[1-9][0-9]*)(\.[0-9]*[1-9])?$/.test(decimal))
      return { kind: 'exactDecimal', decimal };
  }
  if (isRecord(mathJson) && typeof mathJson.num === 'string') {
    const decimal = mathJson.num;
    if (/^-?(0|[1-9][0-9]*)(\.[0-9]*[1-9])?$/.test(decimal))
      return { kind: 'exactDecimal', decimal };
    if (/^-?(0|[1-9][0-9]*)\/[1-9][0-9]*$/.test(decimal)) {
      const [numerator, denominator] = decimal.split('/');
      return { kind: 'exactRational', numerator, denominator };
    }
  }
  if (
    Array.isArray(mathJson) &&
    mathJson[0] === 'Rational' &&
    isRecord(mathJson[1]) &&
    isRecord(mathJson[2])
  ) {
    const numerator = mathJson[1].num;
    const denominator = mathJson[2].num;
    if (
      typeof numerator === 'string' &&
      typeof denominator === 'string' &&
      /^-?(0|[1-9][0-9]*)$/.test(numerator) &&
      /^[1-9][0-9]*$/.test(denominator)
    ) {
      const n = BigInt(numerator);
      const d = BigInt(denominator);
      const gcd = (a: bigint, b: bigint): bigint =>
        b === 0n ? (a < 0n ? -a : a) : gcd(b, a % b);
      const divisor = gcd(n, d);
      const reducedNumerator = n / divisor;
      const reducedDenominator = d / divisor;
      if (reducedDenominator === 1n)
        return { kind: 'exactDecimal', decimal: reducedNumerator.toString() };
      const decimal = rationalToTerminatingDecimal({
        numerator: reducedNumerator,
        denominator: reducedDenominator,
      });
      return decimal === undefined
        ? {
            kind: 'exactRational',
            numerator: reducedNumerator.toString(),
            denominator: reducedDenominator.toString(),
          }
        : { kind: 'exactDecimal', decimal };
    }
  }
  return null;
}

/**
 * Deterministic v1 evaluator. Top-level execution follows calculationOrder;
 * nested blocks execute in lexical scopes and never depend on visual order.
 */
export function evaluateCalculationDocument(
  document: unknown,
  options: DocumentEvaluationOptions
): DocumentEvaluationResult {
  if (!isRecord(document) || document.format !== 'khwarizmi.calculation-document')
    throw new TypeError('Expected a Khwarizmi calculation document');
  const validation = options.validateDocument(document);
  if (!validation.valid)
    throw new TypeError(
      'Document validation failed: ' + JSON.stringify(validation.diagnostics ?? [])
    );
  if (!/^[a-f0-9]{64}$/.test(options.documentRevision))
    throw new TypeError('documentRevision must be a lowercase SHA-256 digest');
  if (!options.engineVersion || !options.evaluationId)
    throw new TypeError('Engine version and evaluation ID are required');

  const topLevel: RecordValue[] = [];
  const statementIds = new Set<string>();
  const collectIds = (statements: unknown, top: boolean) => {
    if (!Array.isArray(statements)) return;
    for (const statement of statements) {
      if (!isRecord(statement)) continue;
      if (typeof statement.statementId !== 'string' || !statement.statementId)
        throw new TypeError('Every statement must have a non-empty statementId');
      if (statementIds.has(statement.statementId))
        throw new TypeError('Duplicate statementId in document: ' + statement.statementId);
      statementIds.add(statement.statementId);
      if (top) topLevel.push(statement);
      if (statement.kind === 'if') {
        collectIds(statement.then, false);
        collectIds(statement.else, false);
      } else if (statement.kind === 'while') {
        collectIds(statement.body, false);
      }
    }
  };
  for (const page of Array.isArray(document.pages) ? document.pages : [])
    if (isRecord(page)) collectIds(page.statements, true);

  if (!Array.isArray(document.calculationOrder))
    throw new TypeError('Document calculationOrder must be an array');
  const topById = new Map(topLevel.map(statement => [String(statement.statementId), statement]));
  const ordered = document.calculationOrder.map(id => {
    if (typeof id !== 'string' || !topById.has(id))
      throw new TypeError('calculationOrder contains a missing or nested statement ID: ' + id);
    return id;
  });
  if (new Set(ordered).size !== ordered.length || ordered.length !== topLevel.length)
    throw new TypeError('calculationOrder must contain each top-level statement exactly once');

  const documentSymbols = new Map<string, RecordValue>();
  for (const symbol of Array.isArray(document.symbols) ? document.symbols : []) {
    if (isRecord(symbol) && typeof symbol.symbolId === 'string')
      documentSymbols.set(symbol.symbolId, symbol);
  }

  const globalStates = new Map<string, AssignmentState>();
  const localScopes: Map<string, AssignmentState>[] = [];
  const failedSymbols = new Set<string>();
  const assignmentVersions = new Map<string, number>();
  const assignmentEvents: RecordValue[] = [];
  const results: RecordValue[] = [];
  const diagnostics: EvaluationDiagnostic[] = [];
  const usedEventIds = new Set<string>();
  const eventId = options.createEventId ?? ((id, version) => `event:${id}:${version}`);
  const maxLoopIterations = options.maxLoopIterations ?? 10000;
  if (!Number.isInteger(maxLoopIterations) || maxLoopIterations < 1 || maxLoopIterations > 10000)
    throw new RangeError('maxLoopIterations must be an integer from 1 to 10000');
  let totalLoopIterations = 0;

  const findState = (symbolId: string): AssignmentState | undefined => {
    for (let index = localScopes.length - 1; index >= 0; index--) {
      const state = localScopes[index]?.get(symbolId);
      if (state) return state;
    }
    return globalStates.get(symbolId);
  };
  const setState = (symbolId: string, state: AssignmentState) => {
    for (let index = localScopes.length - 1; index >= 0; index--) {
      const scope = localScopes[index];
      if (scope?.has(symbolId)) {
        scope.set(symbolId, state);
        return;
      }
    }
    globalStates.set(symbolId, state);
  };

  const evaluateRecord = (
    expression: RecordValue,
    statementId: string
  ): EvaluatedExpression => {
    if (!Object.prototype.hasOwnProperty.call(expression, 'mathJson'))
      throw new EvaluationFailure('INVALID_EXPRESSION', 'Expression has no MathJSON payload');
    const bindings = new Map<string, { state: AssignmentState; symbolId: string }>();
    for (const binding of Array.isArray(expression.symbolBindings) ? expression.symbolBindings : []) {
      if (
        !isRecord(binding) ||
        typeof binding.engineSymbol !== 'string' ||
        typeof binding.symbolId !== 'string'
      )
        continue;
      if (failedSymbols.has(binding.symbolId))
        throw new EvaluationFailure(
          'DEPENDENCY_FAILED',
          'A preceding assignment failed; dependent expression was not evaluated'
        );
      const state = findState(binding.symbolId);
      if (state) bindings.set(binding.engineSymbol, { state, symbolId: binding.symbolId });
    }
    const substitutions: RecordValue[] = [];
    const dependencies = new Map<string, AssignmentDependency>();
    const authored = restoreAuthoredNumbers(
      expression.mathJson as JsonValue,
      expression.authoredNumbers
    );
    const substituted = replaceTokens(authored, bindings, [], substitutions, dependencies);
    const evaluated = evaluateMathJson(substituted, options.createEngine, {
      precision: options.precision,
    });
    const value = scalarValue(evaluated.mathJson, expression);
    return {
      mathJson: evaluated.mathJson as JsonValue,
      substitutedMathJson: substituted,
      value,
      dependencies: [...dependencies.values()],
      substitutions,
    };
  };

  const resultRecord = (
    statementId: string,
    expression: RecordValue,
    evaluated: EvaluatedExpression,
    controlFlowPath: Array<RecordValue>
  ) => ({
    resultId: 'result:' + statementId + ':' + results.length,
    statementId,
    status: evaluated.value ? 'evaluated' : 'error',
    originalExpression: expression,
    substitutedMathJson: evaluated.substitutedMathJson,
    value: evaluated.value,
    dependencies: evaluated.dependencies,
    substitutions: evaluated.substitutions,
    diagnostics: evaluated.value ? [] : [{ code: 'UNSUPPORTED_RESULT_VALUE', message: 'Evaluator returned a non-scalar or unsupported numeric result' }],
    ...(controlFlowPath.length ? { controlFlowPath: [...controlFlowPath] } : {}),
  });

  const publishAssignment = (
    statement: RecordValue,
    symbolId: string,
    assignmentId: string,
    evaluated: EvaluatedExpression,
    controlFlowPath: Array<RecordValue>,
    localDeclaration = false
  ) => {
    if (!evaluated.value) {
      failedSymbols.add(symbolId);
      diagnostics.push({
        code: 'UNSUPPORTED_RESULT_VALUE',
        message: 'Assignment result is not a supported scalar value',
        statementId: String(statement.statementId),
        symbolId,
      });
      results.push(resultRecord(
        String(statement.statementId),
        isRecord(statement.expression) ? statement.expression : (statement.initializer as RecordValue),
        evaluated,
        controlFlowPath
      ));
      return;
    }
    const version = (assignmentVersions.get(symbolId) ?? 0) + 1;
    const id = eventId(assignmentId, version);
    if (typeof id !== 'string' || !id.trim() || usedEventIds.has(id))
      throw new EvaluationFailure(
        'INVALID_ASSIGNMENT_EVENT_ID',
        'Assignment event IDs must be non-empty and unique within an evaluation'
      );
    assignmentVersions.set(symbolId, version);
    usedEventIds.add(id);
    const symbol = documentSymbols.get(symbolId);
    const state: AssignmentState = {
      assignmentId,
      assignmentVersion: version,
      assignmentEventId: id,
      mathJsonValue: evaluated.mathJson,
      numericValue: evaluated.value,
      ...(isRecord(symbol?.unit) ? { unit: symbol.unit } : {}),
    };
    if (localDeclaration && localScopes.length) {
      localScopes[localScopes.length - 1]?.set(symbolId, state);
    } else {
      setState(symbolId, state);
    }
    failedSymbols.delete(symbolId);
    assignmentEvents.push({
      statementId: statement.statementId,
      assignmentId,
      symbolId,
      assignmentVersion: version,
      assignmentEventId: id,
      value: evaluated.value,
      dependencies: evaluated.dependencies,
    });
    const result = resultRecord(
      String(statement.statementId),
      isRecord(statement.expression) ? statement.expression : (statement.initializer as RecordValue),
      evaluated,
      controlFlowPath
    );
    if (isRecord(symbol?.unit)) result.unit = symbol.unit;
    results.push(result);
    void localDeclaration;
  };

  const executeStatements = (
    statements: unknown,
    controlFlowPath: Array<RecordValue>,
    createLexicalScope: boolean
  ) => {
    if (!Array.isArray(statements)) return;
    if (createLexicalScope) localScopes.push(new Map<string, AssignmentState>());
    try {
      for (const raw of statements) {
        if (!isRecord(raw)) continue;
        const statementId = String(raw.statementId);
        const kind = raw.kind;
        if (kind === 'assign' || kind === 'expression') {
          if (!isRecord(raw.expression)) {
            diagnostics.push({ code: 'INVALID_EXPRESSION', message: 'Statement expression is malformed', statementId });
            if (kind === 'assign' && typeof raw.targetSymbolId === 'string') failedSymbols.add(raw.targetSymbolId);
            continue;
          }
          try {
            const evaluated = evaluateRecord(raw.expression, statementId);
            if (kind === 'expression') {
              results.push(resultRecord(statementId, raw.expression, evaluated, controlFlowPath));
              if (!evaluated.value)
                diagnostics.push({ code: 'UNSUPPORTED_RESULT_VALUE', message: 'Expression result is not a supported scalar value', statementId });
            } else {
              if (typeof raw.targetSymbolId !== 'string' || typeof raw.assignmentId !== 'string')
                throw new EvaluationFailure('INVALID_ASSIGNMENT', 'Assignment target and assignmentId are required');
              publishAssignment(raw, raw.targetSymbolId, raw.assignmentId, evaluated, controlFlowPath);
            }
          } catch (error) {
            const code = error instanceof EvaluationFailure ? error.code : 'EVALUATION_FAILED';
            const message = error instanceof Error ? error.message : 'Unknown evaluation failure';
            diagnostics.push({ code, message, statementId });
            results.push({
              resultId: 'result:' + statementId + ':' + results.length,
              statementId,
              status: 'error',
              originalExpression: raw.expression,
              substitutedMathJson: raw.expression.mathJson,
              value: null,
              dependencies: [],
              substitutions: [],
              diagnostics: [{ code, message }],
              ...(controlFlowPath.length ? { controlFlowPath: [...controlFlowPath] } : {}),
            });
            if (kind === 'assign' && typeof raw.targetSymbolId === 'string')
              failedSymbols.add(raw.targetSymbolId);
          }
          continue;
        }

        if (kind === 'declareLocal') {
          if (!localScopes.length) {
            diagnostics.push({ code: 'LOCAL_OUT_OF_SCOPE', message: 'Local declarations require a lexical block', statementId });
            continue;
          }
          if (!isRecord(raw.initializer) || typeof raw.localSymbolId !== 'string') {
            diagnostics.push({ code: 'INVALID_LOCAL_DECLARATION', message: 'Local declaration is malformed', statementId });
            continue;
          }
          try {
            const evaluated = evaluateRecord(raw.initializer, statementId);
            publishAssignment(
              { ...raw, expression: raw.initializer },
              raw.localSymbolId,
              'local:' + statementId,
              evaluated,
              controlFlowPath,
              true
            );
          } catch (error) {
            const code = error instanceof EvaluationFailure ? error.code : 'EVALUATION_FAILED';
            const message = error instanceof Error ? error.message : 'Unknown local initialization failure';
            diagnostics.push({ code, message, statementId, symbolId: String(raw.localSymbolId) });
            failedSymbols.add(String(raw.localSymbolId));
          }
          continue;
        }

        if (kind === 'if') {
          if (!isRecord(raw.condition)) {
            diagnostics.push({ code: 'INVALID_CONDITION', message: 'If condition is malformed', statementId });
            continue;
          }
          try {
            const condition = evaluateRecord(raw.condition, statementId);
            const truth = condition.mathJson === true || condition.mathJson === 'True';
            const falsity = condition.mathJson === false || condition.mathJson === 'False';
            if (!truth && !falsity)
              throw new EvaluationFailure('INVALID_CONDITION_RESULT', 'If condition did not evaluate to a boolean');
            const branch = truth ? raw.then : raw.else;
            executeStatements(
              branch,
              [...controlFlowPath, { statementId, kind: truth ? 'if-then' : 'if-else' }],
              true
            );
          } catch (error) {
            const code = error instanceof EvaluationFailure ? error.code : 'EVALUATION_FAILED';
            diagnostics.push({
              code,
              message: error instanceof Error ? error.message : 'If condition evaluation failed',
              statementId,
            });
          }
          continue;
        }

        if (kind === 'while') {
          if (!isRecord(raw.condition)) {
            diagnostics.push({ code: 'INVALID_CONDITION', message: 'While condition is malformed', statementId });
            continue;
          }
          let iteration = 0;
          while (true) {
            try {
              const condition = evaluateRecord(raw.condition, statementId);
              const truth = condition.mathJson === true || condition.mathJson === 'True';
              const falsity = condition.mathJson === false || condition.mathJson === 'False';
              if (!truth && !falsity)
                throw new EvaluationFailure('INVALID_CONDITION_RESULT', 'While condition did not evaluate to a boolean');
              if (falsity) break;
              if (totalLoopIterations >= maxLoopIterations) {
                diagnostics.push({
                  code: 'RESOURCE_LIMIT_EXCEEDED',
                  message: 'Maximum total while-loop iterations exceeded',
                  statementId,
                });
                break;
              }
              totalLoopIterations++;
              executeStatements(
                raw.body,
                [...controlFlowPath, { statementId, kind: 'while-iteration', iteration }],
                true
              );
              iteration++;
            } catch (error) {
              const code = error instanceof EvaluationFailure ? error.code : 'EVALUATION_FAILED';
              diagnostics.push({
                code,
                message: error instanceof Error ? error.message : 'While condition evaluation failed',
                statementId,
              });
              break;
            }
          }
          continue;
        }

        diagnostics.push({
          code: 'EVALUATOR_STAGE_UNSUPPORTED',
          message: 'Unsupported statement kind: ' + String(kind),
          statementId,
        });
      }
    } finally {
      if (createLexicalScope) localScopes.pop();
    }
  };

  for (const statementId of ordered) {
    const statement = topById.get(statementId);
    if (statement) executeStatements([statement], [], false);
  }

  return {
    format: 'khwarizmi.evaluation-result',
    schemaVersion: 1,
    evaluationId: options.evaluationId,
    documentId: String(document.documentId ?? ''),
    documentRevision: options.documentRevision,
    semanticVersion: String(document.semanticVersion ?? '1.0.0'),
    unitRegistryVersion: String(document.unitRegistryVersion ?? ''),
    engine: { name: 'cortexjs-compute-engine', version: options.engineVersion },
    status: diagnostics.length ? 'completedWithErrors' : 'completed',
    results,
    diagnostics,
    assignmentEvents,
  };
}
