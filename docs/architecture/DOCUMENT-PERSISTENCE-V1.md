# Durable document persistence and snapshot lifecycle v1

**Status:** initial local-first storage adapter implementation.  
**Package:** `@khwarizmi/contracts`.  
**Scope:** authored-document durability, derived evaluation-snapshot lifecycle, and digest verification at the document-intake boundary.

## Authored documents

`FileDocumentStore` stores the canonical authored document independently of evaluation output. Each document is wrapped in a versioned envelope containing an RFC 8785 SHA-256 digest. The digest is computed over the document payload, not over its serialized envelope.

The document ID is restricted to a conservative path-safe character set before it is used as a directory name. Writes use a same-directory temporary file, flush the file handle, and rename the completed file into place. A failed write cleans up its temporary file and does not intentionally replace the previous committed file.

On load, the store validates the envelope shape, verifies that the requested ID matches the stored document ID, and recomputes the canonical digest. A digest mismatch is an integrity failure; callers must not pass the unverified document to semantic validation or evaluation.

## Evaluation snapshots

Evaluation snapshots are stored separately from authored documents. Saving a snapshot requires an existing authored document and an exact match between the snapshot's document revision and the current authored-document digest.

A loaded snapshot is classified as:

- `missing`: no snapshot exists;
- `corrupt`: the envelope, JSON payload, or digest is invalid;
- `stale`: the digest is valid but document identity, revision, semantic version, unit-registry version, or configured engine version does not match;
- `current`: the digest and all configured identity/version checks pass.

Stale snapshots are never silently treated as current. The caller may explicitly invalidate the stored snapshot. The authored document is never changed by snapshot save, load, or invalidation.

## RPC intake

The transport/host must call `verifyDocumentIntake(document, expectedDigest)` after decoding the RPC envelope and before schema validation or evaluation. The expected digest is supplied by the received envelope; the helper recomputes the canonical digest and returns the verified document revision. Invalid digest syntax and digest mismatches fail closed.

This helper is the receiver-side integrity gate; it does not itself authenticate the sender or replace transport security, schema validation, semantic validation, or Windows process/pipe authorization.

## Durability and platform boundary

This adapter provides atomic-file replacement semantics using Node's filesystem APIs and is intended for the Node/Electron host. It does not yet provide cross-process locking, multi-writer conflict resolution, a transactional BlockSuite binding, filesystem-level backup/restore, or a native Windows named-pipe host. Those remain separate integration gates and must be tested on Windows x64 and ARM64 before production release.


## Failure handling audit

The adapter now captures a canonical JSON copy before asynchronous digest calculation, so mutation of the caller-owned object cannot make the stored payload diverge from the digest for that save. Snapshot loading validates the runtime identity shape before reading nested engine fields. Malformed snapshot identity, malformed authored JSON/envelopes, authored digest failures, and missing authored semantic/unit identity are reported as corrupt rather than being mistaken for a stale evaluation.

Filesystem errors other than recognized corruption (for example, permission errors and I/O failures) continue to propagate to the host. A missing authored document makes an otherwise digest-valid snapshot stale. A changed authored revision or engine version also makes the snapshot stale; it is never returned as current.

The adapter still does not provide cross-process locking, multi-writer conflict resolution, orphan-temporary-file scavenging after power loss, directory-entry fsync guarantees, or transactional coordination with BlockSuite. Atomic rename protects readers from observing a partially written target file, but these omitted guarantees must be addressed and tested in the production host before claiming full crash durability. Concurrent writers are therefore not a supported consistency model in this version.
