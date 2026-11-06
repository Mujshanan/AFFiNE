import type { JsonValue } from './json-schema.js';

export interface SemanticIssue {
  code: string;
  message: string;
  statementId?: string;
  symbolId?: string;
  path?: string;
}

export interface SemanticValidationResult {
  valid: boolean;
  diagnostics: SemanticIssue[];
}

type AnyRecord = Record<string, any>;
const isRecord = (value: unknown): value is AnyRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const pointerTokens = (pointer: string): string[] =>
  pointer === '' ? [] : pointer.slice(1).split('/').map(token => token.replace(/~1/g, '/').replace(/~0/g, '~'));

function valueAtPointer(root: unknown, pointer: string): unknown {
  let value = root;
  for (const token of pointerTokens(pointer)) {
    if (Array.isArray(value)) value = value[Number(token)];
    else if (isRecord(value)) value = value[token];
    else return undefined;
  }
  return value;
}

function normalizeName(name: string): string {
  // Locale-independent lowercasing is used here; full Unicode CaseFolding.txt
  // conformance is tracked separately from this first validator implementation.
  return name.normalize('NFC').toLowerCase();
}

function mathJsonTokens(value: unknown, tokens = new Set<string>()): Set<string> {
  if (typeof value === 'string' && /^kz_[A-Za-z0-9_-]{1,80}$/.test(value)) tokens.add(value);
  else if (Array.isArray(value)) value.forEach(child => mathJsonTokens(child, tokens));
  else if (isRecord(value)) Object.values(value).forEach(child => mathJsonTokens(child, tokens));
  return tokens;
}

function validateExpressionRecord(
  expression: AnyRecord,
  visibleSymbols: Set<string>,
  knownLocalIds: Set<string>,
  futureLocalIds: Set<string>,
  diagnostics: SemanticIssue[],
  statementId?: string
): void {
  const bindings = Array.isArray(expression.symbolBindings) ? expression.symbolBindings : [];
  const engineNames = new Set<string>();
  const boundTokens = new Set<string>();
  const boundSymbols = new Set<string>();

  for (const binding of bindings) {
    if (!isRecord(binding)) continue;
    if (typeof binding.engineSymbol === 'string') {
      if (engineNames.has(binding.engineSymbol)) diagnostics.push({ code: 'DUPLICATE_SYMBOL_BINDING', message: 'An engine token is bound more than once', statementId, symbolId: binding.symbolId });
      engineNames.add(binding.engineSymbol);
      boundTokens.add(binding.engineSymbol);
    }
    if (typeof binding.symbolId === 'string') {
      if (boundSymbols.has(binding.symbolId)) diagnostics.push({ code: 'DUPLICATE_SYMBOL_BINDING', message: 'A symbol is bound more than once in one expression', statementId, symbolId: binding.symbolId });
      boundSymbols.add(binding.symbolId);
      if (!visibleSymbols.has(binding.symbolId)) {
        diagnostics.push({
          code: knownLocalIds.has(binding.symbolId)
            ? (futureLocalIds.has(binding.symbolId) ? 'LOCAL_USE_BEFORE_DECLARATION' : 'LOCAL_OUT_OF_SCOPE')
            : 'UNRESOLVED_SYMBOL',
          message: 'Expression binding does not refer to a currently visible symbol',
          statementId,
          symbolId: binding.symbolId
        });
      }
    }
  }

  for (const token of mathJsonTokens(expression.mathJson)) {
    if (!boundTokens.has(token)) diagnostics.push({ code: 'UNBOUND_ENGINE_SYMBOL', message: 'MathJSON engine token has no symbol binding: ' + token, statementId });
  }
  for (const token of boundTokens) {
    if (!mathJsonTokens(expression.mathJson).has(token)) diagnostics.push({ code: 'UNUSED_SYMBOL_BINDING', message: 'Symbol binding is not used by MathJSON: ' + token, statementId });
  }

  for (const collectionName of ['authoredNumbers', 'unitAttachments', 'sourceMap']) {
    const entries = Array.isArray(expression[collectionName]) ? expression[collectionName] : [];
    for (const entry of entries) {
      if (!isRecord(entry) || typeof entry.path !== 'string') continue;
      const target = valueAtPointer(expression.mathJson, entry.path);
      if (target === undefined) {
        diagnostics.push({ code: 'INVALID_MATHJSON_PATH', message: collectionName + ' path does not resolve inside MathJSON', statementId, path: entry.path });
      } else if (collectionName === 'authoredNumbers') {
        const numericTarget = typeof target === 'number' || (isRecord(target) && typeof target.num === 'string') ||
          (Array.isArray(target) && target[0] === 'Rational');
        if (!numericTarget) diagnostics.push({ code: 'INVALID_MATHJSON_PATH', message: 'Authored-number path does not identify a numeric atom', statementId, path: entry.path });
      }
    }
  }
}

