# Khwarizmi Studio — Development Plan

This roadmap defines the intended product direction, technical workstreams, sequencing, and exit criteria. A planned capability is not a claim that it is implemented, verified, or ready for engineering use. Checklists are updated only when repository evidence supports completion.

## Product outcome

Khwarizmi Studio is an engineering calculation and technical-documentation environment. Engineers should be able to author equations, variables, units, tables, matrices, vectors, explanatory content, and diagrams in one reviewable worksheet; connect those objects through deterministic calculations; trace the origin and history of data; and produce dependable paginated deliverables.

## Architectural foundation and ownership

Khwarizmi is based on the AFFiNE repository and uses BlockSuite as its editor foundation. The intent is to adapt and update the inherited application rather than replace it wholesale.

| Layer | Owns | Must not become authoritative for |
|---|---|---|
| AFFiNE application | Application shell, workspace/navigation, platform integration, inherited application services | Engineering document semantics or calculation results |
| AFFiNE infrastructure | Suitable persistence, service, localization, and desktop capabilities | Khwarizmi calculation history and domain rules |
| BlockSuite | Editing surface, block lifecycle, selection, interaction, document editing primitives | Calculation order, variable binding, units, or physical page geometry |
| Khwarizmi document/domain | Versioned engineering document model, page geometry, stable identities, table/data semantics, namespaces, calculation order, units, provenance, migration rules | Generic application shell responsibilities |
| Khwarizmi calculation host | Evaluation, dependency resolution, exact numeric handling, validation, RPC boundary, deterministic results | Visual layout and editor interaction |
| External data adapters | Import/export/refresh protocols and source metadata | Silent mutation of authoritative calculation state |

**Core rule:** AFFiNE and BlockSuite are reusable infrastructure. Khwarizmi owns the engineering document and calculation meaning. Visual position or block movement must not silently change calculation order or mathematical results.

## Development status snapshot

The repository has progressed beyond the original contract-definition milestone. PRs #5–#10 describe the current contract, conformance, RPC, Compute Engine adapter, and document-evaluation work. They are not evidence that every runtime/release gate is complete. In particular, PR #9 and PR #10 have been described as draft work, and runtime integration and full verification remain outstanding. Review the live PRs and CI before changing these statuses.

- PR #5: MathJSON/Compute Engine-aligned semantic contract.
- PR #6: TypeScript contract validators.
- PR #7: executable fixture/conformance runner.
- PR #8: RPC framing and cancellation primitives.
- PR #9: Compute Engine adapter and exact codecs.
- PR #10: deterministic document-evaluation vertical slice.

## Phase 0 — Repository baseline and upstream stewardship

- [x] Establish an AFFiNE-derived repository baseline.
- [x] Document the AFFiNE and BlockSuite foundation.
- [x] Record the inherited repository/toolchain structure and baseline provenance.
- [ ] Complete the nested license and notice inventory.
- [ ] Verify clean Windows install, build, and unmodified desktop launch.
- [ ] Complete Windows ZIP/Squirrel/NSIS install-launch-uninstall smoke tests; retain Windows as a mandatory release platform.
- [ ] Establish a recurring upstream AFFiNE/BlockSuite review and update procedure.
- [ ] Document the supported upstream version/commit and compatibility policy.

Evidence and remaining gates: [Repository baseline](./docs/BASELINE.md).

**Exit criteria:** reproducible baseline, clear provenance, preserved licensing, documented build steps, and verified Windows desktop baseline.

## Phase 1 — Architecture, semantic contracts, and executable conformance

- [x] Record accepted architecture direction and responsibility boundaries.
- [x] Define the page geometry direction: micrometres, top-left origin, standard and custom page sizes.
- [x] Define the MathJSON-based expression model, namespaces, assignment/reassignment, dependency, substitution, and unit semantics.
- [x] Select the TypeScript-authoritative v1 core and defer a Python worker.
- [x] Specify the JSON-RPC 2.0 calculation-host boundary and initial named-pipe framing.
- [x] Define versioned schemas, semantic validators, fixture runner, RPC framing primitives, Compute Engine adapter, and initial evaluator across PRs #5–#10.
- [ ] Complete `if` / `while` execution and lexical local-variable scope behavior.
- [ ] Complete evaluator-level dimensional preflight, unit-aware arithmetic, and conversion semantics.
- [ ] Implement RFC 8785 canonical digest generation and verification (not merely digest-shape validation).
- [ ] Complete persistence/reload, stale-snapshot, invalidation, and replay behavior.
- [ ] Wire cancellation and concurrency through real asynchronous evaluation.
- [ ] Complete production calculation-host integration and Windows process/named-pipe security.
- [ ] Run the full lint, formatting, typecheck, fixture, conformance, integration, and Windows verification gates.
- [ ] Ensure no required conformance stage is silently skipped or left blocked at release.

