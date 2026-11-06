# PR #3 — Architecture decision resolution

**Status:** Proposed; approval-gated decisions are not accepted by publication of this document.  
**Purpose:** Resolve audit findings F1–F11 before schemas are marked stable.

## 1. Decision ownership

This document distinguishes two classes:

- **Owner approval required:** decisions affecting product behavior, persisted document compatibility, calculation meaning, or the security model. Recommendations below are proposals until explicitly approved.
- **Implementation-team decision:** engineering details the team may settle within the approved boundaries. Record them in schemas, tests, or implementation notes.
- **Deferred:** capability excluded from v1. The contract must reject it with a stable diagnostic rather than silently approximate it.

Do not mark a schema stable while an approval-required decision affecting it remains unresolved.

## 2. Decisions requiring owner approval

### A1 — Canonical page geometry and page sizes (F6)

**Recommendation:** Use integer micrometres as the canonical persisted unit for page dimensions, margins, and region coordinates. Use a top-left page-local origin; positive x points right and positive y points down. Convert to CSS pixels only at the rendering boundary.

Proposed v1 model:
- Positive integer width and height, plus integer margins and region geometry.
- A small stable set of named page presets and support for custom dimensions.
- Orientation is derived from dimensions or validated against them; contradictory values are invalid.
- Zoom, pan, device-pixel ratio, and screen coordinates are view state, not document geometry.

**Approval needed:** micrometres versus CSS pixels at a fixed DPI; named presets plus custom dimensions; whether custom sizes have documented minimum/maximum bounds.

**Team may decide after approval:** preset identifiers, property names, numeric bounds, conversion constants, and validation algorithms.

### A2 — v1 value shape: scalar-only or structured values (F2/F5)

**Recommendation:** Scalar quantities only in v1. Defer vectors, matrices, tensors, and array broadcasting to a later contract version.

**Approval needed:** scalar-only v1 versus including any structured value types now.

If scalar-only is approved, reserved vector/matrix constructs must be rejected with a stable code such as UNSUPPORTED_VALUE_KIND, not treated as executable values.

**Team may decide:** internal scalar types, schema composition, and test harness structure.

### A3 — Numeric literal and evaluation policy (F2)

**Recommendation:**
- Preserve authored decimal literals exactly as decimal strings in the canonical AST.
- Represent rational literals explicitly with numerator and denominator, not ambiguous strings.
- Do not serialize approximate binary floating-point values as ordinary JSON numbers where exact round-trip matters.
- If binary floating point is used for numerical function results, tag the representation and record precision metadata.
- Display rounding must never feed back into calculation inputs.

**Approval needed:** exact decimal as the authored canonical representation; rational literals in v1; tagged floating-point results; whether approximate results are permitted for functions without exact forms (recommended: yes, with explicit approximation metadata).

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

**Recommendation:** Khwarizmi TypeScript Core owns a versioned built-in unit registry. External libraries such as Pint may assist implementation but are not normative authorities.

Proposed v1 boundaries:
- Scalar quantities with explicit units and normalized dimensions.
- Canonical dimension vectors with rational exponents.
- Addition/subtraction require compatible dimensions; multiplication/division combine dimensions.
- Powers follow explicitly supported exponent rules.
- Angles have explicit semantics and a documented canonical convention.
- Defer absolute-temperature and temperature-difference arithmetic unless complete affine-unit rules are specified and tested.
- Defer user-defined units and user-defined unit systems.
- Unknown units, unsupported prefixes, and incompatible dimensions are errors.

**Approval needed:** built-in versioned registry; scalar dimensioned quantities and rational exponents; explicit angle semantics; defer temperature arithmetic and custom units unless needed for first release.

**Team may decide:** registry provenance, supported units and aliases, prefix table, canonical base units, conversion algorithms, dimension schema, and registry version metadata.

### A7 — RPC payload ceiling and behavior policy (F9/F10)

**Recommendation:** Fixed 16 MiB maximum payload per frame for RPC v1. A fixed ceiling is easier to test and avoids peers negotiating incompatible resource limits.

