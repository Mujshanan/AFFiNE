# Phase B — End-to-end worksheet evaluation

**Status:** deterministic evaluator and in-process RPC contract implemented; production persistence and host/editor integration remain  
**Milestone branch:** `khwarizmi/document-evaluation-v1`  
**Scope:** Integrate the validated Khwarizmi document contract with the pinned Compute Engine adapter and prove deterministic evaluation before introducing broad worksheet UI.

## Implemented

### Document evaluation

- Validates a document before evaluation and rejects invalid input without invoking the engine.
- Executes top-level statements in explicit `calculationOrder`; page and visual order are never consulted.
- Resolves engine tokens to the latest preceding successful assignment event.
- Records immutable assignment events, sequential assignment versions, and exact event/version dependencies.
- Preserves original expressions separately from substituted MathJSON and records JSON Pointer substitution provenance.
- Restores authored exact decimal/rational lexemes before engine evaluation.
- Executes selected `if` branches and bounded `while` loops with lexical local scopes, nested outer-local capture, no local leakage, sequential reassignment, and recorded control-flow paths.
- Enforces a deterministic total loop-iteration budget (default 10,000; configurable from 1 to 10,000).
- Returns normalized Khwarizmi result records, not Compute Engine objects.

### Units and dimensions

The unit codec resolves registry-defined units, compares normalized rational dimensions, composes dimension exponents, and computes exact rational conversion factors. The evaluator now:

- applies explicit expression unit attachments and symbol/target unit metadata;
- converts compatible operands for addition, subtraction, comparisons, min/max, and target-unit assignments;
- composes dimensions and scales for multiplication, division, integer powers, and exact square roots;
- converts degree/radian inputs for trigonometric functions using symbolic pi;
- rejects incompatible dimensions and unsupported unitful operators with stable diagnostics.

The registry version must match the document's `unitRegistryVersion`. Evaluator bindings currently use registry-defined unit IDs; prefix expansion is available in the codec but is not yet exposed as a separate binding form.

### Engine, integrity, and RPC

- The evaluator enforces the pinned `@cortex-js/compute-engine` version **0.180.0** and receives a fresh engine factory from its host.
- RFC 8785 canonical JSON and SHA-256 utilities are implemented, with verification and evaluation-snapshot freshness checks across document revision, semantic version, unit-registry version, and engine version.
- The transport-neutral in-process JSON-RPC dispatcher provides request correlation, parameter validation, bounded concurrency, cancellation notifications, shutdown cancellation, and stable error mapping.
- The dedicated contract workflow runs schema, semantic, numeric/unit, evaluator/control-flow, integrity, and RPC tests independently of the inherited AFFiNE E2E matrix.

## Remaining production integration gates

- Durable authored-document and evaluation-snapshot persistence/reload, including atomic save/recovery and stale-result storage/invalidation.
- Receiver-side digest verification connected to RPC document intake.
- Electron/native process and byte-pipe binding, validation/evaluation timeouts, and Windows named-pipe ACL/process-identity security.
- BlockSuite command/transaction adapter and save/reload, undo/redo, physical-geometry, and visual-reordering conformance.
- Full Windows packaged-host validation and artifact inspection.

These are separate release-blocking integration milestones. This PR completes the deterministic evaluator and in-process RPC contract; it does not claim the production process host, durable persistence, or BlockSuite adapters are already implemented.

## Required conformance tests

- sequential reassignment reads the previous version and writes the next;
- failed assignments cannot be consumed by dependent expressions;
- visual movement does not change calculation order;
- selected `if` branches, nested lexical capture, and scope exit behave deterministically;
- `while` reassignment and loop-budget diagnostics are deterministic;
- compatible unit conversion produces the same physical quantity;
- incompatible dimensions fail with a stable diagnostic;
- angle conversion retains symbolic pi;
- multiplication/division/power/square-root compose dimensions correctly;
- canonical digests and snapshot freshness reject stale evaluation results;
- RPC correlation, duplicate IDs, concurrency, cancellation, shutdown, and error mapping pass;
- serialized authored documents and snapshots round-trip without changing exact numeric values.
