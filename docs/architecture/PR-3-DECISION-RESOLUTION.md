# PR #3 — Architecture decision resolution

**Status:** All owner-level v1 decisions A1–A9 are resolved. Team-level contract choices T1–T6 are selected below. These decisions authorize contract implementation; they do not claim schemas, fixtures, validators, or conformance tests already exist.  
**Purpose:** Record the normative decisions and implementation contract needed to close audit findings F1–F11.

## 1. Decision ownership

This document distinguishes two classes:

- **Owner approval required:** decisions affecting product behavior, persisted document compatibility, calculation meaning, or the security model. Recommendations below are proposals until explicitly approved.
- **Implementation-team decision:** engineering details the team may settle within the approved boundaries. Record them in schemas, tests, or implementation notes.
- **Deferred:** capability excluded from v1. The contract must reject it with a stable diagnostic rather than silently approximate it.

Do not mark a schema stable while an approval-required decision affecting it remains unresolved.

## 2. Owner decisions — resolved

### A1 — Canonical page geometry and page sizes (F6)

**Accepted decision:** Use integer micrometres as the canonical persisted unit for page dimensions, margins, and region coordinates. Use a top-left page-local origin; positive x points right and positive y points down. Convert to CSS pixels only at the rendering boundary.

Proposed v1 model:

- Positive integer width and height, plus integer margins and region geometry.
- A small stable set of named page presets and support for custom dimensions.
- Orientation is derived from dimensions or validated against them; contradictory values are invalid.
- Zoom, pan, device-pixel ratio, and screen coordinates are view state, not document geometry.

**Resolved:** integer micrometres; standard named presets and custom dimensions. The team defines preset identifiers and validated custom-size bounds.

**Team may decide after approval:** preset identifiers, property names, numeric bounds, conversion constants, and validation algorithms.

### A2 — v1 value shape: scalar-only or structured values (F2/F5)

**Accepted decision:** Scalar quantities only in v1. Defer vectors, matrices, tensors, and array broadcasting to a later contract version.

**Resolved:** scalar-only v1. Reject structured value constructs with a stable diagnostic such as `UNSUPPORTED_VALUE_KIND`.

If scalar-only is approved, reserved vector/matrix constructs must be rejected with a stable code such as UNSUPPORTED_VALUE_KIND, not treated as executable values.

**Team may decide:** internal scalar types, schema composition, and test harness structure.

### A3 — Numeric literal and evaluation policy (F2)

**Recommendation:**

- Preserve authored decimal literals exactly as decimal strings in the canonical AST.
- Represent rational literals explicitly with numerator and denominator, not ambiguous strings.
- Do not serialize approximate binary floating-point values as ordinary JSON numbers where exact round-trip matters.
- If binary floating point is used for numerical function results, tag the representation and record precision metadata.
- Display rounding must never feed back into calculation inputs.

**Accepted decision:** Preserve authored decimals exactly; represent rational literals explicitly; permit approximate numerical results only with a representation tag and precision metadata. Display rounding never feeds back into calculations.

**Team may decide:** parsing library, internal numeric type, serialization helpers, metadata field names, and deterministic formatting.

No universal engineering tolerance is proposed. Tolerances must be explicit per operation or domain-specific validation rule.

### A4 — Variable identity, reassignment, and block-local scope (F3)

<badge color="success">Owner decision resolved</badge>

**Accepted decision:** Khwarizmi v1 supports sequential reassignment of document-level variables. A variable has a stable identity; each assignment to it is a separately tracked event/version owned by the calculation engine. Evaluation is ordered: each expression reads the latest preceding assignment that is visible in its scope.

**Document-level namespace**

- One shared document-level namespace applies across all pages and sections.
- A document-level variable keeps the same identity when reassigned.
- Each assignment records its source location/order, authored expression, evaluated value, dependencies, and evaluation status.
- A later assignment changes the value visible to subsequent expressions; it does not rewrite the historical result of earlier evaluations.
- Duplicate document-level variable declarations are naming conflicts, not separate variables with the same name.

**Local variables and control-flow blocks**

