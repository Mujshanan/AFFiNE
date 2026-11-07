import { describe, expect, it } from 'vitest';

import type { ComputeEnginePort } from './compute-engine-adapter.js';
import { evaluateCalculationDocument } from './document-evaluator.js';

const registry = {
  format: 'khwarizmi.unit-registry',
  version: 'si-engineering-1',
  units: [
    {
      unitId: 'metre',
      symbol: 'm',
      scale: { kind: 'exact-rational', numerator: '1', denominator: '1' },
      dimension: [{ base: 'length', numerator: '1', denominator: '1' }],
    },
    {
      unitId: 'millimetre',
      symbol: 'mm',
      scale: { kind: 'exact-rational', numerator: '1', denominator: '1000' },
      dimension: [{ base: 'length', numerator: '1', denominator: '1' }],
    },
    {
      unitId: 'kilogram',
      symbol: 'kg',
      scale: { kind: 'exact-rational', numerator: '1', denominator: '1' },
      dimension: [{ base: 'mass', numerator: '1', denominator: '1' }],
    },
    {
      unitId: 'degree',
      symbol: 'deg',
      scale: { kind: 'piRational', numerator: '1', denominator: '180' },
      dimension: [{ base: 'angle', numerator: '1', denominator: '1' }],
    },
    {
      unitId: 'radian',
      symbol: 'rad',
      scale: { kind: 'exact-rational', numerator: '1', denominator: '1' },
      dimension: [{ base: 'angle', numerator: '1', denominator: '1' }],
    },
    {
      unitId: 'newton',
      symbol: 'N',
      scale: { kind: 'exact-rational', numerator: '1', denominator: '1' },
      dimension: [
        { base: 'length', numerator: '1', denominator: '1' },
        { base: 'mass', numerator: '1', denominator: '1' },
        { base: 'time', numerator: '-2', denominator: '1' },
      ],
    },
    {
      unitId: 'square-metre',
      symbol: 'm²',
      scale: { kind: 'exact-rational', numerator: '1', denominator: '1' },
      dimension: [{ base: 'length', numerator: '2', denominator: '1' }],
    },
  ],
};

function fakeEngine(): ComputeEnginePort {
  const evaluate = (value: unknown): unknown => {
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      if (value === 'Pi') return Math.PI;
      if (value === 'True') return true;
      if (value === 'False') return false;
      throw new Error('Unknown test symbol: ' + value);
    }
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      typeof (value as Record<string, unknown>).num === 'string'
    )
      return Number((value as Record<string, string>).num);
    if (!Array.isArray(value)) return value;
    const args = value.slice(1).map(evaluate) as number[];
    switch (value[0]) {
      case 'Rational':
      case 'Divide':
        return (args[0] ?? 0) / (args[1] ?? 1);
      case 'Add':
        return args.reduce((a: number, b: number) => a + b, 0);
      case 'Multiply':
        return args.reduce((a: number, b: number) => a * b, 1);
      case 'Power':
        return Math.pow(args[0] ?? 0, args[1] ?? 0);
      case 'Sin':
        return Math.sin(args[0] ?? 0);
      case 'Cos':
        return Math.cos(args[0] ?? 0);
      case 'Tan':
        return Math.tan(args[0] ?? 0);
      default:
        throw new Error('Unsupported test operator: ' + value[0]);
    }
  };
  const mathJson = (value: unknown): unknown => {
    if (typeof value === 'boolean') return value ? 'True' : 'False';
    if (typeof value === 'number' && Math.abs(value - 0.5) < 1e-12)
      return ['Rational', { num: '1' }, { num: '2' }];
    if (typeof value === 'number') return { num: String(value) };
    return value;
  };
  return {
    precision: 34,
    box(mathJsonInput: unknown) {
      return {
        evaluate() {
          const value = evaluate(mathJsonInput);
          return {
            evaluate() {
              return this;
            },
            toMathJson: () => mathJson(value),
          };
        },
        toMathJson: () => mathJsonInput,
      };
    },
  };
}