**Approval needed:** fixed 16 MiB versus configurable/negotiated maximum.

Proposed behavior: bounded request timeout and concurrency; reject duplicate in-flight request IDs; cancellation is best-effort and idempotent; unknown/completed cancellation is ignored; no partial result is represented as a completed snapshot; malformed notifications receive no response in accordance with JSON-RPC notification semantics.

**Team may decide:** exact timeout values, concurrency count, memory budget, and implementation mechanics, provided limits are explicit and tested.

### A8 — Windows named-pipe trust boundary (F10)

**Recommendation:** Treat named pipes as a local IPC boundary, not as proof of process identity. A same-user DACL alone does not prove that the connecting process is the intended Khwarizmi host.

Proposed security properties:
- Electron main creates or securely controls the pipe instance.
- Per-instance unpredictable pipe name; restrictive DACL; reject remote clients.
- Verify launched process identity/ownership before trusting the connection.
- Bind readiness to a per-launch capability or equivalent unguessable value delivered through a protected channel.
- Never expose that capability to renderer code or logs.
- Define behavior for pipe squatting, stale endpoints, reconnect, and unexpected host exit.

**Approval needed:** accept this process-bound trust model, including process verification plus a per-launch capability/handshake in addition to ACLs.

**Team may decide:** Windows API calls, ACL entries, capability provisioning, process-handle verification, handshake fields, and Windows test harness. Framing tests alone do not establish named-pipe security.

### A9 — Python worker scope (PR #2 open decision 6; F11)

**Recommendation:** Defer the Python worker protocol and numerical operation catalog from PR #3's v1 public contract. Python remains optional and internal to the TypeScript host. No renderer-facing or persisted-document Python API is introduced.

**Approval needed:** accept this deferral.

**Team may decide later under a separate ADR:** worker transport, lifecycle, allowlisted operations, resource limits, serialization, and crash/retry behavior.

## 3. Implementation-team decisions

The following can be settled by the team without owner approval, provided the invariants below are met and choices are recorded.

### T1 — Document revision identity (F1)

Every authored state affecting evaluation has an immutable revision identity. Evaluation snapshots identify documentId, document revision, document schema version, AST/semantic contract version, calculation engine version, and unit registry version.

**Recommendation:** SHA-256 over RFC 8785 JCS bytes of the canonical authored document payload as the content revision identity. A separate monotonic local revision number may serve UI/history but is not the content identity. Timestamps are not revision identities.

The digest excludes derived evaluation snapshots and view-only state. Any change to calculation inputs, AST, symbol definitions, unit attachments, or semantic contract invalidates the affected snapshot. Pure view changes do not.

The team may select field names and whether the digest is stored or computed, provided canonical equivalent authored documents produce the same digest.

### T2 — Schema compatibility and extensions (F8)

Define explicit compatibility rules:
- format identifies the Khwarizmi document format.
- schemaVersion is a major integer core-contract version.
- Unknown major versions are rejected.
- Unknown core properties are rejected in strict validation.
- Namespaced extensions are preserved through safe read/write round trips.
- Block contentVersion is independent only if a real independent migration boundary is needed; otherwise omit it in v1.
- Migrations are deterministic and preserve stable IDs and authored values.

The team may choose JSON Schema draft, schema IDs, validation settings, and migration implementation.

### T3 — Block and asset contracts (F7)

Every v1 block kind needs an explicit content schema; avoid arbitrary untyped content objects.

Define asset identity/hash, media type, byte length, embedded versus external reference rules, per-asset and aggregate limits, and missing/hash-mismatch behavior. External references must not trigger arbitrary network fetching during document validation or calculation.

The team may choose exact limits and schema field names.

### T4 — Layout grammar and validation (F6)

After A1 approval, define complete schemas for flow, grid, column, and positioned regions, or reduce v1 to the subset with precise behavior.