- Local variables are supported inside `if` and `while` blocks.
- Use lexical block scope, including access to permitted enclosing local scopes from nested blocks.
- Local variables may be reassigned within their scope.
- A local variable must not shadow a document-level variable or another visible local variable; reject such conflicts in v1.
- A local variable declared in a block is not visible outside that block.
- The engine records conditional branch selection, loop iteration order, and every assignment/evaluation performed within executed blocks.

**Required semantic invariants**

- Variable identity is distinct from assignment identity/version.
- References resolve to a statically determined variable identity and then to the latest preceding visible assignment at evaluation time.
- Reassignment invalidates/recomputes affected subsequent evaluations while retaining prior evaluation history.
- Each evaluation snapshot identifies the assignment versions and control-flow path used to produce it.
- Loop execution must have defined iteration and termination semantics; execution/resource limits must prevent unbounded evaluation.
- Cycles in the dependency graph outside explicit control-flow semantics are errors; ordinary sequential reassignment is not treated as a dependency cycle.

**Team may decide:** symbol and assignment ID formats, name normalization, precise source-order rules, nested-scope representation, dependency/invalidation algorithms, loop execution limits, history storage, and diagnostic ordering, provided these decisions preserve the accepted behavior above.

### A5 — Expression grammar and initial function surface (F4)

**Accepted direction with amendment:** Keep the arithmetic expression grammar deliberately small: numeric literals, symbol references, unary plus/minus, addition, subtraction, multiplication, division, power, explicit grouping, allowlisted function calls, and explicit unit attachment. Permit implicit multiplication only where parsing is unambiguous, then normalize it to explicit multiplication in the canonical AST. Reject ambiguous expressions with a stable diagnostic; never guess.

The language must also represent the already-required `if` and `while` control-flow blocks, including their conditions and block bodies, because A4 accepts local variables and tracked assignments inside those blocks. Their condition grammar, execution order, nesting, and termination/resource rules must be specified and tested as part of the v1 language contract. This is a deliberate amendment to the earlier proposal to exclude conditionals.

Do not derive executable meaning from LaTeX, editor strings, or display formatting. Unsupported syntax must not be silently rewritten.

**Owner-approved boundary:** proposed arithmetic grammar, with unambiguous implicit multiplication normalized to explicit multiplication; `if` and `while` are included as required control-flow constructs. Vectors/matrices and user-defined functions remain outside the accepted v1 scope unless separately approved.

**Team may decide:** precedence and associativity table, grammar notation, parser implementation, exact comparison/boolean operators needed by conditions, function identifiers, arity rules, block syntax, and stable unsupported-syntax codes.

### A6 — Unit semantics and registry (F5)

**Accepted decision:** Khwarizmi TypeScript Core owns a versioned built-in unit registry. External libraries such as Pint may assist implementation but are not normative authorities.

Proposed v1 boundaries:

- Scalar quantities with explicit units and normalized dimensions.
- Canonical dimension vectors with rational exponents.
- Addition/subtraction require compatible dimensions; multiplication/division combine dimensions.
- Powers follow explicitly supported exponent rules.
- Angles are an explicit dimension; radians are canonical and degrees convert to radians.
- Defer absolute-temperature and temperature-difference arithmetic unless complete affine-unit rules are specified and tested.
- Defer user-defined units and user-defined unit systems.
- Unknown units, unsupported prefixes, and incompatible dimensions are errors.

**Accepted decision:** Use the versioned built-in registry and dimensional analysis. Angles are explicit, with radians canonical and degrees convertible. Defer temperature arithmetic and custom units from v1.

**Team may decide:** registry provenance, supported units and aliases, prefix table, canonical base units, conversion algorithms, dimension schema, and registry version metadata.

### A7 — RPC payload ceiling and behavior policy (F9/F10)

**Accepted decision:** Fixed 16 MiB maximum payload per frame for RPC v1. The limit is not configurable or negotiated.

**Resolved:** fixed 16 MiB per frame.

Proposed behavior: bounded request timeout and concurrency; reject duplicate in-flight request IDs; cancellation is best-effort and idempotent; unknown/completed cancellation is ignored; no partial result is represented as a completed snapshot; malformed notifications receive no response in accordance with JSON-RPC notification semantics.

**Team may decide:** exact timeout values, concurrency count, memory budget, and implementation mechanics, provided limits are explicit and tested.

### A8 — Windows named-pipe trust boundary (F10)

