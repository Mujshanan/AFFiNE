# Khwarizmi Studio — Development Plan

This roadmap describes intended product direction and sequencing. Planned items are not claims of implemented functionality.

## Foundation

Khwarizmi Studio is **based on [AFFiNE](https://github.com/toeverything/AFFiNE)**. AFFiNE provides the inherited application foundation; [BlockSuite](https://github.com/toeverything/BlockSuite) provides the editor foundation. Adapt both incrementally while preserving upstream licenses and notices.

## Product outcome

A visual engineering worksheet where engineers define inputs, write equations, see symbolic and numerical substitutions, reuse intermediate results, track units, explain assumptions, and produce reviewable technical documents.

## Phase 0 — Repository and upstream baseline

- [x] Establish an AFFiNE-derived repository baseline.
- [x] Document the AFFiNE and BlockSuite foundation.
- [ ] Maintain an upstream change and license/notice inventory.
- [ ] Document reproducible development and build environments.
- [ ] Establish a routine for reviewing upstream changes.

**Exit criteria:** reproducible baseline, clear provenance, documented build steps, and separation of inherited versus Khwarizmi-owned code.

## Phase 1 — Architecture and engineering document contracts

- [ ] Define worksheet document schema and versioning.
- [ ] Define physical page coordinates, layout regions, and persistence.
- [ ] Define mathematical expression and variable-reference semantics.
- [ ] Define evaluation order, dependency tracking, and error states.
- [ ] Define quantities, units, conversion, and dimensional checking.
- [ ] Specify the TypeScript/Python calculation-host boundary.
- [ ] Align RPC schemas, errors, transport rules, and conformance tests.
- [ ] Record architecture decisions and compatibility guarantees.

**Exit criteria:** reviewed and tested contracts before broad editor or calculation-host implementation.

## Phase 2 — Worksheet interaction foundation

- [ ] Establish a page-oriented worksheet experience on BlockSuite.
- [ ] Support flexible placement and multi-column composition.
- [ ] Define selection, editing, keyboard, and navigation behavior.
- [ ] Add equation, text, table, and result content blocks.
- [ ] Support side-by-side input/expression and result presentation.
- [ ] Preserve document structure through save, reload, and migration.

**Exit criteria:** users can create, arrange, save, reopen, and edit a representative worksheet.

## Phase 3 — Calculation engine and traceability

- [ ] Implement the calculation-host process and RPC v1.
- [ ] Implement expression parsing and evaluation behind the contract.
- [ ] Resolve variables and references to earlier definitions/results.
- [ ] Show expressions, substitutions, and evaluated results.
- [ ] Support reusable intermediate results and dependency updates.
- [ ] Implement units, conversions, and dimensional validation.
- [ ] Surface calculation errors and invalid states clearly.
- [ ] Build deterministic contract and regression tests.

**Exit criteria:** representative calculations evaluate reproducibly with visible substitutions, reusable results, units, and meaningful errors.

## Phase 4 — Engineering authoring and verification

- [ ] Create representative structural-engineering worksheet examples.
- [ ] Document assumptions, inputs, references, and conclusions.
- [ ] Add verified calculation modules only with explicit code edition and scope.
- [ ] Build benchmark examples and independently checked expected results.
- [ ] Add regression tests for edge cases, units, and numerical tolerances.
- [ ] Distinguish verified functionality from experimental features.

**Exit criteria:** each released engineering capability has documented scope, assumptions, and independent validation evidence.

## Phase 5 — Document output and release readiness

- [ ] Define paginated A4 layout and print behavior.
- [ ] Add PDF export for equations, tables, diagrams, and page numbering.
- [ ] Verify export fidelity against on-screen worksheets.
- [ ] Establish Windows packaging and installation checks.
- [ ] Add backup, recovery, and document compatibility tests.
- [ ] Publish release notes, limitations, and migration guidance.

**Exit criteria:** stable authoring-to-review-to-PDF workflow, repeatable installation, and documented limitations.

## Near-term priorities

1. Finish the AFFiNE-derived baseline and Windows packaging validation.
2. Complete architecture decisions for document schema, calculation semantics, and RPC.
3. Align contract-conformance tests with the approved RPC specification.
4. Begin worksheet editor and calculation-host implementation only after those contracts are reviewed.

## Foundation-stage non-goals

- Replacing AFFiNE or BlockSuite wholesale without evidence that they block a required capability.
- Broad UI implementation before document and calculation contracts are reviewed.
- Claiming structural-code compliance before independent validation.
- Treating a successful desktop build as evidence that engineering calculations are correct.

## Status conventions

- [x] Completed and verified.
- [ ] Planned or not yet verified as complete.

Update this roadmap as decisions are approved and work is delivered. Link completed phases to implementation PRs, tests, and architecture records.
