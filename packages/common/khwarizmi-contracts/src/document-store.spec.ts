import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { FileDocumentStore, verifyDocumentIntake } from './document-store.js';

const directories: string[] = [];

async function createStore() {
  const root = await mkdtemp(join(tmpdir(), 'khwarizmi-store-'));
  directories.push(root);
  return {
    root,
    store: new FileDocumentStore({
      rootDirectory: root,
      expectedEngineVersion: '0.180.0',
    }),
  };
}

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map(path =>
      rm(path, { recursive: true, force: true })
    )
  );
});

const document = {
  format: 'khwarizmi.calculation-document',
  schemaVersion: 1,
  documentId: 'doc-test',
  semanticVersion: '1.0.0',
  unitRegistryVersion: 'si-1',
  symbols: [],
  pages: [],
  calculationOrder: [],
};

const snapshot = (documentRevision: string) => ({
  documentId: 'doc-test',
  documentRevision,
  semanticVersion: '1.0.0',
  unitRegistryVersion: 'si-1',
  engine: { name: 'cortexjs-compute-engine', version: '0.180.0' },
  status: 'completed',
  results: [],
  diagnostics: [],
});

describe('durable authored-document storage', () => {
  it('round-trips authored data and derives its revision from canonical content', async () => {
    const { store } = await createStore();
    const revision = await store.saveDocument(document);
    const loaded = await store.loadDocument<typeof document>('doc-test');
    expect(loaded).toEqual({ document, documentRevision: revision });
  });

  it('rejects a tampered authored document instead of returning it', async () => {
    const { store, root } = await createStore();
    await store.saveDocument(document);
    const path = join(root, 'doc-test', 'authored-document.json');
    const envelope = JSON.parse(await readFile(path, 'utf8'));
    envelope.document.unitRegistryVersion = 'tampered';
    await writeFile(path, JSON.stringify(envelope));
    await expect(store.loadDocument('doc-test')).rejects.toThrow(
      'DOCUMENT_DIGEST_MISMATCH'
    );
  });

  it('verifies RPC intake digests before handing the document to evaluation', async () => {
    const { store } = await createStore();
    const revision = await store.saveDocument(document);
    await expect(verifyDocumentIntake(document, revision)).resolves.toMatchObject({
      document,
      documentRevision: revision,
    });
    await expect(
      verifyDocumentIntake({ ...document, documentId: 'changed' }, revision)
    ).rejects.toThrow('DOCUMENT_DIGEST_MISMATCH');
  });

  it('persists snapshots separately and detects stale document revisions', async () => {
    const { store } = await createStore();
    const revision = await store.saveDocument(document);
    const result = snapshot(revision);
    await store.saveEvaluationSnapshot('doc-test', result);
    await expect(
      store.loadEvaluationSnapshot<ReturnType<typeof snapshot>>('doc-test')
    ).resolves.toMatchObject({ status: 'current' });

    await store.saveDocument({ ...document, unitRegistryVersion: 'si-2' });
    await expect(
      store.loadEvaluationSnapshot<ReturnType<typeof snapshot>>('doc-test')
    ).resolves.toMatchObject({ status: 'stale' });
  });

  it('refuses to save a snapshot for a different authored revision', async () => {
    const { store } = await createStore();
    await store.saveDocument(document);
    await expect(
      store.saveEvaluationSnapshot('doc-test', snapshot('a'.repeat(64)))
    ).rejects.toThrow('SNAPSHOT_DOCUMENT_REVISION_MISMATCH');
  });

  it('refuses to save a snapshot with mismatched semantic identity', async () => {
    const { store } = await createStore();
    const revision = await store.saveDocument(document);
    await expect(
      store.saveEvaluationSnapshot('doc-test', {
        ...snapshot(revision),
        unitRegistryVersion: 'si-2',
      })
    ).rejects.toThrow('SNAPSHOT_SEMANTIC_IDENTITY_MISMATCH');
  });

  it('refuses to persist snapshots from an unsupported engine', async () => {
    const { store } = await createStore();
    const revision = await store.saveDocument(document);
    await expect(
      store.saveEvaluationSnapshot('doc-test', {
        ...snapshot(revision),
        engine: { name: 'untrusted-engine', version: '0.180.0' },
      })
    ).rejects.toThrow('SNAPSHOT_ENGINE_NAME_MISMATCH');
  });

  it('classifies malformed snapshot JSON as corrupt', async () => {
    const { store, root } = await createStore();
    const revision = await store.saveDocument(document);
    await store.saveEvaluationSnapshot('doc-test', snapshot(revision));
    await writeFile(
      join(root, 'doc-test', 'evaluation-snapshot.json'),
      '{invalid'
    );
    await expect(
      store.loadEvaluationSnapshot<ReturnType<typeof snapshot>>('doc-test')
    ).resolves.toEqual({
      status: 'corrupt',
      reason: 'SNAPSHOT_JSON_INVALID',
    });
  });

  it('supports explicit snapshot invalidation', async () => {
    const { store } = await createStore();
    const revision = await store.saveDocument(document);
    await store.saveEvaluationSnapshot('doc-test', snapshot(revision));
    await store.invalidateEvaluationSnapshot('doc-test');
    await expect(
      store.loadEvaluationSnapshot<ReturnType<typeof snapshot>>('doc-test')
    ).resolves.toEqual({ status: 'missing' });
  });
});