Specify child ownership, whether blocks may appear in multiple regions, ordering, bounds, overflow, clipping, overlap, grid tracks/gaps, z-order, and deterministic invalid-layout diagnostics. Do not implement vague layout modes that cannot be tested.

### T5 — RPC envelope, digest, and errors (F9/F10)

The team may define request/response schemas, reserved Khwarizmi error-code ranges and structured data, capability negotiation, strict UTF-8 decoding, and exact length-prefix parsing.

Digest coverage should be only the canonical document payload, not the transport envelope, request ID, or derived result. The receiver recomputes it. Digest is an integrity/cache key, not authentication. Decide whether it is mandatory on every document-bearing method and document the rule.

### T6 — Conformance tiers (F11)

Report four separate levels:
1. Schema conformance.
2. TypeScript semantic conformance.
3. Independent interoperability using a second implementation and the same language-neutral fixtures.
4. Windows transport/security conformance, including ACLs, process identity, and lifecycle.

PR #3 must deliver levels 1 and 2. Level 3 may be deferred with an explicit roadmap item if no second implementation exists. Level 4 requires Windows-specific tests and must not be claimed from fake-host or framing-only tests.

## 4. F1–F11 traceability

| Finding | Resolution | Owner | Required evidence |
|---|---|---|---|
| F1 Revision identity | T1 | Team | Revision and snapshot invalidation fixtures |
| F2 Numeric representation | A3 | Owner + team | Decimal, rational, and approximation fixtures |
| F3 Variable semantics | A4 | Owner + team | Sequential reassignment, stable identity, lexical local scope, shadowing rejection, control-flow and history fixtures |
| F4 Expression grammar | A5 | Owner + team | Precedence and unsupported syntax fixtures |
| F5 Unit semantics | A6 | Owner + team | Dimension, conversion, angle, and unsupported-unit fixtures |
| F6 Geometry/layout | A1 + T4 | Owner + team | Geometry/layout schemas and fixtures |
| F7 Blocks/assets | T3 | Team | Block schemas and asset boundary fixtures |
| F8 Versioning/extensions | T2 | Team | Unknown-version, extension, and migration fixtures |
| F9 Cancellation/concurrency | A7 + T5 | Owner + team | Duplicate ID, timeout, cancellation race, notification fixtures |
| F10 Integrity/security | A7 + A8 + T5 | Owner + team | Digest tests; Windows security tests separately |
| F11 Conformance scope | A9 + T6 | Owner + team | Tiered CI and explicit deferral status |

## 5. ADR updates required

After approval, update DECISIONS.md or add focused ADRs. Do not leave normative decisions only in this working document.

Suggested records:
- ADR-010 — Canonical page geometry and page-size model.
- ADR-011 — v1 value and numeric representation.
- ADR-012 — Symbol identity and assignment semantics.
- ADR-013 — Expression grammar and built-in function surface.
- ADR-014 — Unit registry and dimensional semantics.
- ADR-015 — RPC limits, cancellation, and concurrency.
- ADR-016 — Windows named-pipe trust boundary.
- ADR-017 — Python worker deferred boundary.
- ADR-018 — Document revision identity and schema compatibility.

Each ADR states status (Proposed, Accepted, Deferred, or Superseded), context, decision, consequences, and the approval/reference that moved it to Accepted.

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

- [ ] A1 Page geometry and page-size model.
- [ ] A2 Scalar-only versus structured values.
- [ ] A3 Numeric representation and approximation policy.
- [x] A4 Document namespace, sequential reassignment, tracked assignment history, lexical block-local variables, and no-shadowing rule.
- [x] A5 Arithmetic grammar and unambiguous implicit multiplication approved with amendment; if/while control-flow constructs included. Team must specify and test condition grammar and execution limits.
- [ ] A6 Unit registry, angle, temperature, and custom-unit scope.
- [ ] A7 Fixed/configurable RPC payload limit and behavior policy.
- [ ] A8 Named-pipe trust model.
- [ ] A9 Python worker deferral.
- [ ] T1–T6 implementation choices recorded.
- [ ] ADRs updated before schemas are marked stable.
