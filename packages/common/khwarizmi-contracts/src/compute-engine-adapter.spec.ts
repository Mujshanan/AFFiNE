import { describe, expect, it } from 'vitest';

import { type ComputeEnginePort, evaluateMathJson } from './compute-engine-adapter.js';

function fakeEngine(): ComputeEnginePort {
  return {
    precision: 21,
    box() {
      return {
        evaluate() {
          return {
            evaluate() { return this; },
            toMathJson: () => ({ num: '5' }),
          };
        },
        toMathJson: () => ({ num: '2' }),
      };
    },
  };
}

describe('Compute Engine adapter boundary', () => {
  it('uses a fresh host-provided engine and precision-preserving serialization', () => {
    let factoryCalls = 0;
    const result = evaluateMathJson(['Add', { num: '2' }, { num: '3' }], () => {
      factoryCalls++;
      return fakeEngine();
    });
    expect(factoryCalls).toBe(1);
    expect(result.precision).toBe(34);
    expect(result.mathJson).toEqual({ num: '5' });
  });

  it('rejects invalid precision before creating an engine', () => {
    let factoryCalls = 0;
    expect(() => evaluateMathJson({ num: '1' }, () => {
      factoryCalls++;
      return fakeEngine();
    }, { precision: 0 })).toThrow(RangeError);
    expect(factoryCalls).toBe(0);
  });
});
