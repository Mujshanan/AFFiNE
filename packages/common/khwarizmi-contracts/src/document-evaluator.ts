import { type ComputeEngineFactory, evaluateMathJson } from './compute-engine-adapter.js';
import { rationalToTerminatingDecimal } from './numeric-codec.js';

type RecordValue = Record<string, unknown>;
type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export interface DocumentEvaluationOptions {
  createEngine: ComputeEngineFactory;
  validateDocument: (document: unknown) => { valid: boolean; diagnostics?: Array<{ code: string; message: string }> };
  engineVersion: string;
  documentRevision: string;
  evaluationId: string;
  precision?: number;
  createEventId?: (assignmentId: string, version: number) => string;
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

const isRecord = (value: unknown): value is RecordValue =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function setOwnProperty(target: RecordValue, key: string, value: JsonValue): void {
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
    if (!binding) throw new EvaluationFailure('UNRESOLVED_SYMBOL', 'No preceding successful assignment exists for ' + value);
    const { state, symbolId } = binding;
    substitutions.push({ mathJsonPath: paths.length ? '/' + paths.join('/') : '', engineSymbol: value, symbolId, value: state.numericValue, ...(state.unit ? { unit: state.unit } : {}), assignmentId: state.assignmentId, assignmentVersion: state.assignmentVersion, assignmentEventId: state.assignmentEventId });
    dependencies.set(state.assignmentEventId, { symbolId, assignmentId: state.assignmentId, assignmentVersion: state.assignmentVersion, assignmentEventId: state.assignmentEventId });
    return state.mathJsonValue;
  }
  if (Array.isArray(value)) return value.map((child, index) => replaceTokens(child, bindings, [...paths, String(index)], substitutions, dependencies));
  if (isRecord(value)) {
    const result: RecordValue = {};
    for (const [key, child] of Object.entries(value)) setOwnProperty(result, key, replaceTokens(child as JsonValue, bindings, [...paths, key], substitutions, dependencies));
    return result as JsonValue;
  }
  return value;
}

function restoreAuthoredNumbers(mathJson: JsonValue, authoredNumbers: unknown): JsonValue {
  let result: any = Array.isArray(mathJson)
    ? mathJson.map(item => restoreAuthoredNumbers(item, []))
    : isRecord(mathJson)
      ? Object.fromEntries(Object.entries(mathJson).map(([key, value]) => [key, restoreAuthoredNumbers(value as JsonValue, [])]))
      : mathJson;
  for (const entry of Array.isArray(authoredNumbers) ? authoredNumbers : []) {
    if (!isRecord(entry) || typeof entry.path !== 'string' || typeof entry.lexeme !== 'string') continue;
    let replacement: JsonValue;
    if (entry.representation === 'exactRational' && typeof entry.numerator === 'string' && typeof entry.denominator === 'string') {
      replacement = ['Rational', { num: entry.numerator }, { num: entry.denominator }];
    } else {
      replacement = { num: entry.lexeme };
    }
    const tokens = entry.path === '' ? [] : entry.path.slice(1).split('/').map(token => token.replace(/~1/g, '/').replace(/~0/g, '~'));
    if (tokens.length === 0) {
      result = replacement;
      continue;
    }
    let parent = result;
    for (const token of tokens.slice(0, -1)) parent = Array.isArray(parent) ? parent[Number(token)] : parent?.[token];
    const finalToken = tokens.at(-1);
    if (finalToken === undefined) continue;
    if (Array.isArray(parent) && /^(0|[1-9][0-9]*)$/.test(finalToken)) parent[Number(finalToken)] = replacement;
    else if (isRecord(parent)) setOwnProperty(parent, finalToken, replacement);
  }
  return result as JsonValue;
}

class EvaluationFailure extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}