Architecture index: [Contract index](./docs/architecture/README.md).

**Exit criteria:** normative contracts and executable fixtures are stable; all required evaluator and RPC behaviors are implemented; no release-blocking conformance stage remains blocked; CI and Windows host verification pass.

## Phase 2 — AFFiNE reuse and editor/domain integration audit

This phase is deliberately before broad custom-block/UI work. It determines how the inherited application and editor foundations will host Khwarizmi's own document and calculation model.

- [ ] Inventory relevant AFFiNE packages and classify each as reuse, adapt, isolate, replace, or exclude.
- [ ] Inventory relevant BlockSuite packages and identify the smallest supported editor integration surface.
- [ ] Map AFFiNE application, service, persistence, localization, and Electron boundaries.
- [ ] Define the supported AFFiNE/BlockSuite version pair and upstream update policy.
- [ ] Define the Khwarizmi block-to-domain mapping and stable identity rules.
- [ ] Define how Khwarizmi-owned document data is persisted, migrated, restored, and versioned through AFFiNE storage.
- [ ] Define editor-to-evaluator request/result synchronization without making editor state authoritative for calculations.
- [ ] Define how editor undo/redo, copy/paste, duplication, deletion, and movement interact with domain identities and dependencies.
- [ ] Audit cloud/collaboration dependencies and decide which are retained, disabled, or deferred.
- [ ] Verify Electron integration and Windows compatibility implications.
- [ ] Publish an integration decision record and dependency map.

**Exit criteria:** an approved package-level reuse map, explicit editor/domain/persistence/evaluator contracts, supported upstream compatibility baseline, and no unresolved architecture blocker to implementing the integrated worksheet.

## Phase 3 — Calculation runtime and traceability

- [ ] Complete the calculation-host process and production RPC v1 integration.
- [ ] Complete parsing/authoring adapters and expression evaluation behind the frozen contract.
- [ ] Resolve symbols and references using Khwarizmi namespaces and sequential assignment versions.
- [ ] Preserve immutable assignment events, dependency provenance, and deterministic calculation order.
- [ ] Implement lexical local scope for control flow and prevent accidental leakage/shadowing.
- [ ] Implement exact numeric handling and precision-preserving MathJSON serialization end to end.
- [ ] Implement unit registry resolution, dimensional validation, unit-aware arithmetic, and conversions.
- [ ] Implement dependency invalidation, recomputation, stale-result detection, and replay.
- [ ] Surface validation/evaluation diagnostics with source locations and actionable messages.
- [ ] Verify cancellation, concurrent requests, host lifecycle, disconnect/reconnect, and Windows process isolation.
- [ ] Bind evaluation state and results to the editor without coupling semantics to visual position.

**Exit criteria:** representative worksheets evaluate reproducibly; edits invalidate and recompute the correct dependents; assignments, substitutions, units, diagnostics, and provenance are inspectable; save/reload produces consistent results.

## Phase 4 — Structured data and table foundation

Tables are not merely visual grids. They are first-class structured data objects that can participate in the same document identity, dependency, evaluation, unit, and provenance systems as equations.

### Data model and cell semantics

- [ ] Define stable table, row, column, and cell identities.
- [ ] Define cell value types, formulas, formatting metadata, headers, named ranges, and schema/version migration.
- [ ] Define row/column insertion, deletion, movement, sorting, copy/paste, and reference-stability behavior.
- [ ] Define cell references and range references, including how references survive structural edits.
- [ ] Define typed columns, missing/null values, error values, and mixed-type validation.
- [ ] Define how table values and formulas participate in document namespaces and calculation order.