const expression = (
  mathJson: unknown,
  bindings: Array<{ engineSymbol: string; symbolId: string }> = [],
  authoredNumbers: Array<Record<string, unknown>> = []
) => ({
  format: 'khwarizmi.expression',
  schemaVersion: 1,
  mathJson,
  symbolBindings: bindings,
  authoredNumbers,
  unitAttachments: [],
  sourceMap: [],
});

const unit = (unitId: string, symbol: string, dimension: unknown[]) => ({
  unitId,
  registryVersion: 'si-engineering-1',
  symbol,
  dimension,
});

const options = (evaluationId: string) => ({
  createEngine: fakeEngine,
  validateDocument: () => ({ valid: true }),
  engineVersion: '0.180.0',
  documentRevision: 'a'.repeat(64),
  evaluationId,
  unitRegistry: registry,
});

describe('document evaluator unit semantics', () => {
  it('converts compatible units before evaluating an addition', () => {
    const document = {
      format: 'khwarizmi.calculation-document',
      schemaVersion: 1,
      documentId: 'unit-conversion-document',
      semanticVersion: '1.0.0',
      unitRegistryVersion: 'si-engineering-1',
      symbols: [
        { symbolId: 'length-m', unit: unit('metre', 'm', [{ base: 'length', numerator: '1', denominator: '1' }]) },
        { symbolId: 'length-mm', unit: unit('millimetre', 'mm', [{ base: 'length', numerator: '1', denominator: '1' }]) },
      ],
      pages: [{
        pageId: 'page-1',
        statements: [
          {
            kind: 'assign',
            statementId: 'm-set',
            assignmentId: 'assignment-m',
            targetSymbolId: 'length-m',
            expression: expression(1, [], [{ path: '', lexeme: '1', representation: 'exactDecimal' }]),
          },
          {
            kind: 'assign',
            statementId: 'mm-set',
            assignmentId: 'assignment-mm',
            targetSymbolId: 'length-mm',
            expression: expression(1000, [], [{ path: '', lexeme: '1000', representation: 'exactDecimal' }]),
          },
          {
            kind: 'expression',
            statementId: 'sum',
            expression: expression(
              ['Add', 'kz_m', 'kz_mm'],
              [
                { engineSymbol: 'kz_m', symbolId: 'length-m' },
                { engineSymbol: 'kz_mm', symbolId: 'length-mm' },
              ]
            ),
          },
        ],
      }],
      calculationOrder: ['m-set', 'mm-set', 'sum'],
    };

    const result = evaluateCalculationDocument(document, options('unit-conversion'));
    expect(result.status).toBe('completed');
    expect(result.results.at(-1)?.value).toEqual({ kind: 'exactDecimal', decimal: '2' });
    expect(result.results.at(-1)?.unit).toMatchObject({
      unitId: 'metre',
      registryVersion: 'si-engineering-1',
      symbol: 'm',
    });
  });

  it('rejects addition of incompatible dimensions with a stable diagnostic', () => {
    const document = {
      format: 'khwarizmi.calculation-document',
      schemaVersion: 1,
      documentId: 'unit-mismatch-document',
      semanticVersion: '1.0.0',
      unitRegistryVersion: 'si-engineering-1',
      symbols: [
        { symbolId: 'length', unit: unit('metre', 'm', [{ base: 'length', numerator: '1', denominator: '1' }]) },
        { symbolId: 'mass', unit: unit('kilogram', 'kg', [{ base: 'mass', numerator: '1', denominator: '1' }]) },
      ],
      pages: [{
        pageId: 'page-1',
        statements: [
          {
            kind: 'assign',
            statementId: 'length-set',
            assignmentId: 'assignment-length',
            targetSymbolId: 'length',
            expression: expression(1, [], [{ path: '', lexeme: '1', representation: 'exactDecimal' }]),
          },
          {
            kind: 'assign',
            statementId: 'mass-set',
            assignmentId: 'assignment-mass',
            targetSymbolId: 'mass',
            expression: expression(1, [], [{ path: '', lexeme: '1', representation: 'exactDecimal' }]),
          },
          {
            kind: 'expression',
            statementId: 'invalid-sum',
            expression: expression(
              ['Add', 'kz_length', 'kz_mass'],
              [
                { engineSymbol: 'kz_length', symbolId: 'length' },
                { engineSymbol: 'kz_mass', symbolId: 'mass' },
              ]
            ),
          },
        ],
      }],
      calculationOrder: ['length-set', 'mass-set', 'invalid-sum'],
    };

    const result = evaluateCalculationDocument(document, options('unit-mismatch'));
    expect(result.status).toBe('completedWithErrors');
    expect(result.results.at(-1)?.status).toBe('error');
    expect(result.diagnostics.map(item => item.code)).toContain('DIMENSION_MISMATCH');
  });

  it('converts degrees to radians before trigonometric evaluation', () => {
    const document = {
      format: 'khwarizmi.calculation-document',
      schemaVersion: 1,
      documentId: 'angle-document',
      semanticVersion: '1.0.0',
      unitRegistryVersion: 'si-engineering-1',
      symbols: [
        { symbolId: 'theta', unit: unit('degree', 'deg', [{ base: 'angle', numerator: '1', denominator: '1' }]) },
      ],
      pages: [{
        pageId: 'page-1',
        statements: [
          {
            kind: 'assign',
            statementId: 'theta-set',
            assignmentId: 'assignment-theta',
            targetSymbolId: 'theta',
            expression: expression(30, [], [{ path: '', lexeme: '30', representation: 'exactDecimal' }]),
          },
          {
            kind: 'expression',
            statementId: 'sine',
            expression: expression(
              ['Sin', 'kz_theta'],
              [{ engineSymbol: 'kz_theta', symbolId: 'theta' }]
            ),
          },
        ],
      }],
      calculationOrder: ['theta-set', 'sine'],
    };

    const result = evaluateCalculationDocument(document, options('angle-evaluation'));
    expect(result.status).toBe('completed');
    expect(result.results.at(-1)?.value).toEqual({ kind: 'exactDecimal', decimal: '0.5' });
  });

  it('composes dimensions for multiplication and division', () => {
    const document = {
      format: 'khwarizmi.calculation-document',
      schemaVersion: 1,
      documentId: 'derived-unit-document',
      semanticVersion: '1.0.0',
      unitRegistryVersion: 'si-engineering-1',
      symbols: [
        { symbolId: 'force', unit: unit('newton', 'N', [
          { base: 'length', numerator: '1', denominator: '1' },
          { base: 'mass', numerator: '1', denominator: '1' },
          { base: 'time', numerator: '-2', denominator: '1' },
        ]) },
        { symbolId: 'area', unit: unit('square-metre', 'm²', [{ base: 'length', numerator: '2', denominator: '1' }]) },
      ],
      pages: [{
        pageId: 'page-1',
        statements: [
          {
            kind: 'assign',
            statementId: 'force-set',
            assignmentId: 'assignment-force',
            targetSymbolId: 'force',
            expression: expression(100, [], [{ path: '', lexeme: '100', representation: 'exactDecimal' }]),
          },
          {
            kind: 'assign',
            statementId: 'area-set',
            assignmentId: 'assignment-area',
            targetSymbolId: 'area',
            expression: expression(2, [], [{ path: '', lexeme: '2', representation: 'exactDecimal' }]),
          },
          {
            kind: 'expression',
            statementId: 'stress',
            expression: expression(
              ['Divide', 'kz_force', 'kz_area'],
              [
                { engineSymbol: 'kz_force', symbolId: 'force' },
                { engineSymbol: 'kz_area', symbolId: 'area' },
              ]
            ),
          },
        ],
      }],
      calculationOrder: ['force-set', 'area-set', 'stress'],
    };

    const result = evaluateCalculationDocument(document, options('derived-unit'));
    expect(result.status).toBe('completed');
    expect(result.results.at(-1)?.unit).toMatchObject({
      unitId: 'derived:newton^1/1*square-metre^-1/1',
      symbol: 'N/m²',
      dimension: [
        { base: 'length', numerator: '-1', denominator: '1' },
        { base: 'mass', numerator: '1', denominator: '1' },
        { base: 'time', numerator: '-2', denominator: '1' },
      ],
    });
  });
});
