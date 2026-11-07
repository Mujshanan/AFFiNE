import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import {
  canonicalSha256,
  canonicalizeJson,
  isEvaluationSnapshotCurrent,
  type AuthoredDocumentIdentity,
  type EvaluationSnapshotIdentity,
} from './document-integrity.js';

export interface AuthoredDocumentEnvelope<TDocument = unknown> {
  format: 'khwarizmi.authored-document';
  schemaVersion: 1;
  digest: string;
  document: TDocument;
}

export interface EvaluationSnapshotEnvelope<TSnapshot = unknown> {
  format: 'khwarizmi.evaluation-snapshot';
  schemaVersion: 1;
  digest: string;
  snapshot: TSnapshot;
}

export type SnapshotLoadResult<TSnapshot> =
  | { status: 'missing' }
  | { status: 'corrupt'; reason: string }
  | { status: 'stale'; snapshot: TSnapshot; identity: EvaluationSnapshotIdentity }
  | { status: 'current'; snapshot: TSnapshot; identity: EvaluationSnapshotIdentity };

export interface VerifiedDocumentIntake<TDocument = unknown> {
  document: TDocument;
  documentRevision: string;
}

/**
 * Verify a document received over RPC before it is passed to schema validation
 * or evaluation. The expected digest must come from the enclosing RPC request envelope.
 */
export async function verifyDocumentIntake<TDocument>(
  document: TDocument,
  expectedDigest: string
): Promise<VerifiedDocumentIntake<TDocument>> {
  if (!/^[a-f0-9]{64}$/.test(expectedDigest))
    throw new TypeError('DOCUMENT_DIGEST_INVALID');
  const actualDigest = await canonicalSha256(document);
  if (actualDigest !== expectedDigest)
    throw new Error('DOCUMENT_DIGEST_MISMATCH');
  return { document, documentRevision: actualDigest };
}

function assertDocumentId(documentId: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(documentId))
    throw new TypeError('Document ID contains unsupported path characters');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSnapshotIdentity(value: unknown): value is EvaluationSnapshotIdentity {
  if (!isRecord(value) || !isRecord(value.engine)) return false;
  return (
    typeof value.documentId === 'string' &&
    typeof value.documentRevision === 'string' &&
    /^[a-f0-9]{64}$/.test(value.documentRevision) &&
    typeof value.semanticVersion === 'string' &&
    typeof value.unitRegistryVersion === 'string' &&
    typeof value.engine.name === 'string' &&
    typeof value.engine.version === 'string' &&
    value.engine.version.length > 0
  );
}

function isKnownAuthoredDocumentIntegrityError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message === 'AUTHORED_DOCUMENT_JSON_INVALID' ||
      error.message === 'AUTHORED_DOCUMENT_ENVELOPE_INVALID' ||
      error.message === 'DOCUMENT_DIGEST_INVALID' ||
      error.message === 'DOCUMENT_DIGEST_MISMATCH')
  );
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8'));
}

/**
 * Write-then-rename keeps readers on either the previous complete file or the
 * new complete file. The temporary file is created in the destination folder
 * so the rename stays on one filesystem.
 */