interface Scope {
  symbols: Map<string, string>;
}

export function validateCalculationSemantics(document: JsonValue | unknown): SemanticValidationResult {
  const diagnostics: SemanticIssue[] = [];
  if (!isRecord(document)) {
    return { valid: false, diagnostics: [{ code: 'INVALID_DOCUMENT', message: 'Calculation document must be an object' }] };
  }

  const symbols = Array.isArray(document.symbols) ? document.symbols : [];
  const pages = Array.isArray(document.pages) ? document.pages : [];
  const documentSymbolIds = new Set<string>();
  const documentNames = new Map<string, string>();

  for (const symbol of symbols) {
    if (!isRecord(symbol)) continue;
    if (typeof symbol.symbolId === 'string') {
      if (documentSymbolIds.has(symbol.symbolId)) diagnostics.push({ code: 'DUPLICATE_SYMBOL_ID', message: 'Document symbol IDs must be unique', symbolId: symbol.symbolId });
      documentSymbolIds.add(symbol.symbolId);
    }
    if (typeof symbol.displayName === 'string' && typeof symbol.normalizedName === 'string') {
      const normalized = normalizeName(symbol.displayName);
      if (normalized !== symbol.normalizedName) diagnostics.push({ code: 'INVALID_NORMALIZED_NAME', message: 'normalizedName must equal NFC-normalized, locale-independent lowercase displayName', symbolId: symbol.symbolId });
      const previous = documentNames.get(normalized);
      if (previous) diagnostics.push({ code: 'DUPLICATE_SYMBOL_NAME', message: 'Document-level symbol names must be unique after normalization', symbolId: symbol.symbolId });
      else documentNames.set(normalized, symbol.symbolId);
    }
  }

  const pageIds = new Set<string>();
  const statementIds = new Set<string>();
  const assignmentIds = new Set<string>();
  const localIds = new Set<string>();
  const topLevel: AnyRecord[] = [];

  const collect = (statements: unknown, top: boolean) => {
    if (!Array.isArray(statements)) return;
    for (const statement of statements) {
      if (!isRecord(statement)) continue;
      if (top) topLevel.push(statement);
      if (typeof statement.statementId === 'string') {
        if (statementIds.has(statement.statementId)) diagnostics.push({ code: 'DUPLICATE_STATEMENT_ID', message: 'Statement IDs must be unique throughout the document', statementId: statement.statementId });
        statementIds.add(statement.statementId);
      }
      if (statement.kind === 'assign' && typeof statement.assignmentId === 'string') {
        if (assignmentIds.has(statement.assignmentId)) diagnostics.push({ code: 'DUPLICATE_ASSIGNMENT_ID', message: 'Assignment IDs must be unique throughout the document', statementId: statement.statementId });
        assignmentIds.add(statement.assignmentId);
      }
      if (statement.kind === 'declareLocal' && typeof statement.localSymbolId === 'string') {
        if (localIds.has(statement.localSymbolId)) diagnostics.push({ code: 'DUPLICATE_LOCAL_ID', message: 'Local symbol IDs must be unique throughout the document', statementId: statement.statementId, symbolId: statement.localSymbolId });
        localIds.add(statement.localSymbolId);
      }
      if (statement.kind === 'if') {
        collect(statement.then, false);
        collect(statement.else, false);
      } else if (statement.kind === 'while') collect(statement.body, false);
    }
  };

  for (const page of pages) {
    if (!isRecord(page)) continue;
    if (typeof page.pageId === 'string') {
      if (pageIds.has(page.pageId)) diagnostics.push({ code: 'DUPLICATE_PAGE_ID', message: 'Page IDs must be unique' });
      pageIds.add(page.pageId);
    }
    collect(page.statements, true);
  }

  const expectedOrder = topLevel.map(statement => statement.statementId).filter((id): id is string => typeof id === 'string');
  const actualOrder = Array.isArray(document.calculationOrder) ? document.calculationOrder : [];
  const actualSet = new Set(actualOrder);
  if (actualSet.size !== actualOrder.length || actualOrder.length !== expectedOrder.length ||
      expectedOrder.some(id => !actualSet.has(id)) || actualOrder.some(id => !expectedOrder.includes(id))) {
    diagnostics.push({ code: 'INVALID_CALCULATION_ORDER', message: 'calculationOrder must contain every top-level statement ID exactly once and no nested statement IDs' });
  }

  const rootScope: Scope = { symbols: new Map(symbols.filter(isRecord).map(symbol => [symbol.symbolId, symbol.displayName])) };
  const visitExpression = (expr: unknown, scope: Scope, future: Set<string>, statementId?: string) => {
    if (isRecord(expr)) validateExpressionRecord(expr, new Set(scope.symbols.keys()), localIds, future, diagnostics, statementId);
  };

  const visitStatements = (statements: unknown, inherited: Scope, allowLocals: boolean) => {
    if (!Array.isArray(statements)) return;
    const futureDirectLocals = new Set(
      statements.filter(isRecord).filter(s => s.kind === 'declareLocal' && typeof s.localSymbolId === 'string').map(s => s.localSymbolId)
    );
    const scope: Scope = { symbols: new Map(inherited.symbols) };

    statements.forEach((statement: unknown, index: number) => {
      if (!isRecord(statement)) return;
      const statementId = typeof statement.statementId === 'string' ? statement.statementId : undefined;
      if (statement.kind === 'assign') {
        if (typeof statement.targetSymbolId !== 'string' || !scope.symbols.has(statement.targetSymbolId)) {
          diagnostics.push({ code: localIds.has(statement.targetSymbolId) ? 'LOCAL_OUT_OF_SCOPE' : 'UNKNOWN_ASSIGNMENT_TARGET', message: 'Assignment target must be a declared document symbol or visible local', statementId, symbolId: statement.targetSymbolId });
        }
        visitExpression(statement.expression, scope, futureDirectLocals, statementId);
      } else if (statement.kind === 'expression') {
        visitExpression(statement.expression, scope, futureDirectLocals, statementId);
      } else if (statement.kind === 'declareLocal') {
        if (!allowLocals) diagnostics.push({ code: 'LOCAL_OUT_OF_SCOPE', message: 'Local declarations are only valid inside if/while lexical blocks', statementId, symbolId: statement.localSymbolId });
        visitExpression(statement.initializer, scope, futureDirectLocals, statementId);
        const name = typeof statement.displayName === 'string' ? normalizeName(statement.displayName) : '';
        if (documentNames.has(name) || [...scope.symbols.values()].some(value => typeof value === 'string' && normalizeName(value) === name)) {
          diagnostics.push({ code: 'SHADOWED_LOCAL', message: 'A local cannot shadow a document symbol or visible local', statementId, symbolId: statement.localSymbolId });
        }
        if (typeof statement.localSymbolId === 'string' && typeof statement.displayName === 'string') scope.symbols.set(statement.localSymbolId, statement.displayName);
      } else if (statement.kind === 'if') {
        visitExpression(statement.condition, scope, futureDirectLocals, statementId);
        visitStatements(statement.then, scope, true);
        visitStatements(statement.else, scope, true);
      } else if (statement.kind === 'while') {
        visitExpression(statement.condition, scope, futureDirectLocals, statementId);
        visitStatements(statement.body, scope, true);
      }
      if (typeof statement.statementId === 'string') futureDirectLocals.delete(statement.statementId);
      if (index >= statements.length) return;
    });
  };

  // Top-level declarations are not lexical declarations; process top-level statements
  // in the explicit calculation order, while each control-flow block creates child scopes.
  const topById = new Map(topLevel.filter(isRecord).map(statement => [statement.statementId, statement]));
  for (const statementId of actualOrder) {
    const statement = topById.get(statementId);
    if (statement) visitStatements([statement], rootScope, false);
  }

  return { valid: diagnostics.length === 0, diagnostics };
}