### Table calculation engine

- [ ] Define cell formula syntax and its relationship to Khwarizmi expressions and MathJSON.
- [ ] Support references to cells, ranges, named ranges, variables, and other calculation blocks.
- [ ] Define supported aggregate and statistical functions for the initial release.
- [ ] Integrate cell formulas into the single Khwarizmi dependency graph and evaluation pipeline.
- [ ] Support calculated columns and fill/copy formula behavior with explicit relative/absolute reference semantics.
- [ ] Apply engineering units and dimensional validation to cell values and formula results.
- [ ] Define cycle detection, error propagation, recalculation boundaries, and deterministic results.
- [ ] Ensure table edits trigger correct dependency invalidation without recalculating unrelated work.

### Matrix and vector interoperability

- [ ] Define typed matrix and vector domain objects, including dimensions, shape, element type, units, and provenance.
- [ ] Define table-to-matrix and table-to-vector conversion validation, including headers, selected ranges, missing values, and non-numeric cells.
- [ ] Define matrix/vector-to-table presentation and editable conversion.
- [ ] Support explicit copy/convert, live link, and detach operations; never silently destroy or replace the source.
- [ ] Define synchronization direction and conflict behavior for linked table/math objects.
- [ ] Extend the MathJSON/semantic contract profile deliberately before enabling matrix/vector evaluation; the current v1 scalar-focused profile must not be assumed to support collections.
- [ ] Add tests for shape, orientation, units, precision, identity, round-trip conversion, and link/detach semantics.

### External data and spreadsheet interoperability

- [ ] Define a connector interface independent of the editor and calculation engine.
- [ ] Implement CSV import/export with delimiter, encoding, quoting, header, locale, and type-inference controls.
- [ ] Implement XLSX import/export with worksheet selection, cell-range selection, headers, data types, and supported formatting.
- [ ] Define how Excel formulas are handled: import cached values, translate only explicitly supported formulas, and report unsupported formulas/functions.
- [ ] Support snapshot import and explicitly linked external sources as distinct modes.
- [ ] Store source URI/path or connector identity, selected sheet/range, refresh metadata, last successful snapshot, and import diagnostics.
- [ ] Detect missing, changed, or inaccessible sources; never silently overwrite document data.
- [ ] Define manual refresh first; defer scheduled/background/live refresh until trust, conflict, and reproducibility rules are established.
- [ ] Define export behavior for formulas, values, units, formatting, and unsupported features.
- [ ] Add fixtures and round-trip tests for CSV/XLSX, locale-sensitive numbers, dates, empty cells, formulas, precision, and malformed input.

### Reproducibility and data integrity

- [ ] Make imported/linked data snapshots immutable inputs to a particular evaluation revision.
- [ ] Record source version/fingerprint, refresh time, connector version, and transformation/import settings.
- [ ] Require explicit refresh to change the active input snapshot and trigger dependent recalculation.
- [ ] Make it possible to reproduce a previous calculation from its saved snapshot even if the external file later changes or disappears.
- [ ] Include table/data changes in canonical document digest and dependency provenance rules.

**Exit criteria:** tables are durable, typed, editable, and calculation-aware; matrix/vector conversion is explicit and testable; CSV/XLSX import/export is reliable; linked external data is traceable and snapshot-based; all data participates in deterministic evaluation without introducing a second calculation engine.

## Phase 5 — Integrated worksheet and authoring experience

- [ ] Build a page-oriented worksheet experience on BlockSuite using the approved Phase 2 integration contracts.
- [ ] Support standard/custom physical page sizes and stable page geometry.
- [ ] Support flexible placement, multi-column composition, and predictable reading/print order.
- [ ] Define selection, editing, keyboard, navigation, undo/redo, clipboard, and accessibility behavior.
- [ ] Add Khwarizmi-owned equation, variable, result, text, table, matrix, vector, image, and diagram blocks.
- [ ] Provide table editing, formula entry, range selection, import/export, and refresh UI.
- [ ] Provide explicit table-to-matrix/vector conversion and linked/detached object controls.
- [ ] Show expression, substitution, result, unit, diagnostic, and dependency provenance.
- [ ] Support side-by-side input/expression/result presentation.
- [ ] Support Arabic/English localization and appropriate bidirectional text behavior.
- [ ] Preserve structure, stable identities, and evaluation state through save, reload, duplication, and migration.
- [ ] Add accessible menus, toolbars, dialogs, keyboard workflows, and responsive application behavior.

