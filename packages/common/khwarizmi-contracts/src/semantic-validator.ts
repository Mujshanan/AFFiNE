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

const gcd = (left: bigint, right: bigint): bigint => {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
};

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
  // This matches the normative NFC + locale-independent Unicode lowercase rule.
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

export function validateCalculationSemantics(document: unknown, options: { unitRegistry?: unknown } = {}): SemanticValidationResult {
  const diagnostics: SemanticIssue[] = [];
  if (!isRecord(document)) {
    return { valid: false, diagnostics: [{ code: 'INVALID_DOCUMENT', message: 'Calculation document must be an object' }] };
  }

  const symbols = Array.isArray(document.symbols) ? document.symbols : [];
  const pages = Array.isArray(document.pages) ? document.pages : [];
  const registry = isRecord(options.unitRegistry) ? options.unitRegistry : undefined;
  const registryVersion = typeof registry?.version === 'string' ? registry.version : undefined;
  const hasUnitRegistry = registry !== undefined;
  const unitIds = new Set<string>(Array.isArray(registry?.units) ? registry.units.filter(isRecord).map(unit => unit.unitId).filter((id): id is string => typeof id === 'string') : []);
  if (registryVersion && document.unitRegistryVersion !== registryVersion) diagnostics.push({ code: 'UNIT_REGISTRY_VERSION_MISMATCH', message: 'Document unitRegistryVersion does not match the selected registry' });
  const documentSymbolIds = new Set<string>();
  const documentNames = new Map<string, string>();

  for (const symbol of symbols) {
    if (!isRecord(symbol)) continue;
    if (typeof symbol.symbolId === 'string') {
      if (documentSymbolIds.has(symbol.symbolId)) diagnostics.push({ code: 'DUPLICATE_SYMBOL_ID', message: 'Document symbol IDs must be unique', symbolId: symbol.symbolId });
      documentSymbolIds.add(symbol.symbolId);
    }
    if (isRecord(symbol.unit)) {
      const unitId = symbol.unit.unitId;
      if (unitId === 'unit.celsius' || unitId === 'unit.fahrenheit') diagnostics.push({ code: 'UNSUPPORTED_UNIT_KIND', message: 'Affine temperature units are not supported in v1', symbolId: symbol.symbolId });
      else if (typeof unitId === 'string' && hasUnitRegistry && !unitIds.has(unitId)) diagnostics.push({ code: 'UNKNOWN_UNIT', message: 'Symbol refers to a unit absent from the selected registry', symbolId: symbol.symbolId });
      if (registryVersion && symbol.unit.registryVersion !== registryVersion) diagnostics.push({ code: 'UNIT_REGISTRY_VERSION_MISMATCH', message: 'Symbol unit metadata uses a different registry version', symbolId: symbol.symbolId });
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
        if (documentSymbolIds.has(statement.localSymbolId)) diagnostics.push({ code: 'DUPLICATE_SYMBOL_ID', message: 'Local and document symbol IDs must not collide', statementId: statement.statementId, symbolId: statement.localSymbolId });
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

  const rootScope: Scope = { symbols: new Map<string, string>(symbols.filter(isRecord).map(symbol => [String(symbol.symbolId), String(symbol.displayName)] as [string, string])) };
  const visitExpression = (expr: unknown, scope: Scope, future: Set<string>, statementId?: string) => {
    if (isRecord(expr)) validateExpressionRecord(expr, new Set(scope.symbols.keys()), localIds, future, diagnostics, statementId);
  };

  const visitStatements = (statements: unknown, inherited: Scope, allowLocals: boolean, outerFuture: Set<string> = new Set()) => {
    if (!Array.isArray(statements)) return;
    const futureDirectLocals = new Set([
      ...outerFuture,
      ...statements.filter(isRecord).filter(s => s.kind === 'declareLocal' && typeof s.localSymbolId === 'string').map(s => s.localSymbolId)
    ]);
    const scope: Scope = { symbols: new Map(inherited.symbols) };

    statements.forEach((statement: unknown) => {
      if (!isRecord(statement)) return;
      const statementId = typeof statement.statementId === 'string' ? statement.statementId : undefined;
      if (statement.kind === 'assign') {
        if (typeof statement.targetSymbolId !== 'string' || !scope.symbols.has(statement.targetSymbolId)) {
          diagnostics.push({ code: localIds.has(statement.targetSymbolId) ? (futureDirectLocals.has(statement.targetSymbolId) ? 'LOCAL_USE_BEFORE_DECLARATION' : 'LOCAL_OUT_OF_SCOPE') : 'UNKNOWN_ASSIGNMENT_TARGET', message: 'Assignment target must be a declared document symbol or visible local', statementId, symbolId: statement.targetSymbolId });
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
        visitStatements(statement.then, scope, true, futureDirectLocals);
        visitStatements(statement.else, scope, true, futureDirectLocals);
      } else if (statement.kind === 'while') {
        visitExpression(statement.condition, scope, futureDirectLocals, statementId);
        visitStatements(statement.body, scope, true, futureDirectLocals);
      }
      if (statement.kind === 'declareLocal' && typeof statement.localSymbolId === 'string') futureDirectLocals.delete(statement.localSymbolId);
    });
  };

  // Top-level declarations are not lexical declarations; process top-level statements
  // in the explicit calculation order, while each control-flow block creates child scopes.
  const topById = new Map<string, AnyRecord>(topLevel.filter(isRecord).map(statement => [String(statement.statementId), statement] as [string, AnyRecord]));
  for (const statementId of actualOrder) {
    const statement = topById.get(statementId);
    if (statement) visitStatements([statement], rootScope, false);
  }

  const inspectUnits = (value: unknown) => {
    if (Array.isArray(value)) { value.forEach(inspectUnits); return; }
    if (!isRecord(value)) return;
    if (Array.isArray(value.unitAttachments)) {
      for (const attachment of value.unitAttachments) {
        if (!isRecord(attachment) || typeof attachment.unitId !== 'string') continue;
        if (attachment.unitId === 'unit.celsius' || attachment.unitId === 'unit.fahrenheit') diagnostics.push({ code: 'UNSUPPORTED_UNIT_KIND', message: 'Affine temperature units are not supported in v1', path: attachment.path });
        else if (hasUnitRegistry && !unitIds.has(attachment.unitId)) diagnostics.push({ code: 'UNKNOWN_UNIT', message: 'Expression refers to a unit absent from the selected registry', path: attachment.path });
      }
    }
    Object.values(value).forEach(inspectUnits);
  };
  inspectUnits(document);

  return { valid: diagnostics.length === 0, diagnostics };
}

export function validateDependencyGraph(graph: unknown): SemanticValidationResult {
  const diagnostics: SemanticIssue[] = [];
  if (!Array.isArray(graph)) return { valid: false, diagnostics: [{ code: 'INVALID_DEPENDENCY_GRAPH', message: 'Dependency graph must be an array' }] };

  const nodes = new Set<string>();
  const indegree = new Map<string, number>();
  const edges = new Map<string, string[]>();
  for (const edge of graph) {
    if (!isRecord(edge) || typeof edge.from !== 'string' || typeof edge.to !== 'string') {
      diagnostics.push({ code: 'INVALID_DEPENDENCY_GRAPH', message: 'Every dependency edge requires string from and to IDs' });
      continue;
    }
    nodes.add(edge.from);
    nodes.add(edge.to);
    indegree.set(edge.from, indegree.get(edge.from) ?? 0);
    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
    const targets = edges.get(edge.from) ?? [];
    targets.push(edge.to);
    edges.set(edge.from, targets);
  }

  const queue = [...nodes].filter(node => (indegree.get(node) ?? 0) === 0);
  let processed = 0;
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const node = queue[cursor];
    processed++;
    for (const target of edges.get(node) ?? []) {
      const remaining = (indegree.get(target) ?? 0) - 1;
      indegree.set(target, remaining);
      if (remaining === 0) queue.push(target);
    }
  }
  if (processed !== nodes.size) diagnostics.push({ code: 'DEPENDENCY_CYCLE', message: 'Persisted dependency graph contains a cycle' });
  return { valid: diagnostics.length === 0, diagnostics };
}

export function validateUnitRegistrySemantics(registry: unknown): SemanticValidationResult {
  const diagnostics: SemanticIssue[] = [];
  if (!isRecord(registry) || !Array.isArray(registry.units) || !Array.isArray(registry.prefixes) || !Array.isArray(registry.prefixableUnitIds)) {
    return { valid: false, diagnostics: [{ code: 'INVALID_UNIT_REGISTRY', message: 'Unit registry is missing required collections' }] };
  }
  const unitIds = new Set<string>();
  const unitSymbols = new Set<string>();
  for (const unit of registry.units) {
    if (!isRecord(unit) || typeof unit.unitId !== 'string' || typeof unit.symbol !== 'string') continue;
    if (unitIds.has(unit.unitId)) diagnostics.push({ code: 'DUPLICATE_UNIT_ID', message: 'Unit IDs must be unique' });
    if (unitSymbols.has(unit.symbol)) diagnostics.push({ code: 'DUPLICATE_UNIT_SYMBOL', message: 'Unit symbols must be unique' });
    unitIds.add(unit.unitId);
    unitSymbols.add(unit.symbol);
    if (isRecord(unit.scale)) {
      const numerator = BigInt(String(unit.scale.numerator ?? '0'));
      const denominator = BigInt(String(unit.scale.denominator ?? '0'));
      if (numerator <= 0n || denominator <= 0n || gcd(numerator, denominator) !== 1n) diagnostics.push({ code: 'INVALID_UNIT_SCALE', message: 'Unit scale must be a reduced positive rational' });
    }
    if (Array.isArray(unit.dimension)) {
      const bases = unit.dimension.filter(isRecord).map(item => item.base);
      if (new Set(bases).size !== bases.length) diagnostics.push({ code: 'INVALID_UNIT_DIMENSION', message: 'Dimension bases must not repeat' });
      if (bases.some((base, index) => typeof base !== 'string' || (index > 0 && String(bases[index - 1]) >= base))) diagnostics.push({ code: 'INVALID_UNIT_DIMENSION', message: 'Dimension bases must be sorted by identifier' });
      for (const item of unit.dimension.filter(isRecord)) {
        const numerator = BigInt(String(item.numerator ?? '0'));
        const denominator = BigInt(String(item.denominator ?? '0'));
        if (denominator <= 0n || numerator === 0n || gcd(numerator, denominator) !== 1n) diagnostics.push({ code: 'INVALID_UNIT_DIMENSION', message: 'Dimension exponents must be non-zero reduced rationals with positive denominators' });
      }
    }
  }
  const prefixIds = new Set<string>();
  for (const prefix of registry.prefixes) {
    if (!isRecord(prefix) || typeof prefix.prefixId !== 'string') continue;
    if (prefixIds.has(prefix.prefixId)) diagnostics.push({ code: 'DUPLICATE_PREFIX_ID', message: 'Prefix IDs must be unique' });
    prefixIds.add(prefix.prefixId);
    const numerator = BigInt(String(prefix.scaleNumerator ?? '0'));
    const denominator = BigInt(String(prefix.scaleDenominator ?? '0'));
    if (numerator <= 0n || denominator <= 0n || gcd(numerator, denominator) !== 1n) diagnostics.push({ code: 'INVALID_PREFIX_SCALE', message: 'Prefix scale must be a reduced positive rational' });
  }
  for (const unitId of registry.prefixableUnitIds) {
    if (typeof unitId !== 'string' || !unitIds.has(unitId)) diagnostics.push({ code: 'UNKNOWN_PREFIXABLE_UNIT', message: 'Prefixable unit ID must exist in the registry' });
  }
  return { valid: diagnostics.length === 0, diagnostics };
}

export function validateUnitReference(unitId: string, registry: unknown): SemanticValidationResult {
  if (unitId === 'unit.celsius' || unitId === 'unit.fahrenheit') {
    return { valid: false, diagnostics: [{ code: 'UNSUPPORTED_UNIT_KIND', message: 'Affine temperature units are not supported in v1' }] };
  }
  const units = isRecord(registry) && Array.isArray(registry.units) ? registry.units : [];
  const found = units.some(unit => isRecord(unit) && unit.unitId === unitId);
  return found
    ? { valid: true, diagnostics: [] }
    : { valid: false, diagnostics: [{ code: 'UNKNOWN_UNIT', message: 'Unit ID is not present in the selected registry' }] };
}

export function validateDiagnosticRegistrySemantics(registry: unknown): SemanticValidationResult {
  const diagnostics: SemanticIssue[] = [];
  if (!isRecord(registry) || !Array.isArray(registry.codes)) {
    return { valid: false, diagnostics: [{ code: 'INVALID_DIAGNOSTIC_REGISTRY', message: 'Diagnostic registry must contain a codes array' }] };
  }
  const seen = new Set<string>();
  for (const entry of registry.codes) {
    if (!isRecord(entry) || typeof entry.code !== 'string') continue;
    if (seen.has(entry.code)) diagnostics.push({ code: 'DUPLICATE_DIAGNOSTIC_CODE', message: 'Diagnostic codes must be unique: ' + entry.code });
    seen.add(entry.code);
  }
  return { valid: diagnostics.length === 0, diagnostics };
}

export function validateDiagnosticCodeMembership(codes: Iterable<string>, registry: unknown): SemanticValidationResult {
  const diagnostics: SemanticIssue[] = [];
  const registered = new Set<string>(
    isRecord(registry) && Array.isArray(registry.codes)
      ? registry.codes.filter(isRecord).map(entry => entry.code).filter((code): code is string => typeof code === 'string')
      : []
  );
  for (const code of new Set(codes)) {
    if (!registered.has(code)) diagnostics.push({ code: 'UNREGISTERED_DIAGNOSTIC_CODE', message: 'Diagnostic code is not registered: ' + code });
  }
  return { valid: diagnostics.length === 0, diagnostics };
}
