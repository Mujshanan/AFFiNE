# Khwarizmi architecture contracts

**Status:** Compute Engine adapter contracts and initial schemas/fixtures in progress  
**Scope:** document model, worksheet geometry, mathematical semantics, evaluation, quantities/units, and calculation-host RPC.

These documents define the contracts that application/editor and calculation-host implementations must obey. They do not claim that the corresponding runtime features already exist.

## Decisions carried forward

1. AFFiNE remains the application foundation.
2. BlockSuite remains the editor and interaction foundation. The product accepts a page-oriented compromise rather than replacing BlockSuite solely to obtain a fully freeform infinite canvas.
3. Khwarizmi owns its engineering document model, worksheet geometry, mathematical AST, variable/dependency semantics, substitutions, units, evaluation policy, native document format, and A4/PDF semantics.
4. BlockSuite owns editor mechanics: text/block editing, selection, object manipulation, undo/redo, and persistence integration. It must not become the authority for calculation meaning.
5. The v1 calculation architecture is a TypeScript-authoritative core in a separate calculation host. A Python worker is deferred from v1; any future worker must remain behind the TypeScript-owned contract and requires a separate ADR.
6. Renderer and computation remain isolated. The Electron main process owns calculation-host lifecycle and the local IPC boundary.

## Documents

- [Decision record](./DECISIONS.md)
- [Document and worksheet model](./DOCUMENT-MODEL.md)
- [Expression and calculation semantics](./CALCULATION-SEMANTICS.md)
- [Calculation host and RPC v1](./RPC-V1.md)
- [Contract conformance plan](./CONFORMANCE.md)
- [PR #3 decision-resolution document](./PR-3-DECISION-RESOLUTION.md)
- [PR #3 contract-conformance milestone](./PR-3-CONTRACT-CONFORMANCE.md)

## Normative language

The words **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, and **MAY** are normative. Accepted v1 decisions are recorded in DECISIONS.md and the linked ADRs. Remaining unchecked items are implementation/evidence gates, not owner-level product decisions.

## Implementation order

1. Publish versioned document, expression, evaluation, diagnostic, and RPC schemas from the accepted ADRs.
2. Add language-neutral valid/invalid fixtures and stable diagnostic codes.
3. Implement TypeScript validators and deterministic semantic/unit tests.
4. Test RPC framing and fake-host behavior independently of Electron.
5. Add CI coverage for the contract suite.
6. Only after contract conformance passes, begin broad worksheet UI and production calculation-host implementation.

MathLive is the authoring/rendering surface. MathJSON is the canonical expression tree consumed by CortexJS Compute Engine. Khwarizmi wraps it with stable symbol bindings, authored numeric lexemes, source maps, assignment history, and semantic metadata. The wrapper—not raw engine state—is the persisted contract.