async function atomicWrite(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = join(dirname(path), `.tmp-${randomUUID()}`);
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(temporaryPath, 'wx', 0o600);
    await handle.writeFile(JSON.stringify(value), 'utf8');
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporaryPath, path);
  } catch (error) {
    if (handle) await handle.close().catch(() => undefined);
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

export interface FileDocumentStoreOptions {
  rootDirectory: string;
  expectedEngineVersion?: string;
}

/**
 * Local-first durable store for authored documents and their derived snapshots.
 * Authored documents and snapshots are separate files; snapshots never mutate
 * the authored document and are only reported current when every identity
 * component matches.
 */
export class FileDocumentStore {
  private readonly root: string;

  constructor(private readonly options: FileDocumentStoreOptions) {
    if (!options.rootDirectory.trim())
      throw new TypeError('rootDirectory is required');
    this.root = resolve(options.rootDirectory);
  }

  private documentDirectory(documentId: string): string {
    assertDocumentId(documentId);
    return resolve(this.root, documentId);
  }

  private documentPath(documentId: string): string {
    return join(this.documentDirectory(documentId), 'authored-document.json');
  }

  private snapshotPath(documentId: string): string {
    return join(this.documentDirectory(documentId), 'evaluation-snapshot.json');
  }

  async saveDocument<TDocument extends { documentId: string }>(
    document: TDocument
  ): Promise<string> {
    // Capture a canonical immutable payload before the asynchronous digest operation.
    // This prevents caller mutation from making the persisted bytes disagree with
    // the digest calculated for the save.
    const persistedDocument = JSON.parse(canonicalizeJson(document)) as TDocument;
    if (
      !isRecord(persistedDocument) ||
      typeof persistedDocument.documentId !== 'string'
    )
      throw new TypeError('AUTHORED_DOCUMENT_ID_INVALID');
    const digest = await canonicalSha256(persistedDocument);
    const envelope: AuthoredDocumentEnvelope<TDocument> = {
      format: 'khwarizmi.authored-document',
      schemaVersion: 1,
      digest,
      document: persistedDocument,
    };
    await atomicWrite(this.documentPath(persistedDocument.documentId), envelope);
    return digest;
  }

  async loadDocument<TDocument = unknown>(
    documentId: string
  ): Promise<{ document: TDocument; documentRevision: string } | undefined> {
    let raw: unknown;
    try {
      raw = await readJson(this.documentPath(documentId));
    } catch (error) {
      if (isRecord(error) && error.code === 'ENOENT') return undefined;
      throw error;
    }
    if (
      !isRecord(raw) ||
      raw.format !== 'khwarizmi.authored-document' ||
      raw.schemaVersion !== 1 ||
      typeof raw.digest !== 'string' ||
      !('document' in raw) ||
      !isRecord(raw.document) ||
      raw.document.documentId !== documentId
    )
      throw new Error('AUTHORED_DOCUMENT_ENVELOPE_INVALID');
    const verified = await verifyDocumentIntake(
      raw.document as TDocument,
      raw.digest
    );
    return verified;
  }

  async saveEvaluationSnapshot<TSnapshot extends EvaluationSnapshotIdentity>(
    documentId: string,
    snapshot: TSnapshot
  ): Promise<string> {
    const persistedSnapshot = JSON.parse(
      canonicalizeJson(snapshot)
    ) as TSnapshot;
    if (!isSnapshotIdentity(persistedSnapshot))
      throw new Error('SNAPSHOT_IDENTITY_INVALID');
    if (persistedSnapshot.engine.name !== 'cortexjs-compute-engine')
      throw new Error('SNAPSHOT_ENGINE_NAME_MISMATCH');
    if (persistedSnapshot.documentId !== documentId)
      throw new Error('SNAPSHOT_DOCUMENT_ID_MISMATCH');
    const authored = await this.loadDocument<Record<string, unknown>>(documentId);
    if (!authored) throw new Error('AUTHORED_DOCUMENT_NOT_FOUND');
    if (authored.documentRevision !== persistedSnapshot.documentRevision)
      throw new Error('SNAPSHOT_DOCUMENT_REVISION_MISMATCH');
    const authoredDocument = authored.document as Record<string, unknown>;
    if (
      authoredDocument.semanticVersion !== persistedSnapshot.semanticVersion ||
      authoredDocument.unitRegistryVersion !== persistedSnapshot.unitRegistryVersion
    )
      throw new Error('SNAPSHOT_SEMANTIC_IDENTITY_MISMATCH');
    if (
      this.options.expectedEngineVersion !== undefined &&
      persistedSnapshot.engine.version !== this.options.expectedEngineVersion
    )
      throw new Error('SNAPSHOT_ENGINE_VERSION_MISMATCH');

    const digest = await canonicalSha256(persistedSnapshot);
    const envelope: EvaluationSnapshotEnvelope<TSnapshot> = {
      format: 'khwarizmi.evaluation-snapshot',
      schemaVersion: 1,
      digest,
      snapshot: persistedSnapshot,
    };
    await atomicWrite(this.snapshotPath(documentId), envelope);
    return digest;
  }

  async loadEvaluationSnapshot<TSnapshot extends EvaluationSnapshotIdentity>(
    documentId: string
  ): Promise<SnapshotLoadResult<TSnapshot>> {
    let raw: unknown;
    try {
      raw = await readJson(this.snapshotPath(documentId));
    } catch (error) {
      if (isRecord(error) && error.code === 'ENOENT') return { status: 'missing' };
      if (error instanceof SyntaxError)
        return { status: 'corrupt', reason: 'SNAPSHOT_JSON_INVALID' };
      throw error;
    }
    if (
      !isRecord(raw) ||
      raw.format !== 'khwarizmi.evaluation-snapshot' ||
      raw.schemaVersion !== 1 ||
      typeof raw.digest !== 'string' ||
      !isRecord(raw.snapshot)
    )
      return { status: 'corrupt', reason: 'SNAPSHOT_ENVELOPE_INVALID' };

    let actualDigest: string;
    try {
      actualDigest = await canonicalSha256(raw.snapshot);
    } catch {
      return { status: 'corrupt', reason: 'SNAPSHOT_CONTENT_INVALID' };
    }
    if (actualDigest !== raw.digest)
      return { status: 'corrupt', reason: 'SNAPSHOT_DIGEST_MISMATCH' };

    if (!isSnapshotIdentity(raw.snapshot))
      return { status: 'corrupt', reason: 'SNAPSHOT_IDENTITY_INVALID' };
    if (raw.snapshot.engine.name !== 'cortexjs-compute-engine')
      return { status: 'corrupt', reason: 'SNAPSHOT_ENGINE_NAME_INVALID' };
    const snapshot = raw.snapshot as TSnapshot;
    if (snapshot.documentId !== documentId)
      return { status: 'corrupt', reason: 'SNAPSHOT_DOCUMENT_ID_MISMATCH' };

    let authored: { document: Record<string, unknown>; documentRevision: string } | undefined;
    try {
      authored = await this.loadDocument<Record<string, unknown>>(documentId);
    } catch (error) {
      if (isKnownAuthoredDocumentIntegrityError(error))
        return { status: 'corrupt', reason: 'AUTHORED_DOCUMENT_INVALID' };
      throw error;
    }
    if (!authored)
      return { status: 'stale', snapshot, identity: snapshot };
    const document = authored.document;
    if (
      typeof document.semanticVersion !== 'string' ||
      typeof document.unitRegistryVersion !== 'string'
    )
      return { status: 'stale', snapshot, identity: snapshot };
    const documentIdentity: AuthoredDocumentIdentity = {
      documentId,
      documentRevision: authored.documentRevision,
      semanticVersion: document.semanticVersion,
      unitRegistryVersion: document.unitRegistryVersion,
    };
    const current = isEvaluationSnapshotCurrent(
      snapshot,
      documentIdentity,
      this.options.expectedEngineVersion
    );
    return current
      ? { status: 'current', snapshot, identity: snapshot }
      : { status: 'stale', snapshot, identity: snapshot };
  }

  async invalidateEvaluationSnapshot(documentId: string): Promise<void> {
    await rm(this.snapshotPath(documentId), { force: true });
  }
}