**Accepted decision:** Treat named pipes as a local IPC boundary, not as proof of process identity. A same-user DACL alone does not prove that the connecting process is the intended Khwarizmi host.

Proposed security properties:

- Electron main creates or securely controls the pipe instance.
- Per-instance unpredictable pipe name; restrictive DACL; reject remote clients.
- Verify launched process identity/ownership before trusting the connection.
- Bind readiness to a per-launch capability or equivalent unguessable value delivered through a protected channel.
- Never expose that capability to renderer code or logs.
- Define behavior for pipe squatting, stale endpoints, reconnect, and unexpected host exit.

**Resolved:** require process identity/ownership verification and a per-launch capability/handshake in addition to ACLs.

**Team may decide:** Windows API calls, ACL entries, capability provisioning, process-handle verification, handshake fields, and Windows test harness. Framing tests alone do not establish named-pipe security.

### A9 — Python worker scope (PR #2 open decision 6; F11)

**Accepted deferral:** Exclude the Python worker protocol, runtime dependency, and numerical operation catalog from v1. TypeScript remains the complete authoritative calculation core. A future worker requires a separate ADR.

**Resolved:** Python worker deferred from v1.

**Team may decide later under a separate ADR:** worker transport, lifecycle, allowlisted operations, resource limits, serialization, and crash/retry behavior.

## 3. Implementation-team decisions

The following can be settled by the team without owner approval, provided the invariants below are met and choices are recorded.

### T1 — Document revision identity (F1)

**Selected:** SHA-256 over RFC 8785 JCS bytes of the canonical authored document payload is the content revision identity. A monotonic local revision number may serve UI/history but is not the content identity. Timestamps are not revision identities.

The digest excludes derived evaluation snapshots and view-only state. Evaluation snapshots identify documentId, content revision, document schema version, AST/semantic contract version, calculation engine version, and unit registry version. Any change to calculation inputs, AST, symbol definitions, unit attachments, or semantic contract invalidates affected snapshots. Pure view changes do not.

### T2 — Schema compatibility and extensions (F8)

Define explicit compatibility rules:

- format identifies the Khwarizmi document format.
- schemaVersion is a major integer core-contract version.
- Unknown major versions are rejected.
- Unknown core properties are rejected in strict validation.
- Namespaced extensions are preserved through safe read/write round trips.
- Block contentVersion is independent only if a real independent migration boundary is needed; otherwise omit it in v1.
- Migrations are deterministic and preserve stable IDs and authored values.

**Selected:** JSON Schema 2020-12; strict validation rejects unknown major versions and unknown core properties; unknown namespaced extensions are preserved through safe round trips. Migrations are deterministic and preserve stable IDs and authored values. Schema IDs and migration code organization remain implementation details.

### T3 — Block and asset contracts (F7)

Every v1 block kind needs an explicit content schema; avoid arbitrary untyped content objects.

Define asset identity/hash, media type, byte length, embedded versus external reference rules, per-asset and aggregate limits, and missing/hash-mismatch behavior. External references must not trigger arbitrary network fetching during document validation or calculation.

**Selected:** V1 assets are embedded and content-addressed by SHA-256. External/network asset fetching is not part of validation or evaluation. Maximum 4 MiB per asset and 8 MiB aggregate raw embedded assets per document. The complete canonical JSON document, including base64 asset encoding, MUST remain within the fixed 16 MiB RPC frame limit. Exceeding either limit is a stable validation error. Schema field names remain implementation details.

### T4 — Layout grammar and validation (F6)

**Selected:** V1 supports flow, grid, column, and positioned regions, with positioned layout as the unrestricted/free-placement mode. Every block belongs to exactly one region. Region and block ordering are explicit. Positioned overlaps are allowed only with explicit z-order; non-positioned regions reject overlapping/out-of-bounds children. No implicit overflow or clipping. Grid tracks/gaps and column behavior must have explicit schema fields and deterministic validation diagnostics. Layout position never defines calculation execution order.

### T5 — RPC envelope, digest, and errors (F9/F10)

**Selected:** Every document-bearing RPC method includes the SHA-256 JCS digest of the canonical authored document payload; the receiver recomputes it. The digest excludes the transport envelope, request ID, and derived result and is not authentication. Use the standard JSON-RPC error codes for protocol errors and a reserved stable Khwarizmi range for domain errors; structured error data carries location and details. Use strict UTF-8 decoding and little-endian four-byte length-prefix framing. Defaults are 30 seconds for validation, 120 seconds for evaluation, and eight concurrent requests per host instance.

