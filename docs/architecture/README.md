# Khwarizmi architecture contracts

**Status:** v1 semantic and wire contracts, validators, numeric/unit codecs, evaluator foundation, and transport tests implemented; production host and editor integration remain  
**Scope:** document model, worksheet geometry, mathematical semantics, evaluation, quantities/units, and calculation-host RPC.

These documents define the contracts that application/editor and calculation-host implementations must obey. They do not claim that the corresponding runtime features already exist.

## Decisions carried forward

1. AFFiNE remains the application foundation.
2. BlockSuite remains the editor and interaction foundation. The product accepts a page-oriented compromise rather than replacing BlockSuite solely to obtain a fully freeform infinite canvas.
3. Khwarizmi owns its engineering document model, worksheet geometry, MathJSON expression records, variable/dependency semantics, substitutions, units, evaluation policy, native document format, and A4/PDF semantics.
4. BlockSuite owns editor mechanics: text/block editing, selection, object manipulation, undo/redo, and persistence integration. It must not become the authority for calculation meaning.
5. The v1 calculation architecture is a TypeScript-authoritative core in a separate calculation host. A Python worker is deferred from v1; any future worker must remain behind the TypeScript-owned contract and requires a separate ADR.
6. Renderer and computation remain isolated. The Electron main process owns calculation-host lifecycle and the local IPC boundary.

## Documents

- [Decision record](./DECISIONS.md)
- [Document and worksheet model](./DOCUMENT-MODEL.md)
- [Expression and calculation semantics](./CALCULATION-SEMANTICS.md)
- [Calculation host and RPC v1](./RPC-V1.md)
- [Contract conformance plan](./CONFORMANCE.md)
- [Versioned JSON Schemas](../../contracts/schemas/v1/)
- [Language-neutral fixtures](../../contracts/fixtures/v1/)
- [PR #3 decision-resolution document](./PR-3-DECISION-RESOLUTION.md)
- [PR #3 contract-conformance milestone](./PR-3-CONTRACT-CONFORMANCE.md)

## Normative language

The words **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, and **MAY** are normative. Accepted v1 decisions are recorded in DECISIONS.md and the linked ADRs. Remaining unchecked items are implementation/evidence gates, not owner-level product decisions.

## Implementation order

1. **Implemented:** TypeScript schema and semantic validators, fixture runner, and deterministic diagnostic tests.
2. **Implemented:** Compute Engine adapter boundary, exact numeric codec, and exact unit registry codec.
3. **Implemented:** deterministic evaluator foundation, lexical control flow, canonical digest utilities, and RPC framing/cancellation-registry tests.
4. **Implemented:** dedicated CI coverage for the contract suite.
5. **Remaining:** evaluator-level unit arithmetic, durable persistence/snapshot lifecycle, RPC dispatcher and process security, and BlockSuite adapter conformance.
6. Broad worksheet UI follows the host/editor integration gates; it must not bypass the canonical Khwarizmi document model.

MathLive is the authoring/rendering surface. MathJSON is the canonical expression tree consumed by CortexJS Compute Engine. Khwarizmi wraps it with stable symbol bindings, authored numeric lexemes, source maps, assignment history, and semantic metadata. The wrapper—not raw engine state—is the persisted contract.