function scalarValue(mathJson: unknown, expression: RecordValue): RecordValue | null {
  const authored = Array.isArray(expression.authoredNumbers)
    ? expression.authoredNumbers.find(entry => isRecord(entry) && entry.path === '')
    : undefined;
  if (isRecord(authored) && authored.representation === 'exactDecimal' && typeof authored.lexeme === 'string') {
    const lexeme = authored.lexeme;
    if (/^-?(0|[1-9][0-9]*)(\.[0-9]*[1-9])?$/.test(lexeme)) return { kind: 'exactDecimal', decimal: lexeme };
  }
  if (typeof mathJson === 'number' && Number.isFinite(mathJson)) {
    const decimal = String(mathJson);
    if (/^-?(0|[1-9][0-9]*)(\.[0-9]*[1-9])?$/.test(decimal)) return { kind: 'exactDecimal', decimal };
  }
  if (isRecord(mathJson) && typeof mathJson.num === 'string') {
    const decimal = mathJson.num;
    if (/^-?(0|[1-9][0-9]*)(\.[0-9]*[1-9])?$/.test(decimal)) return { kind: 'exactDecimal', decimal };
    if (/^-?(0|[1-9][0-9]*)\/[1-9][0-9]*$/.test(decimal)) {
      const [n, d] = decimal.split('/');
      return { kind: 'exactRational', numerator: n, denominator: d };
    }
  }
  if (Array.isArray(mathJson) && mathJson[0] === 'Rational' && isRecord(mathJson[1]) && isRecord(mathJson[2])) {
    const numerator = mathJson[1].num;
    const denominator = mathJson[2].num;
    if (typeof numerator === 'string' && typeof denominator === 'string' && /^-?(0|[1-9][0-9]*)$/.test(numerator) && /^[1-9][0-9]*$/.test(denominator)) {
      const n = BigInt(numerator), d = BigInt(denominator);
      const gcd = (a: bigint, b: bigint): bigint => b === 0n ? (a < 0n ? -a : a) : gcd(b, a % b);
      const g = gcd(n, d);
      const rn = n / g, rd = d / g;
      if (rd === 1n) return { kind: 'exactDecimal', decimal: rn.toString() };
      const decimal = rationalToTerminatingDecimal({ numerator: rn, denominator: rd });
      return decimal === undefined
        ? { kind: 'exactRational', numerator: rn.toString(), denominator: rd.toString() }
        : { kind: 'exactDecimal', decimal };
    }
  }
  return null;
}

/**
 * Executes the v1 linear calculation sequence. Control-flow execution and dimensional
 * arithmetic are intentionally rejected until their dedicated evaluator stages land.
 * Visual page order is never consulted; calculationOrder is authoritative.
 */