### T6 — Conformance tiers (F11)

Report four separate levels:

1. Schema conformance.
2. TypeScript semantic conformance.
3. Independent interoperability using a second implementation and the same language-neutral fixtures.
4. Windows transport/security conformance, including ACLs, process identity, and lifecycle.

**Selected:** PR #3 must deliver levels 1 and 2. Level 3 is deferred to a later interoperability milestone because no second implementation is currently in scope. Level 4 is a separate Windows-specific verification track; it must not be claimed from fake-host or framing-only tests. PR #1 package smoke tests are not substitutes for named-pipe security tests.

## 4. F1–F11 traceability

| Finding                     | Resolution   | Owner        | Required evidence                                                                                                     |
| --------------------------- | ------------ | ------------ | --------------------------------------------------------------------------------------------------------------------- |
| F1 Revision identity        | T1           | Team         | Revision and snapshot invalidation fixtures                                                                           |
| F2 Numeric representation   | A3           | Owner + team | Decimal, rational, and approximation fixtures                                                                         |
| F3 Variable semantics       | A4           | Owner + team | Sequential reassignment, stable identity, lexical local scope, shadowing rejection, control-flow and history fixtures |
| F4 Expression grammar       | A5           | Owner + team | Precedence and unsupported syntax fixtures                                                                            |
| F5 Unit semantics           | A6           | Owner + team | Dimension, conversion, angle, and unsupported-unit fixtures                                                           |
| F6 Geometry/layout          | A1 + T4      | Owner + team | Geometry/layout schemas and fixtures                                                                                  |
| F7 Blocks/assets            | T3           | Team         | Block schemas and asset boundary fixtures                                                                             |
| F8 Versioning/extensions    | T2           | Team         | Unknown-version, extension, and migration fixtures                                                                    |
| F9 Cancellation/concurrency | A7 + T5      | Owner + team | Duplicate ID, timeout, cancellation race, notification fixtures                                                       |
| F10 Integrity/security      | A7 + A8 + T5 | Owner + team | Digest tests; Windows security tests separately                                                                       |
| F11 Conformance scope       | A9 + T6      | Owner + team | Tiered CI and explicit deferral status                                                                                |

## 5. ADR alignment

PR #2's `docs/architecture/DECISIONS.md` now records ADR-010 through ADR-018 as Accepted or Deferred and aligns the document, calculation, and RPC proposals with these resolutions. The focused ADR records are the normative owner-decision source; this PR #3 document captures the detailed F1–F11 resolution and selected team-level implementation contract.

## 6. PR #3 implementation gates

Do not mark a schema stable until:

- every approval-required decision affecting it is accepted or explicitly deferred;
- deferred constructs have stable rejection codes;
- implementation-team choices are recorded;
- valid and invalid language-neutral fixtures exist;
- TypeScript tests consume those fixtures;
- expected results are reviewed independently of the implementation under test.

Do not implement the production calculation host, Python worker, or new worksheet UI as part of this decision-resolution task.

## 7. Owner review checklist

- [x] A1 Page geometry: integer micrometres, top-left origin, standard and custom sizes.
- [x] A2 Scalar-only v1; vectors/matrices deferred.
- [x] A3 Exact decimal/rational authored values and tagged approximate results.
- [x] A4 Document namespace, sequential reassignment, tracked assignment history, lexical block-local variables, and no-shadowing rule.
- [x] A5 Arithmetic grammar and unambiguous implicit multiplication approved with amendment; if/while control-flow constructs included. Team must specify and test condition grammar and execution limits.
- [x] A6 Versioned built-in unit registry and dimensional analysis; temperature arithmetic and custom units deferred.
- [x] A7 Fixed 16 MiB RPC payload limit.
- [x] A8 Process verification plus per-launch capability for Windows IPC.
- [x] A9 Python worker deferred from v1.
- [x] T1–T6 implementation choices selected and recorded.
- [x] ADR-010 through ADR-018 aligned in PR #2.
- [ ] Schemas, fixtures, validators, conformance tests, and CI implementation completed (next implementation milestone).
