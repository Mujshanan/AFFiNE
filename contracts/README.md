# Khwarizmi contracts

This directory contains the language-neutral v1 calculation and RPC contracts. The contract set is normative for the Khwarizmi calculation core and the separate TypeScript calculation host. It does not imply that the editor, evaluator adapter, host process, or transport implementation is already complete.

## Source of truth

- `schemas/v1/`: JSON Schema 2020-12 wire and semantic data shapes.
- `schemas/v1/mathjson-profile.schema.json`: closed scalar MathJSON profile accepted by Khwarizmi v1.
- `schemas/v1/diagnostic-codes.json`: stable diagnostic-code registry.
- `schemas/v1/unit-registry.v1.json`: immutable built-in engineering unit and prefix registry.
- `fixtures/v1/manifest.json`: authoritative fixture inventory.
- `fixtures/v1/manifest.schema.json`: fixture-manifest schema.

The accompanying normative behavior is documented in `docs/architecture/CALCULATION-SEMANTICS.md` and `docs/architecture/RPC-V1.md`.

## Validation order

A conforming implementation MUST:

1. Validate the calculation-document or expression-record JSON Schema.
2. Validate the restricted MathJSON profile, exact numeric metadata, symbol bindings, and source-map paths.
3. Validate stable IDs, normalized document names, complete calculation order, declaration visibility, and no-shadowing.
4. Resolve reads to the latest preceding successful assignment event and record exact event/version dependencies.
5. Validate unit IDs/prefixes and dimensional rules before invoking the mathematical evaluator.
6. Evaluate through an isolated Compute Engine context with exact values and unit metadata prepared by Khwarizmi.
7. Emit normalized Khwarizmi result records, substitution trees, provenance, and ordered diagnostics.
8. Verify RPC document digests using RFC 8785 JCS before validation/evaluation.

JSON Schema validation alone is not semantic conformance. Semantic rules that require document-wide or execution-order knowledge are intentionally specified in the architecture contract.

## Fixture contract

Each manifest entry has a unique ID, kind, relative path, validation/evaluation stage, expected outcome, and optional diagnostic code. Fixture paths are relative to `fixtures/v1/`. A fixture runner MUST reject duplicate IDs, missing paths, unsupported stages, and unregistered diagnostic codes. Expected outputs are authored independently of the implementation under test.

## Versioning

Document schema, expression-record schema, semantic contract, unit registry, engine package, and RPC protocol versions are independent. A change in worksheet meaning requires a semantic-version change even if the JSON shape is unchanged. Unknown major versions are rejected. Do not persist raw Compute Engine class instances or rely on editor LaTeX as executable authority.

## Current implementation boundary

The schemas, semantic rules, registry, and language-neutral seed fixtures are defined. The TypeScript package at `packages/common/khwarizmi-contracts` now includes schema/semantic validation, deterministic evaluation, RFC 8785 document digests, RPC framing/dispatch, and an initial local-first file store for authored documents and derived evaluation snapshots. The file store verifies document and snapshot digests, rejects snapshot writes against a different authored revision, and classifies stale snapshots against the persisted document and configured engine version. RPC hosts must invoke the receiver-side digest gate before schema validation/evaluation. The schema interpreter intentionally supports the exact vocabulary used by this bundle and fails closed on new keywords; it is not a general-purpose JSON Schema implementation. Production Electron/native process integration, cross-process locking and conflict resolution, Windows pipe security, and BlockSuite transaction/save-reload integration remain separate release gates. No broad worksheet UI should begin until the conformance and host-integration exit criteria are met.