export function evaluateCalculationDocument(
  document: unknown,
  options: DocumentEvaluationOptions
): DocumentEvaluationResult {
  if (!isRecord(document) || document.format !== 'khwarizmi.calculation-document') {
    throw new TypeError('Expected a Khwarizmi calculation document');
  }
  const validation = options.validateDocument(document);
  if (!validation.valid) throw new TypeError('Document validation failed: ' + JSON.stringify(validation.diagnostics ?? []));
  if (!/^[a-f0-9]{64}$/.test(options.documentRevision)) throw new TypeError('documentRevision must be a lowercase SHA-256 digest');
  if (!options.engineVersion || !options.evaluationId) throw new TypeError('Engine version and evaluation ID are required');

  const statements = new Map<string, RecordValue>();
  for (const page of Array.isArray(document.pages) ? document.pages : []) {
    if (!isRecord(page) || !Array.isArray(page.statements)) continue;
    for (const statement of page.statements) {
      if (!isRecord(statement) || typeof statement.statementId !== 'string') continue;
      if (statements.has(statement.statementId)) {
        throw new TypeError('Duplicate statementId in document: ' + statement.statementId);
      }
      statements.set(statement.statementId, statement);
    }
  }
  if (!Array.isArray(document.calculationOrder)) {
    throw new TypeError('Document calculationOrder must be an array');
  }
  const orderedIds = new Set<string>();
  for (const rawId of document.calculationOrder) {
    const id = String(rawId);
    if (orderedIds.has(id)) throw new TypeError('Duplicate statement in calculationOrder: ' + id);
    orderedIds.add(id);
  }

  const symbolStates = new Map<string, AssignmentState>();
  const symbolFailures = new Set<string>();
  const assignmentVersions = new Map<string, number>();
  const assignmentEvents: Array<RecordValue> = [];
  const results: Array<RecordValue> = [];
  const diagnostics: EvaluationDiagnostic[] = [];
  const eventId = options.createEventId ?? ((id, version) => `event:${id}:${version}`);
  const usedEventIds = new Set<string>();

  for (const statementId of document.calculationOrder) {
    const statement = statements.get(String(statementId));
    if (!statement) {
      diagnostics.push({ code: 'INVALID_CALCULATION_ORDER', message: 'Calculation order references a missing statement: ' + statementId, statementId: String(statementId) });
      continue;
    }
    const kind = statement.kind;
    if (kind !== 'assign' && kind !== 'expression') {
      diagnostics.push({ code: 'EVALUATOR_STAGE_UNSUPPORTED', message: 'This evaluator version does not execute control-flow statements', statementId: String(statementId) });
      results.push({ resultId: 'result:' + statementId, statementId, status: 'error', value: null, dependencies: [], substitutions: [], diagnostics: [{ code: 'EVALUATOR_STAGE_UNSUPPORTED', message: 'Control-flow execution is not implemented in this evaluator stage' }] });
      continue;
    }
    const expression = statement.expression;
    if (!isRecord(expression) || !Object.prototype.hasOwnProperty.call(expression, 'mathJson')) {
      const message = 'Statement has no valid expression record or MathJSON payload';
      diagnostics.push({ code: 'INVALID_EXPRESSION', message, statementId: String(statementId) });
      results.push({ resultId: 'result:' + statementId, statementId, status: 'error', value: null, dependencies: [], substitutions: [], diagnostics: [{ code: 'INVALID_EXPRESSION', message }] });
      if (kind === 'assign' && typeof statement.targetSymbolId === 'string') symbolFailures.add(statement.targetSymbolId);
      continue;
    }

    const substitutions: RecordValue[] = [];
    const dependencies = new Map<string, AssignmentDependency>();
    const tokenBindings = new Map<string, { state: AssignmentState; symbolId: string }>();
    const symbolIds = new Map<string, string>();
    for (const binding of Array.isArray(expression.symbolBindings) ? expression.symbolBindings : []) {
      if (!isRecord(binding) || typeof binding.engineSymbol !== 'string' || typeof binding.symbolId !== 'string') continue;
      const state = symbolStates.get(binding.symbolId);
      if (state) tokenBindings.set(binding.engineSymbol, { state, symbolId: binding.symbolId });
      symbolIds.set(binding.engineSymbol, binding.symbolId);
      if (symbolFailures.has(binding.symbolId)) {
        diagnostics.push({ code: 'FAILED_ASSIGNMENT_PROPAGATION', message: 'A preceding assignment failed; dependent expression was not evaluated', statementId: String(statementId), symbolId: binding.symbolId });
      }
    }
    const hasFailedDependency = [...symbolIds.values()].some(id => symbolFailures.has(id));
    if (hasFailedDependency) {
      results.push({ resultId: 'result:' + statementId, statementId, status: 'skipped', originalExpression: expression, substitutedMathJson: expression.mathJson, value: null, dependencies: [], substitutions: [], diagnostics: [{ code: 'FAILED_ASSIGNMENT_PROPAGATION', message: 'A dependency has no successful value' }] });
      continue;
    }

    try {
      const authoredMathJson = restoreAuthoredNumbers(expression.mathJson as JsonValue, expression.authoredNumbers);
      const substituted = replaceTokens(authoredMathJson, tokenBindings, [], substitutions, dependencies);
      const evaluated = evaluateMathJson(substituted, options.createEngine, { precision: options.precision });
      const value = scalarValue(evaluated.mathJson, expression);
      const unit = (() => {
        const first = Array.isArray(expression.unitAttachments) ? expression.unitAttachments.find(isRecord) : undefined;
        if (!first || typeof first.unitId !== 'string') return undefined;
        return (Array.isArray(document.symbols) ? document.symbols : []).find((symbol: unknown) => isRecord(symbol) && symbol.symbolId === statement.targetSymbolId && isRecord(symbol.unit) && symbol.unit.unitId === first.unitId) as RecordValue | undefined;
      })();

      const result: RecordValue = {
        resultId: 'result:' + statementId,
        statementId,
        status: 'evaluated',
        originalExpression: expression,
        substitutedMathJson: substituted,
        value,
        dependencies: [...dependencies.values()],
        substitutions,
        diagnostics: [],
      };
      if (unit) result.unit = unit.unit;
      results.push(result);

      if (kind === 'assign') {
        const target = String(statement.targetSymbolId);
        if (!value) {
          symbolFailures.add(target);
          diagnostics.push({ code: 'UNSUPPORTED_RESULT_VALUE', message: 'Evaluator returned a non-scalar or unsupported numeric result', statementId: String(statementId), symbolId: target });
          continue;
        }
        const version = (assignmentVersions.get(target) ?? 0) + 1;
        assignmentVersions.set(target, version);
        const assignmentId = String(statement.assignmentId);
        const id = eventId(assignmentId, version);
        if (typeof id !== 'string' || !id.trim() || usedEventIds.has(id)) {
          throw new EvaluationFailure('INVALID_ASSIGNMENT_EVENT_ID', 'Assignment event IDs must be non-empty and unique within an evaluation');
        }
        usedEventIds.add(id);
        const state: AssignmentState = { assignmentId, assignmentVersion: version, assignmentEventId: id, mathJsonValue: evaluated.mathJson as JsonValue, numericValue: value, ...(unit ? { unit } : {}) };
        symbolStates.set(target, state);
        symbolFailures.delete(target);
        assignmentEvents.push({ statementId, assignmentId, symbolId: target, assignmentVersion: version, assignmentEventId: id, value, dependencies: [...dependencies.values()] });
      }
    } catch (error) {
      const code = error instanceof EvaluationFailure ? error.code : 'EVALUATION_FAILED';
      const message = error instanceof Error ? error.message : 'Unknown evaluation failure';
      diagnostics.push({ code, message, statementId: String(statementId) });
      results.push({ resultId: 'result:' + statementId, statementId, status: 'error', originalExpression: expression, substitutedMathJson: expression.mathJson, value: null, dependencies: [...dependencies.values()], substitutions, diagnostics: [{ code, message }] });
      if (kind === 'assign') symbolFailures.add(String(statement.targetSymbolId));
    }
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
