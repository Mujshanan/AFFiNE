import { describe, expect, it } from 'vitest';

import {
  canonicalSha256,
  canonicalizeJson,
  isEvaluationSnapshotCurrent,
  verifyCanonicalSha256,
} from './document-integrity.js';

describe('RFC 8785 document integrity', () => {
  it('canonicalizes object keys and preserves array order', () => {
    expect(
      canonicalizeJson({
        z: [3, 2, 1],
        a: { y: true, b: 'text' },
      })
    ).toBe('{"a":{"b":"text","y":true},"z":[3,2,1]}');
  });

  it('uses ECMAScript number serialization and canonicalizes negative zero', () => {
    expect(canonicalizeJson(-0)).toBe('0');
    expect(canonicalizeJson(1e30)).toBe('1e+30');
    expect(canonicalizeJson(1e-7)).toBe('1e-7');
  });

  it('rejects values that are not valid canonical JSON inputs', () => {
    expect(() => canonicalizeJson(undefined)).toThrow(/not representable/);
    expect(() => canonicalizeJson(1n)).toThrow(/not representable/);
    expect(() => canonicalizeJson(Number.NaN)).toThrow(/non-finite/);
    expect(() => canonicalizeJson(new Date())).toThrow(/plain objects/);
    expect(() => canonicalizeJson([, 1])).toThrow(/holes/);
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => canonicalizeJson(circular)).toThrow(/cycles/);
    const accessor = Object.defineProperty({}, 'value', {
      enumerable: true,
      get: () => 1,
    });
    expect(() => canonicalizeJson(accessor)).toThrow(/accessor/);
  });

  it('computes and verifies the SHA-256 digest of canonical bytes', async () => {
    const digest = await canonicalSha256({});
    expect(digest).toBe(
      '44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a'
    );
    expect(await verifyCanonicalSha256({}, digest)).toBe(true);
    expect(await verifyCanonicalSha256({ changed: true }, digest)).toBe(false);
    expect(await verifyCanonicalSha256({}, 'not-a-digest')).toBe(false);
  });

  it('marks snapshots stale when any semantic input version changes', () => {
    const snapshot = {
      documentId: 'doc-1',
      documentRevision: 'a'.repeat(64),
      semanticVersion: '1.0.0',
      unitRegistryVersion: 'si-1',
      engine: { name: 'cortexjs-compute-engine', version: '0.180.0' },
    };
    const current = {
      documentId: 'doc-1',
      documentRevision: 'a'.repeat(64),
      semanticVersion: '1.0.0',
      unitRegistryVersion: 'si-1',
    };
    expect(isEvaluationSnapshotCurrent(snapshot, current)).toBe(true);
    expect(
      isEvaluationSnapshotCurrent(snapshot, {
        ...current,
        documentRevision: 'b'.repeat(64),
      })
    ).toBe(false);
    expect(
      isEvaluationSnapshotCurrent(snapshot, {
        ...current,
        unitRegistryVersion: 'si-2',
      })
    ).toBe(false);
  });
});
