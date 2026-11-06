# Khwarizmi Studio — Development Plan

This roadmap describes intended product direction and sequencing. Planned items are not claims of implemented functionality.

## Foundation

Khwarizmi Studio is **based on [AFFiNE](https://github.com/toeverything/AFFiNE)**. AFFiNE provides the inherited application foundation; [BlockSuite](https://github.com/toeverything/BlockSuite) provides the editor foundation. Adapt both incrementally while preserving upstream licenses and notices.

## Product outcome

A visual engineering worksheet where engineers define inputs, write equations, see symbolic and numerical substitutions, reuse intermediate results, track units, explain assumptions, and produce reviewable technical documents.

## Phase 0 — Repository and upstream baseline

- [x] Establish an AFFiNE-derived repository baseline.
- [x] Document the AFFiNE and BlockSuite foundation.
- [x] Identify the AFFiNE baseline commit and document inherited repository/toolchain structure.
- [ ] Complete the nested license/notice inventory.
- [ ] Verify a clean Windows install, build, and unmodified desktop launch.
- [ ] Complete Windows ZIP/Squirrel/NSIS install-launch-uninstall smoke tests (PR #1 remains blocked).
- [ ] Establish a routine for reviewing upstream changes.

Baseline evidence and remaining gates: [Repository baseline](./docs/BASELINE.md).

**Exit criteria:** reproducible baseline, clear provenance, documented build steps, and separation of inherited versus Khwarizmi-owned code. The audit is documented; clean runtime and packaging validation remain open.

## Phase 1 — Architecture and engineering document contracts

- [x] Record accepted architecture direction and responsibility boundaries.
- [x] Draft the versioned worksheet/document model and page geometry contract.
- [x] Draft canonical AST, variable, dependency, substitution, unit, and error semantics.
- [x] Specify the TypeScript-authoritative core and optional Python worker boundary.
- [x] Specify the initial JSON-RPC 2.0 named-pipe topology and framing proposal.
- [ ] Resolve open normative decisions and freeze JSON schemas.
- [ ] Implement language-neutral contract fixtures and executable conformance tests.
- [ ] Verify RPC transport/security behavior and cross-implementation conformance.

Architecture documents: [Contract index](./docs/architecture/README.md).

**Exit criteria:** approved normative schemas, stable fixtures, passing contract tests, and verified transport/security behavior before broad editor or production calculation-host implementation. Current documents are proposals; this phase is not yet closed.

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

## Next development milestone — PR #3: contract freeze and executable conformance

PR #3 is the next product-development milestone, not a UI feature. It converts the architecture proposals into versioned, machine-checkable contracts and an executable conformance suite. Scope and acceptance criteria: [PR #3 milestone](./docs/architecture/PR-3-CONTRACT-CONFORMANCE.md).

1. Complete review and approval of the v1 normative decisions; record them in ADRs.
2. Publish versioned document, expression, evaluation, diagnostic, and RPC JSON Schemas.
3. Add language-neutral fixtures with stable IDs and reviewed expected outcomes.
4. Implement TypeScript validators and deterministic schema/semantic/unit tests.
5. Test RPC framing independently and add fake-host integration coverage.
6. Run the contract suite in CI without Electron or the production calculation host.

PR #1's Windows packaging and launch/install/uninstall verification remains a separate release-readiness track. PR #2 remains the architecture-proposal base for PR #3; PR #3 must not be merged before its base. Do not start broad worksheet UI or production calculation-host implementation until PR #3's acceptance criteria pass.

## Foundation-stage non-goals

- Replacing AFFiNE or BlockSuite wholesale without evidence that they block a required capability.
- Broad UI implementation before document and calculation contracts are reviewed.
- Claiming structural-code compliance before independent validation.
- Treating a successful desktop build as evidence that engineering calculations are correct.

## Status conventions

- [x] Completed and verified.
- [ ] Planned or not yet verified as complete.

Update this roadmap as decisions are approved and work is delivered. Link completed phases to implementation PRs, tests, and architecture records.
