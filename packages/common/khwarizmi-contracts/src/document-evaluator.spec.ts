import { describe, expect, it } from 'vitest';

import type { ComputeEnginePort } from './compute-engine-adapter.js';
import { evaluateCalculationDocument } from './document-evaluator.js';

function arithmeticEngine(): ComputeEnginePort {
  const evaluate = (value: any): any => {
    if (typeof value === 'number') return value;
    if (value && typeof value === 'object' && typeof value.num === 'string') return Number(value.num);
    if (!Array.isArray(value)) return value;
    const args = value.slice(1).map(evaluate);
    switch (value[0]) {
      case 'Add': return args.reduce((a: number, b: number) => a + b, 0);
      case 'Multiply': return args.reduce((a: number, b: number) => a * b, 1);
      case 'Divide': return args[0] / args[1];
      default: throw new Error('Unsupported test operator');
    }
  };
  return {
    precision: 34,
    box(mathJson: never) {
      return {
        evaluate() {
          const result = evaluate(mathJson);
          return {
            evaluate() { return this; },
            toMathJson() { return { num: String(result) }; },
          };
        },
        toMathJson() { return mathJson; },
      };
    },
  };
}

const expression = (mathJson: unknown, bindings: Array<{ engineSymbol: string; symbolId: string }> = []) => ({
  format: 'khwarizmi.expression',
  schemaVersion: 1,
  mathJson,
  symbolBindings: bindings,
  authoredNumbers: [],
  unitAttachments: [],
  sourceMap: [],
});

const doc = {
  format: 'khwarizmi.calculation-document',
  schemaVersion: 1,
  documentId: 'doc-reassignment',
  semanticVersion: '1.0.0',
  unitRegistryVersion: 'si-engineering-1',
  symbols: [{ symbolId: 'x', displayName: 'x', normalizedName: 'x' }],
  pages: [{
    pageId: 'page-1',
    statements: [
      { kind: 'assign', statementId: 's1', assignmentId: 'a1', targetSymbolId: 'x', expression: expression(2) },
      { kind: 'assign', statementId: 's2', assignmentId: 'a2', targetSymbolId: 'x', expression: expression(['Add', 'kz_x', 3], [{ engineSymbol: 'kz_x', symbolId: 'x' }]) },
      { kind: 'expression', statementId: 's3', expression: expression('kz_x', [{ engineSymbol: 'kz_x', symbolId: 'x' }]) },
    ],
  }],
  calculationOrder: ['s1', 's2', 's3'],
};

describe('document evaluation vertical slice', () => {
  it('tracks sequential reassignment and binds reads to the preceding assignment version', () => {
    const result = evaluateCalculationDocument(doc, {
      createEngine: arithmeticEngine,
      validateDocument: () => ({ valid: true }),
      engineVersion: '0.180.0',
      documentRevision: 'a'.repeat(64),
      evaluationId: 'evaluation-1',
    });
    expect(result.status).toBe('completed');
    expect(result.assignmentEvents.map(event => event.assignmentVersion)).toEqual([1, 2]);
    expect(result.assignmentEvents[1].dependencies).toEqual([{
      symbolId: 'x',
      assignmentId: 'a1',
      assignmentVersion: 1,
      assignmentEventId: 'event:a1:1',
    }]);
    expect(result.results[2].dependencies).toEqual([{
      symbolId: 'x',
      assignmentId: 'a2',
      assignmentVersion: 2,
      assignmentEventId: 'event:a2:2',
    }]);
    expect(result.results[2].value).toEqual({ kind: 'exactDecimal', decimal: '5' });
    expect(result.results[2].substitutions).toEqual([{
      mathJsonPath: '',
      engineSymbol: 'kz_x',
      symbolId: 'x',
      value: { kind: 'exactDecimal', decimal: '5' },
      assignmentId: 'a2',
      assignmentVersion: 2,
      assignmentEventId: 'event:a2:2',
    }]);
  });

  it('does not execute a document that fails validation', () => {
    expect(() => evaluateCalculationDocument(doc, {
      createEngine: arithmeticEngine,
      validateDocument: () => ({ valid: false, diagnostics: [{ code: 'INVALID_DOCUMENT', message: 'bad schema' }] }),
      engineVersion: '0.180.0',
      documentRevision: 'a'.repeat(64),
      evaluationId: 'evaluation-2',
    })).toThrow(/Document validation failed/);
  });

  it('preserves authored decimal scale including trailing zeros', () => {
    const scaled = {
      ...doc,
      pages: [{
        pageId: 'page-1',
        statements: [{
          kind: 'expression',
          statementId: 'scaled',
          expression: {
            ...expression(1.2),
            authoredNumbers: [{ path: '', representation: 'exactDecimal', lexeme: '1.20' }],
          },
        }],
      }],
      calculationOrder: ['scaled'],
    };
    const result = evaluateCalculationDocument(scaled, {
      createEngine: arithmeticEngine,
      validateDocument: () => ({ valid: true }),
      engineVersion: '0.180.0',
      documentRevision: 'b'.repeat(64),
      evaluationId: 'evaluation-scaled',
    });
    expect(result.results[0].value).toEqual({ kind: 'exactDecimal', decimal: '1.2' });
    expect(result.results[0].substitutedMathJson).toEqual({ num: '1.20' });
  });

  it('rejects duplicate calculation-order entries before invoking the engine', () => {
    let engineCalls = 0;
    const invalid = { ...doc, calculationOrder: ['s1', 's1'] };
    expect(() => evaluateCalculationDocument(invalid, {
      createEngine: () => {
        engineCalls++;
        return arithmeticEngine();
      },
      validateDocument: () => ({ valid: true }),
      engineVersion: '0.180.0',
      documentRevision: 'c'.repeat(64),
      evaluationId: 'evaluation-duplicate-order',
    })).toThrow(/Duplicate statement in calculationOrder/);
    expect(engineCalls).toBe(0);
  });

  it('rejects duplicate statement IDs instead of silently shadowing a statement', () => {
    const invalid = {
      ...doc,
      pages: [{
        pageId: 'page-1',
        statements: [
          { kind: 'expression', statementId: 'same', expression: expression(1) },
          { kind: 'expression', statementId: 'same', expression: expression(2) },
        ],
      }],
      calculationOrder: ['same'],
    };
    expect(() => evaluateCalculationDocument(invalid, {
      createEngine: arithmeticEngine,
      validateDocument: () => ({ valid: true }),
      engineVersion: '0.180.0',
      documentRevision: 'd'.repeat(64),
      evaluationId: 'evaluation-duplicate-id',
    })).toThrow(/Duplicate statementId/);
  });

  it('rejects an invalid revision digest before evaluation', () => {
    expect(() => evaluateCalculationDocument(doc, {
      createEngine: arithmeticEngine,
      validateDocument: () => ({ valid: true }),
      engineVersion: '0.180.0',
      documentRevision: 'not-a-digest',
      evaluationId: 'evaluation-3',
    })).toThrow(/SHA-256/);
  });
});
