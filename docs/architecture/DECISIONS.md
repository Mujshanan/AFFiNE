# Architecture decision record

## ADR-001 — Retain AFFiNE as application foundation

**Status:** Accepted

Use the AFFiNE repository as the application base. Preserve upstream architecture and provenance while adapting it incrementally. Do not start from BlockSuite alone or replace the application shell without evidence that the inherited foundation blocks a required capability.

## ADR-002 — Use BlockSuite as editor foundation

**Status:** Accepted

Use BlockSuite for editor infrastructure and interaction primitives. Accept a page-oriented worksheet model and the compromise this entails for unrestricted infinite-canvas behavior. Do not make BlockSuite's internal document schema the canonical engineering calculation schema.

## ADR-003 — Khwarizmi-owned engineering document model

**Status:** Accepted

Khwarizmi owns a versioned document schema, stable identities, page geometry, mathematical content model, calculation semantics, and export semantics. Authored content is separate from derived evaluation snapshots. The document must remain understandable and migratable without relying on transient editor runtime state.

## ADR-004 — Canonical mathematical representation

**Status:** Accepted direction; grammar details specified in CALCULATION-SEMANTICS.md

Persist a versioned Khwarizmi expression AST. MathLive/MathJSON may be used for authoring and interchange, but editor serialization is not the canonical calculation contract. No evaluation may depend on parsing a formatted display string at runtime.

## ADR-005 — Explicit, document-scoped variable semantics

**Status:** Accepted direction

Variables and assignments are explicit and document-scoped. Evaluation must not depend on hidden mutable interpreter state or accidental evaluation order. Dependencies are derived from canonical expressions and explicit references.

## ADR-006 — TypeScript-authoritative calculation core with optional Python worker

**Status:** Accepted

The application/calculation core is TypeScript. TypeScript owns schema validation, AST validation, symbol resolution, dependency analysis, units/dimensions, evaluation orchestration, deterministic result records, and error normalization. Python may provide specialized numerical services through a controlled worker interface. Python must not independently reinterpret the document, resolve names, or maintain a competing variable environment.

## ADR-007 — Separate calculation host

**Status:** Accepted

The calculation host runs separately from the renderer. Electron main owns host startup, process lifecycle, local transport connection, health checks, cancellation forwarding, and shutdown. The renderer communicates through an allowlisted preload API and must not open arbitrary pipes or spawn the host.

## ADR-008 — RPC v1 transport

**Status:** Accepted direction; detailed wire contract in RPC-V1.md

Use JSON-RPC 2.0 over a local Windows named pipe for the first desktop target. Use UTF-8 JSON messages with explicit length-prefix framing, strict message limits, request correlation, normalized errors, cancellation, and no batch requests. The host is the server endpoint; Electron main is the client and lifecycle owner.

## ADR-009 — Contract-first implementation

**Status:** Accepted

Architecture contracts and contract-conformance tests are a separate phase. Do not begin broad editor or calculation-host implementation until document, evaluation, units, RPC, and conformance requirements are reviewed and aligned.

## Open decisions requiring explicit sign-off

1. Whether the physical page coordinate system uses CSS px at a fixed reference DPI or integer micrometres as its canonical persisted unit. The document proposal uses integer micrometres for physical geometry and derives screen pixels.
2. Exact page-size preset representation and custom page dimension limits.
3. Whether v1 supports only scalar quantities or also vectors/matrices/tensors as first-class AST values.
4. Exact supported function catalog and numerical precision/tolerance policy.
5. Whether variable redefinition is prohibited in v1 or represented as explicit sequential assignment nodes. The proposal prohibits implicit redefinition and requires unique assignment IDs.
6. Exact Python worker protocol and allowed function surface; Python remains optional and outside the renderer RPC.
7. Whether the 16 MiB RPC payload ceiling is fixed or configurable. The initial transport proposal uses 16 MiB.
8. Exact named-pipe naming/ACL implementation and process identity verification details for packaged Windows releases.

Do not silently resolve these items in implementation. Record decisions in a follow-up ADR or amend this document before freezing the relevant schema.
