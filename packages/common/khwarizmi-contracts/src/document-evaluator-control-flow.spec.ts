import { describe, expect, it } from 'vitest';

import type { ComputeEnginePort } from './compute-engine-adapter.js';
import { evaluateCalculationDocument } from './document-evaluator.js';

function engine(): ComputeEnginePort {
  const evaluate = (value: any): any => {
    if (typeof value === 'number') return value;
    if (typeof value === 'boolean' || typeof value === 'string') return value;
    if (value && typeof value === 'object' && typeof value.num === 'string')
      return Number(value.num);
    if (!Array.isArray(value)) return value;
    const args = value.slice(1).map(evaluate);
    switch (value[0]) {
      case 'Add':
        return args.reduce((a: number, b: number) => a + b, 0);
      case 'Multiply':
        return args.reduce((a: number, b: number) => a * b, 1);
      case 'Divide':
        if (args[1] === 0) throw new Error('division by zero');
        return args[0] / args[1];
      case 'Less':
        return args[0] < args[1];
      case 'Greater':
        return args[0] > args[1];
      default:
        throw new Error('Unsupported test operator: ' + value[0]);
    }
  };
  const mathJson = (value: any): unknown =>
    typeof value === 'boolean' || value === 'True' || value === 'False'
      ? (value === true || value === 'True' ? 'True' : 'False')
      : { num: String(value) };
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

const condition = (
  mathJson: unknown,
  bindings: Array<{ engineSymbol: string; symbolId: string }> = []
) => ({
  ...expression(mathJson, bindings),
  format: 'khwarizmi.condition-expression',
});

const options = (evaluationId: string) => ({
  createEngine: engine,
  validateDocument: () => ({ valid: true }),
  engineVersion: '0.180.0',
  documentRevision: 'a'.repeat(64),
  evaluationId,
});

describe('document evaluator lexical control flow', () => {
  it('executes only the selected if branch and records its control-flow path', () => {
    const document = {
      format: 'khwarizmi.calculation-document',
      schemaVersion: 1,
      documentId: 'if-document',
      semanticVersion: '1.0.0',
      unitRegistryVersion: 'si-engineering-1',
      symbols: [{ symbolId: 'x', displayName: 'x', normalizedName: 'x' }],
      pages: [{
        pageId: 'page-1',
        statements: [
          {
            kind: 'if',
            statementId: 'if-1',
            condition: condition('True'),
            then: [{
              kind: 'assign',
              statementId: 'then-x',
              assignmentId: 'assignment-then-x',
              targetSymbolId: 'x',
              expression: expression(5, [], [{ path: '', lexeme: '5', representation: 'exactDecimal' }]),
            }],
            else: [{
              kind: 'assign',
              statementId: 'else-x',
              assignmentId: 'assignment-else-x',
              targetSymbolId: 'x',
              expression: expression(7, [], [{ path: '', lexeme: '7', representation: 'exactDecimal' }]),
            }],
          },
          {
            kind: 'expression',
            statementId: 'read-x',
            expression: expression('kz_x', [{ engineSymbol: 'kz_x', symbolId: 'x' }]),
          },
        ],
      }],
      calculationOrder: ['if-1', 'read-x'],
    };

    const result = evaluateCalculationDocument(document, options('if-test'));
    expect(result.status).toBe('completed');
    expect(result.assignmentEvents.map(event => event.assignmentId)).toEqual([
      'assignment-then-x',
    ]);
    expect(result.results.at(-1)?.value).toEqual({ kind: 'exactDecimal', decimal: '5' });
    expect(result.results.at(-1)?.controlFlowPath).toEqual([
      { statementId: 'if-1', kind: 'if-then' },
    ]);
  });

  it('supports nested local capture without leaking locals outside their block', () => {
    const document = {
      format: 'khwarizmi.calculation-document',
      schemaVersion: 1,
      documentId: 'local-document',
      semanticVersion: '1.0.0',
      unitRegistryVersion: 'si-engineering-1',
      symbols: [],
      pages: [{
        pageId: 'page-1',
        statements: [
          {
            kind: 'if',
            statementId: 'outer-if',
            condition: condition('True'),
            then: [
              {
                kind: 'declareLocal',
                statementId: 'local-declare',
                localSymbolId: 'local-a',
                displayName: 'a',
                initializer: expression(4, [], [{ path: '', lexeme: '4', representation: 'exactDecimal' }]),
              },
              {
                kind: 'if',
                statementId: 'inner-if',
                condition: condition('True'),
                then: [{
                  kind: 'expression',
                  statementId: 'inner-read',
                  expression: expression('kz_a', [{ engineSymbol: 'kz_a', symbolId: 'local-a' }]),
                }],
                else: [],
              },
            ],
            else: [],
          },
          {
            kind: 'expression',
            statementId: 'after-if',
            expression: expression('kz_a', [{ engineSymbol: 'kz_a', symbolId: 'local-a' }]),
          },
        ],
      }],
      calculationOrder: ['outer-if', 'after-if'],
    };

    const result = evaluateCalculationDocument(document, options('local-test'));
    const inner = result.results.find(item => item.statementId === 'inner-read');
    const leaked = result.results.find(item => item.statementId === 'after-if');
    expect(inner?.value).toEqual({ kind: 'exactDecimal', decimal: '4' });
    expect(inner?.controlFlowPath).toEqual([
      { statementId: 'outer-if', kind: 'if-then' },
      { statementId: 'inner-if', kind: 'if-then' },
    ]);
    expect(leaked?.status).toBe('error');
    expect(result.diagnostics.some(item => item.code === 'UNRESOLVED_SYMBOL')).toBe(true);
  });

  it('tracks sequential reassignment inside a while loop', () => {
    const document = {
      format: 'khwarizmi.calculation-document',
      schemaVersion: 1,
      documentId: 'loop-document',
      semanticVersion: '1.0.0',
      unitRegistryVersion: 'si-engineering-1',
      symbols: [{ symbolId: 'i', displayName: 'i', normalizedName: 'i' }],
      pages: [{
        pageId: 'page-1',
        statements: [
          {
            kind: 'assign',
            statementId: 'i-init',
            assignmentId: 'assignment-i-init',
            targetSymbolId: 'i',
            expression: expression(0, [], [{ path: '', lexeme: '0', representation: 'exactDecimal' }]),
          },
          {
            kind: 'while',
            statementId: 'loop',
            condition: condition(['Less', 'kz_i', 3], [{ engineSymbol: 'kz_i', symbolId: 'i' }]),
            body: [{
              kind: 'assign',
              statementId: 'i-step',
              assignmentId: 'assignment-i-step',
              targetSymbolId: 'i',
              expression: expression(
                ['Add', 'kz_i', 1],
                [{ engineSymbol: 'kz_i', symbolId: 'i' }],
                [{ path: '/2', lexeme: '1', representation: 'exactDecimal' }]
              ),
            }],
          },
          {
            kind: 'expression',
            statementId: 'i-read',
            expression: expression('kz_i', [{ engineSymbol: 'kz_i', symbolId: 'i' }]),
          },
        ],
      }],
      calculationOrder: ['i-init', 'loop', 'i-read'],
    };

    const result = evaluateCalculationDocument(document, options('loop-test'));
    expect(result.status).toBe('completed');
    expect(result.assignmentEvents.map(event => event.assignmentVersion)).toEqual([1, 2, 3, 4]);
    expect(result.results.at(-1)?.value).toEqual({ kind: 'exactDecimal', decimal: '3' });
  });

  it('enforces a deterministic total loop-iteration budget', () => {
    const document = {
      format: 'khwarizmi.calculation-document',
      schemaVersion: 1,
      documentId: 'loop-limit-document',
      semanticVersion: '1.0.0',
      unitRegistryVersion: 'si-engineering-1',
      symbols: [],
      pages: [{
        pageId: 'page-1',
        statements: [{
          kind: 'while',
          statementId: 'loop',
          condition: condition('True'),
          body: [{
            kind: 'expression',
            statementId: 'loop-expression',
            expression: expression(1, [], [{ path: '', lexeme: '1', representation: 'exactDecimal' }]),
          }],
        }],
      }],
      calculationOrder: ['loop'],
    };

    const result = evaluateCalculationDocument(document, {
      ...options('loop-limit-test'),
      maxLoopIterations: 3,
    });
    expect(result.status).toBe('completedWithErrors');
    expect(result.results).toHaveLength(3);
    expect(result.diagnostics.map(item => item.code)).toContain('RESOURCE_LIMIT_EXCEEDED');
  });
});
