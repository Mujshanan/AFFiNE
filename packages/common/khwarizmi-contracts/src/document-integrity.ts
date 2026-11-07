export interface EvaluationSnapshotIdentity {
  documentId: string;
  documentRevision: string;
  semanticVersion: string;
  unitRegistryVersion: string;
  engine: { name: string; version: string };
}

export interface AuthoredDocumentIdentity {
  documentId: string;
  documentRevision: string;
  semanticVersion: string;
  unitRegistryVersion: string;
}

export type DigestCrypto = Pick<Crypto, 'subtle'>;

function assertWellFormedUnicode(value: string): void {
  for (let index = 0; index < value.length; index++) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff))
        throw new TypeError(
          'Canonical JSON strings must contain valid Unicode'
        );
      index++;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      throw new TypeError('Canonical JSON strings must contain valid Unicode');
    }
  }
}

/**
 * RFC 8785 JSON Canonicalization Scheme for JSON-compatible values.
 * Rejects values that JSON.stringify would silently omit or coerce.
 */
export function canonicalizeJson(value: unknown): string {
  const active = new Set<object>();

  const serialize = (item: unknown): string => {
    if (item === null) return 'null';
    if (typeof item === 'boolean') return item ? 'true' : 'false';
    if (typeof item === 'string') {
      assertWellFormedUnicode(item);
      const serialized = JSON.stringify(item);
      if (serialized === undefined)
        throw new TypeError('Canonical JSON string could not be serialized');
      return serialized;
    }
    if (typeof item === 'number') {
      if (!Number.isFinite(item))
        throw new TypeError(
          'Canonical JSON does not permit non-finite numbers'
        );
      return Object.is(item, -0) ? '0' : JSON.stringify(item);
    }
    if (typeof item !== 'object')
      throw new TypeError('Value is not representable in canonical JSON');

    if (active.has(item))
      throw new TypeError('Canonical JSON cannot contain cycles');
    active.add(item);
    try {
      if (Array.isArray(item)) {
        const entries: string[] = [];
        for (let index = 0; index < item.length; index++) {
          if (!Object.prototype.hasOwnProperty.call(item, index))
            throw new TypeError('Canonical JSON arrays cannot contain holes');
          entries.push(serialize(item[index]));
        }
        const ownKeys = Reflect.ownKeys(item);
        if (
          ownKeys.some(
            key =>
              typeof key === 'symbol' ||
              (key !== 'length' &&
                (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= item.length))
          )
        )
          throw new TypeError(
            'Canonical JSON arrays cannot contain extra properties'
          );
        return '[' + entries.join(',') + ']';
      }

      const prototype = Object.getPrototypeOf(item);
      if (prototype !== Object.prototype && prototype !== null)
        throw new TypeError('Canonical JSON objects must be plain objects');
      const ownKeys = Reflect.ownKeys(item);
      if (ownKeys.some(key => typeof key === 'symbol'))
        throw new TypeError(
          'Canonical JSON objects cannot contain symbol keys'
        );
      const keys = (ownKeys as string[]).sort();
      const properties = keys.map(key => {
        assertWellFormedUnicode(key);
        const descriptor = Object.getOwnPropertyDescriptor(item, key);
        if (!descriptor || !descriptor.enumerable)
          throw new TypeError(
            'Canonical JSON objects require enumerable properties'
          );
        if (!Object.prototype.hasOwnProperty.call(descriptor, 'value'))
          throw new TypeError(
            'Canonical JSON objects cannot contain accessor properties'
          );
        const serializedKey = JSON.stringify(key);
        if (serializedKey === undefined)
          throw new TypeError(
            'Canonical JSON object key could not be serialized'
          );
        return serializedKey + ':' + serialize(descriptor.value);
      });
      return '{' + properties.join(',') + '}';
    } finally {
      active.delete(item);
    }
  };

  return serialize(value);
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function canonicalSha256(
  value: unknown,
  cryptoApi: DigestCrypto = globalThis.crypto
): Promise<string> {
  if (!cryptoApi?.subtle)
    throw new Error('Web Crypto SHA-256 is unavailable in this environment');
  const canonical = canonicalizeJson(value);
  const digest = await cryptoApi.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(canonical)
  );
  return toHex(new Uint8Array(digest));
}

export async function verifyCanonicalSha256(
  value: unknown,
  expectedDigest: string,
  cryptoApi: DigestCrypto = globalThis.crypto
): Promise<boolean> {
  if (!/^[a-f0-9]{64}$/.test(expectedDigest)) return false;
  const actual = await canonicalSha256(value, cryptoApi);
  return actual === expectedDigest;
}

export function isEvaluationSnapshotCurrent(
  snapshot: EvaluationSnapshotIdentity,
  document: AuthoredDocumentIdentity,
  expectedEngineVersion?: string
): boolean {
  return (
    snapshot.documentId === document.documentId &&
    snapshot.documentRevision === document.documentRevision &&
    snapshot.semanticVersion === document.semanticVersion &&
    snapshot.unitRegistryVersion === document.unitRegistryVersion &&
    (expectedEngineVersion === undefined ||
      snapshot.engine.version === expectedEngineVersion)
  );
}
