# Khwarizmi architecture contracts

**Status:** architecture direction accepted; detailed contract set prepared for implementation and conformance review  
**Scope:** document model, worksheet geometry, mathematical semantics, evaluation, quantities/units, and calculation-host RPC.

These documents define the contracts that application/editor and calculation-host implementations must obey. They do not claim that the corresponding runtime features already exist.

## Decisions carried forward

1. AFFiNE remains the application foundation.
2. BlockSuite remains the editor and interaction foundation. The product accepts a page-oriented compromise rather than replacing BlockSuite solely to obtain a fully freeform infinite canvas.
3. Khwarizmi owns its engineering document model, worksheet geometry, mathematical AST, variable/dependency semantics, substitutions, units, evaluation policy, native document format, and A4/PDF semantics.
4. BlockSuite owns editor mechanics: text/block editing, selection, object manipulation, undo/redo, and persistence integration. It must not become the authority for calculation meaning.
5. The calculation architecture is TypeScript + Python hybrid with a separate calculation host. TypeScript is authoritative for document validation, canonical AST, symbol resolution, dependency graph, unit semantics, and evaluation orchestration. Python is an optional specialized numerical worker (e.g. SymPy/Pint); it is not a second competing interpreter.
6. Renderer and computation remain isolated. The Electron main process owns calculation-host lifecycle and the local IPC boundary.

## Documents

- [Decision record](./DECISIONS.md)
- [Document and worksheet model](./DOCUMENT-MODEL.md)
- [Expression and calculation semantics](./CALCULATION-SEMANTICS.md)
- [Calculation host and RPC v1](./RPC-V1.md)
- [Contract conformance plan](./CONFORMANCE.md)

## Normative language

The words **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, and **MAY** are normative. A requirement marked **proposed** is a concrete v1 contract proposal and must not be treated as accepted merely because it appears here. Open decisions are listed explicitly.

## Implementation order

1. Freeze document and calculation schemas.
2. Freeze RPC envelope, method schemas, errors, framing, lifecycle, and security rules.
3. Align schema validators and contract fixtures with those definitions.
4. Run cross-process conformance tests against a fake host before implementing the real host.
5. Only after contract conformance passes, begin broad worksheet editor and calculation-host implementation.

MathLive is an equation authoring/rendering integration, not the canonical semantic model. It may provide an interchange/editor surface; the persisted Khwarizmi AST remains authoritative.
