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

**Status:** Accepted; MathJSON/Compute Engine mapping selected

Use versioned MathJSON as the canonical expression tree because CortexJS Compute Engine evaluates it natively. Persist it inside a Khwarizmi expression record adding stable symbol bindings, authored numeric lexemes/representation tags, source locations, and contract versioning. MathLive LaTeX/DOM is authoring/display data, never executable authority. Engine-safe symbol tokens are deterministic aliases mapped to stable Khwarizmi `symbolId`; display names are never identity. Khwarizmi—not Compute Engine—owns assignment order/history, dependency tracking, units policy, result provenance, and substitution presentation. No evaluation may parse a formatted display string at runtime.

## ADR-005 — Explicit, document-scoped variable semantics

**Status:** Accepted

Variables and assignments are explicit and document-scoped. V1 permits sequential reassignment of the same variable identity; each assignment creates a tracked immutable assignment version, and reads resolve to the latest preceding assignment in explicit calculation order. Evaluation must not depend on hidden mutable interpreter state or accidental visual/page order. Dependencies are recorded against the exact assignment versions consumed. Local variables in `if`/`while` use lexical block scope and cannot shadow visible names in v1; see ADR-012.

## ADR-006 — TypeScript-authoritative calculation core

**Status:** Accepted

The application/calculation core is TypeScript. TypeScript owns schema validation, AST validation, symbol resolution, dependency analysis, units/dimensions, evaluation orchestration, deterministic result records, and error normalization. A Python worker is deferred from v1 by ADR-017. If introduced in a future version, it may provide specialized numerical services only through a controlled TypeScript-owned worker interface; it must not independently reinterpret the document, resolve names, or maintain a competing variable environment.

## ADR-007 — Separate calculation host

**Status:** Accepted

The calculation host runs separately from the renderer. Electron main owns host startup, process lifecycle, local transport connection, health checks, cancellation forwarding, and shutdown. The renderer communicates through an allowlisted preload API and must not open arbitrary pipes or spawn the host.

## ADR-008 — RPC v1 transport

**Status:** Accepted

Use JSON-RPC 2.0 over a local Windows named pipe for the first desktop target. Use UTF-8 JSON messages with a four-byte unsigned little-endian length prefix and a fixed 16 MiB maximum payload, strict message limits, request correlation, normalized errors, cancellation, and no batch requests. The host is the server endpoint; Electron main is the client and lifecycle owner. The Windows trust boundary additionally requires spawned-process identity verification and a protected per-launch capability/handshake as recorded in ADR-016.

## ADR-009 — Contract-first implementation

**Status:** Accepted

Architecture contracts and contract-conformance tests are a separate phase. Do not begin broad editor or calculation-host implementation until document, evaluation, units, RPC, and conformance requirements are reviewed and aligned.

## Resolved v1 decisions

The following decisions are accepted and normative for v1. Implementation details remain subject to the constraints recorded in the focused ADRs.

### ADR-010 — Canonical page geometry and page sizes

**Status:** Accepted

Persist page dimensions, margins, and region coordinates as positive integer micrometres. Use a page-local top-left origin with +X right and +Y down. Support stable standard page presets and custom dimensions. Orientation is derived from dimensions; contradictory orientation metadata is invalid. Zoom, pan, device-pixel ratio, and screen coordinates are view state only.

The implementation team defines preset IDs, custom-size bounds, field names, and conversion constants. Geometry validation must reject non-integer, non-finite, negative, zero-sized, and out-of-bounds values where prohibited.

### ADR-011 — v1 value shape and numeric representation

**Status:** Accepted

V1 calculation values are scalar quantities only. Vectors, matrices, tensors, and array broadcasting are deferred and rejected with stable diagnostics such as `UNSUPPORTED_VALUE_KIND`.

Authored decimal literals retain exact decimal representation. Rational literals have an explicit numerator/denominator representation. Approximate numerical results are permitted only with an explicit representation tag and precision metadata. Display rounding never feeds back into calculation inputs. No universal engineering tolerance is implied.

### ADR-012 — Variable identity, reassignment, and lexical scope

**Status:** Accepted

A document has one shared document-level variable namespace across pages and sections. Variables may be reassigned sequentially while retaining stable variable identity. Each assignment is a distinct immutable assignment event/version tracked by the calculation engine.

The calculation engine resolves each read to the latest preceding assignment in the applicable scope. Execution order is explicit calculation order, independent of visual page coordinates or region placement. Recalculation creates new evaluation results for the new document revision; it does not overwrite prior revision history.

