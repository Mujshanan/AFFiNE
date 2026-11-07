# Phase B — End-to-end worksheet evaluation

**Status:** In progress; linear evaluation and lexical control-flow runtime implemented, integration gates remain  
**Milestone branch:** `khwarizmi/document-evaluation-v1`  
**Scope:** Integrate the validated document contract with the Compute Engine adapter and prove versioned sequential assignment behavior before introducing editor integration.

## Phase B acceptance sequence

1. Validate a document before evaluation; reject invalid input without invoking the engine.
2. Execute statements in explicit `calculationOrder`, never page or visual order.
3. Resolve each engine token to the latest preceding successful assignment event.
4. Record immutable assignment events and exact event/version dependencies.
5. Preserve original expressions and a separate substituted MathJSON tree.
6. Return normalized Khwarizmi result records rather than Compute Engine objects.
7. Keep previous evaluation snapshots immutable by returning a new result for each document revision.
8. Add units, control flow, failure propagation, persistence/reload, and RPC integration in separately testable increments.

## Current implementation slice

The evaluator rejects duplicate statement IDs and duplicate entries in `calculationOrder` before execution, requires `calculationOrder` to be an array, preserves authored decimal lexemes, and enforces non-empty unique assignment-event IDs. The runtime now executes selected `if` branches and bounded `while` loops, creates lexical scopes for control-flow bodies, permits nested blocks to capture enclosing locals, prevents local leakage after block exit, tracks sequential reassignment versions, and records a control-flow path on executed result records. The loop budget is deterministic and bounded by a configurable maximum of 10,000 total iterations per evaluation. Dedicated regression tests cover branch selection, nested local capture, local-scope exit, loop reassignment, and resource-limit diagnostics.

The unit codec resolves registry-defined units and permitted SI prefixes, compares normalized rational dimensions, composes dimension exponents, and computes exact rational conversion factors. Degree/radian conversion retains a symbolic pi factor and refuses to collapse it into a rational magnitude. This codec remains a standalone foundation; evaluator-level dimensional preflight and unit-aware arithmetic/conversion are not yet wired into the runtime.

The evaluation-result schema now explicitly models immutable assignment-event records. Substitution provenance includes the stable document `symbolId` and the normalized numeric value (plus unit metadata when present), rather than leaking the internal MathJSON value into a field whose contract is a numeric-value record. This keeps the runtime result shape aligned with the published v1 schema.

The initial evaluator supports a linear sequence of document-level `assign` and `expression` statements. It requires the caller to supply the document validator and a fresh Compute Engine factory. It creates a new engine through the adapter for each statement evaluation, records assignment versions and event IDs, substitutes only the exact preceding assignment values, and returns normalized result records.

This is a foundation slice, not a completed production evaluator.

## Explicitly not claimed as complete

- evaluator-level unit dimensional preflight and unit-aware arithmetic/conversion;
- durable snapshot persistence/reload and stale-snapshot storage/invalidation;
- RPC receiver-side RFC 8785 document digest verification (canonical JSON and SHA-256 utilities are implemented and tested);
- RPC host integration, cancellation, and concurrency;
- editor binding and visual movement/reordering tests;
- Windows host process and named-pipe security.

Unsupported statement kinds are reported as errors rather than silently skipped. Unit metadata is carried from target symbols and substitutions, but dimensional arithmetic is not yet enforced. Canonical JSON and SHA-256 digest utilities are implemented; binding digest verification to RPC document intake and persistent snapshot storage remains outstanding. These remaining items are release-blocking for the full Phase B exit criteria.

## Required conformance tests

- sequential reassignment reads the previous version and writes the next;
- later reads bind to the latest successful assignment;
- failed assignments cannot be consumed by dependent expressions;
- moving a statement visually does not change calculation order;
- previous revision results remain unchanged after a new evaluation;
- unsupported control flow is explicit and diagnostic;
- unit codec rejects incompatible dimensions and preserves symbolic angle conversions; evaluator-level dimensional preflight remains outstanding;
- serialized snapshots round-trip without changing exact numeric values.