**Exit criteria:** users can create, arrange, calculate, inspect, import/export, save, reopen, and edit a representative engineering worksheet without data loss or semantic drift.

## Phase 6 — Engineering authoring, templates, and verification

- [ ] Create representative structural-engineering worksheet examples using equations, tables, matrices/vectors, and external data.
- [ ] Document design basis, assumptions, inputs, references, intermediate values, and conclusions.
- [ ] Add reusable engineering templates and calculation components.
- [ ] Add verified calculation modules only with explicit code edition, clause references, scope, and limitations.
- [ ] Build benchmark examples with independently checked expected results.
- [ ] Add regression tests for edge cases, dimensional consistency, precision, numerical tolerances, and data import.
- [ ] Distinguish verified functionality from experimental features.
- [ ] Provide review/inspection views that expose inputs, dependencies, source snapshots, and calculation provenance.

**Exit criteria:** each released engineering capability has documented scope and assumptions, traceable source data, and independent validation evidence. No code-compliance claim is made without the relevant verification.

## Phase 7 — Document output and production readiness

- [ ] Define paginated A4 and custom-page layout, print behavior, and page-break rules.
- [ ] Generate PDF output for equations, tables, matrices/vectors, diagrams, references, and page numbering.
- [ ] Verify PDF fidelity against on-screen worksheets and preserve readable math and units.
- [ ] Define editable document interchange and reliable CSV/XLSX export.
- [ ] Add backup, recovery, autosave, crash recovery, and document compatibility tests.
- [ ] Test large worksheets, large tables, recalculation performance, memory use, and responsiveness.
- [ ] Complete Windows packaging, signing/update strategy where configured, install/upgrade/uninstall, and clean-machine smoke tests.
- [ ] Publish reproducible build instructions, release notes, migration guidance, limitations, and support policy.
- [ ] Establish release gates for security, accessibility, licensing, and calculation correctness.

**Exit criteria:** dependable authoring-to-review-to-PDF workflow, reproducible installation on Windows, robust recovery, documented limitations, and passing release verification.

## Near-term execution order

1. **PR #11 — Roadmap and scope update:** record this expanded plan, including the first-class data/table subsystem and explicit AFFiNE integration audit.
2. **AFFiNE reuse and integration audit:** package-by-package reuse decisions and editor/domain/persistence/evaluator boundary contracts.
3. **Complete and verify the existing calculation stack:** reconcile PRs #9 and #10 and close the remaining runtime, conformance, and Windows security gates.
4. **Data/table contracts:** design the table/cell/range model, formula semantics, matrix/vector interoperability, external source/snapshot model, and conformance fixtures before implementing the full table UI.
5. **Integrated editor implementation:** connect the approved data and calculation contracts to BlockSuite and AFFiNE.
6. **Engineering workflows and release:** templates, independent verification, PDF, Windows release.

The exact branch/PR order may change to respect dependencies in the live PR stack. Do not merge a downstream PR before its required base is integrated. Do not represent a phase as complete solely because its design document exists.

## Foundation-stage non-goals

- Replacing AFFiNE or BlockSuite wholesale without evidence that they block a required capability.
- Making BlockSuite's visual/editor state authoritative for engineering calculation semantics.
- Introducing a separate spreadsheet calculation engine that conflicts with Khwarizmi evaluation.
- Silently treating Excel formulas as equivalent to Khwarizmi expressions.
- Silently refreshing external data and changing prior engineering results.
- Enabling matrix/vector evaluation by bypassing the versioned MathJSON and semantic contracts.
- Claiming structural-code compliance before independent validation.
- Treating a successful desktop build as evidence that engineering calculations are correct.

## Status conventions

- [x] Completed and verified in the repository.
- [ ] Planned, incomplete, or not yet verified.

Update this roadmap as decisions are approved and work is delivered. Link completed phases to implementation PRs, tests, CI evidence, and architecture records.