`if` and `while` blocks support lexical local variables and local reassignment. Nested blocks may access visible enclosing locals. A local may not shadow a document-level variable or another visible local in v1. Local variables are not visible outside their defining block. Branch choices, loop iterations, assignments, dependencies, and evaluated values are recorded.

### ADR-013 — Expression grammar and control flow

**Status:** Accepted

V1 supports numeric literals, symbol references, unary plus/minus, arithmetic operators, explicit grouping, allowlisted built-in function calls, unit attachment, comparisons, boolean conditions, and `if`/`while` control-flow blocks.

Implicit multiplication is accepted only when unambiguous. The parser normalizes it to explicit multiplication in the canonical AST; ambiguous forms are rejected rather than guessed. Vectors/matrices and user-defined functions are outside v1.

The team must publish a precedence/associativity table, condition grammar, block syntax, and stable unsupported-syntax diagnostics before schemas are frozen.

### ADR-014 — Unit registry and dimensional semantics

**Status:** Accepted

TypeScript Khwarizmi Core owns a versioned built-in unit registry and dimensional analysis. V1 supports scalar quantities, compatible-unit conversion, and rational dimension exponents. Angle is an explicit dimension; radians are canonical and degrees convert to radians. Trigonometric functions require angle-compatible input.

Absolute-temperature and temperature-difference arithmetic, custom units, and user-defined unit systems are deferred from v1. Unknown units, unsupported prefixes, and incompatible dimensions are errors.

### ADR-015 — RPC framing, payload ceiling, and request policy

**Status:** Accepted

RPC v1 uses JSON-RPC 2.0 over UTF-8 frames with a four-byte unsigned little-endian length prefix. The maximum payload is a fixed 16 MiB per frame; it is not negotiated. Zero-length, oversized, truncated, malformed UTF-8, invalid JSON, and batch frames are rejected.

Cancellation is best-effort and idempotent. Duplicate in-flight request IDs are rejected. A cancelled request cannot publish a completed snapshot. Document-bearing RPC calls carry a SHA-256 digest over RFC 8785 JCS canonical bytes of the authored document payload; the receiver recomputes it. The digest is integrity/cache metadata, not authentication.

Implementation policy defaults: 30 seconds for validation, 120 seconds for evaluation, and at most eight concurrent requests per host instance. These are host safeguards, not promises that every evaluation will finish within those durations; clients may cancel earlier. Any change requires updated contract fixtures and compatibility review.

### ADR-016 — Windows named-pipe trust boundary

**Status:** Accepted

A same-user DACL alone is insufficient to establish host identity. Electron main must verify the spawned host process identity/ownership and bind readiness to a per-launch unguessable capability delivered through a protected channel. The pipe uses an unpredictable per-instance name, restrictive ACL, and remote-client rejection. The capability must never reach renderer code or logs.

Windows API details and exact ACL construction remain implementation choices, but process verification and per-launch capability are normative requirements. Platform-independent framing tests do not count as Windows security conformance.

### ADR-017 — Python worker deferral

**Status:** Deferred from v1

No Python worker protocol, runtime dependency, or numerical operation catalog is part of the v1 public contract or required v1 implementation. TypeScript remains authoritative for parsing, symbol resolution, dependency tracking, units, evaluation orchestration, and result records. A future Python worker may only be introduced behind the TypeScript host under a separate accepted ADR.

### ADR-018 — Revision identity and compatibility rules

**Status:** Accepted

The canonical authored document revision identity is SHA-256 over RFC 8785 JCS bytes, excluding derived evaluation snapshots and view-only state. Evaluation snapshots identify document, schema, semantic, engine, and unit-registry versions.

Use JSON Schema 2020-12 for v1 schemas. Reject unknown major schema versions and unknown core properties in strict validation. Preserve unknown namespaced extensions through safe round trips. Migrations are deterministic and preserve stable IDs and authored values.

## Remaining implementation-team work

The owner-level product decisions above are resolved. Before schemas are declared stable, the team must still specify and test:
- Stable ID formats and normalization/diagnostic ordering.
- Exact JSON Schema structures and stable diagnostic-code registry.
- Document/block/asset schemas and migration fixtures.
- Layout-region grammar, ownership, overlap, bounds, and overflow behavior.
- Asset policy and limits; no arbitrary network fetch during validation/evaluation.
- Full expression precedence, associativity, condition grammar, block syntax, and loop resource limits.
- RPC method schemas, capability negotiation, error ranges, timeout/cancellation race behavior, and concurrency enforcement.
- Executable fixtures, validators, conformance tests, and CI coverage.

These are implementation deliverables, not unresolved owner approvals. Do not mark a schema stable until the corresponding evidence exists.
