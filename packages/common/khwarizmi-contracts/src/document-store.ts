import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import {
  canonicalSha256,
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
    const digest = await canonicalSha256(document);
    const envelope: AuthoredDocumentEnvelope<TDocument> = {
      format: 'khwarizmi.authored-document',
      schemaVersion: 1,
      digest,
      document,
    };
    await atomicWrite(this.documentPath(document.documentId), envelope);
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
    if (snapshot.documentId !== documentId)
      throw new Error('SNAPSHOT_DOCUMENT_ID_MISMATCH');
    const authored = await this.loadDocument<Record<string, unknown>>(documentId);
    if (!authored) throw new Error('AUTHORED_DOCUMENT_NOT_FOUND');
    if (authored.documentRevision !== snapshot.documentRevision)
      throw new Error('SNAPSHOT_DOCUMENT_REVISION_MISMATCH');

    const digest = await canonicalSha256(snapshot);
    const envelope: EvaluationSnapshotEnvelope<TSnapshot> = {
      format: 'khwarizmi.evaluation-snapshot',
      schemaVersion: 1,
      digest,
      snapshot,
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

    const snapshot = raw.snapshot as TSnapshot;
    if (snapshot.documentId !== documentId)
      return { status: 'corrupt', reason: 'SNAPSHOT_DOCUMENT_ID_MISMATCH' };

    const authored = await this.loadDocument<Record<string, unknown>>(documentId);
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
