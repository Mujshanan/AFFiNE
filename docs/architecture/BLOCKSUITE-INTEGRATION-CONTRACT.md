# BlockSuite ↔ Khwarizmi Integration Contract v1

**Status:** proposed implementation contract for the AFFiNE-hosted engineering package.  
**Host:** AFFiNE. **Editor foundation:** BlockSuite. **Semantic authority:** Khwarizmi Core.  
**Scope:** integrated structural-engineering package testing inside this repository; not a standalone application.

## 1. Purpose and non-negotiable boundary

BlockSuite is the editing and interaction substrate. Khwarizmi is the authority for engineering-document identity, physical worksheet geometry, authored calculation semantics, symbol/assignment history, units, dependencies, evaluation snapshots, and engineering-specific block content.

The adapter is the only boundary between the two models. Application features MUST NOT make calculation meaning depend on BlockSuite's internal model shape, transient selection state, DOM, rendered text, or block position.

The adapter MUST use public BlockSuite/AFFiNE extension and transaction APIs. It MUST NOT patch or fork BlockSuite internals merely to attach engineering semantics. Any unavoidable upstream-specific integration is isolated in a versioned host adapter.

## 2. Ownership matrix

| Concern | Owner | Rule |
|---|---|---|
| AFFiNE application lifecycle, workspace selection, local storage provider | AFFiNE host | Khwarizmi uses host services through adapters |
| Block editing, text editing, selection, focus, drag, resize, undo/redo | BlockSuite | Editor mechanics only |
| BlockSuite model and transaction APIs | BlockSuite | Access only through the integration adapter |
| Engineering document schema and stable IDs | Khwarizmi Core | Canonical semantic model |
| Page size, margins, physical coordinates and layout constraints | Khwarizmi Core | Persist integer micrometres |
| Expression AST, symbol resolution, assignment versions and calculation order | Khwarizmi Core | Never inferred from visual order |
| Unit registry, dimensions, conversions and diagnostics | Khwarizmi Core | Versioned and validated |
| Table semantics, typed cells and matrix/vector projections | Khwarizmi Core | BlockSuite renders/edits through commands |
| Beam/frame/diagram geometry and structural result data | Khwarizmi Core | Renderer is a projection, not the source of truth |
| Evaluation result and provenance snapshots | Calculation host / Khwarizmi Core | Derived, revision-keyed data |
| Cloud/realtime sync | Optional AFFiNE adapter | Local-first core MUST work without cloud services |

## 3. Document identity and persistence model

A Khwarizmi worksheet has its own `documentId`, `schemaVersion`, `semanticVersion`, `pages[]`, `symbols[]`, `calculationOrder[]`, `assets[]`, and namespaced `extensions`. An AFFiNE workspace/doc ID is a host locator, not a substitute for the Khwarizmi `documentId`.

The integration record stored alongside the AFFiNE document MUST contain:

- `integrationFormat: "khwarizmi.blocksuite-binding"`;
- `integrationVersion: 1`;
- stable `khwarizmiDocumentId`;
- Khwarizmi schema and semantic versions;
- the mapping between Khwarizmi page/block IDs and BlockSuite model IDs;
- the last committed Khwarizmi document revision digest.

The canonical authored engineering document MUST be serializable and round-trip independently of a raw BlockSuite snapshot. BlockSuite persistence may be the physical storage mechanism, but a BlockSuite snapshot alone is not the normative engineering document format.

Derived evaluation snapshots MUST be stored separately from authored content and keyed by `documentId + documentRevision + semanticVersion + unitRegistryVersion + engineVersion`. A stale snapshot MUST be detectable and MUST NOT overwrite authored values.

## 4. Block identity and type mapping

Every Khwarizmi block has an immutable `blockId`. A mapping record associates it with the current BlockSuite model ID. Model IDs may change during migration or host adaptation; Khwarizmi IDs do not.

The initial engineering block families are:

| Khwarizmi type | BlockSuite responsibility | Khwarizmi responsibility |
|---|---|---|
| `text` | Rich-text editing and presentation | Stable block identity and authored text metadata |
| `math` | Equation editing/rendering surface | Canonical expression record, bindings, exact literals and source map |
| `variable` / `input` | Input controls and display | Symbol identity, quantity, unit and assignment history |
| `table` | Grid interaction, cell selection and editing | Typed columns/cells, formulas, references and table-to-matrix/vector projection |
| `diagram` | Selection, viewport, handles and visual editing | Structured geometry, constraints, beam/frame entities and result references |
| `result` | Result presentation | Evaluation-result reference and provenance |
| `reference` | Citation presentation | Source identity and reference metadata |
| `group` | Group selection and layout | Semantic grouping and child IDs |

A block's visual style MUST NOT change its semantic type. A result block MUST NOT create a variable. A table cell MUST NOT become a calculation symbol solely because of its displayed text.

Custom BlockSuite specs SHOULD be registered under a Khwarizmi-owned namespace (for example, `kz:math`, `kz:table`, `kz:diagram`) through supported registration APIs. These names are proposed adapter identifiers, not claims that those specs are already implemented.

## 5. Transaction and command contract

All writes flow through a Khwarizmi command API. UI code MUST NOT mutate canonical document objects or BlockSuite model fields directly.

Initial commands:

- `InsertBlock`, `DeleteBlock`, `UpdateBlockContent`;
- `MoveBlock`, `ResizeRegion`, `ReorderRegion`;
- `SetPageGeometry`;
- `SetExpression`, `AssignSymbol`, `SetInputValue`;
- `UpdateTableCell`, `ResizeTable`;
- `UpdateDiagramGeometry`;
- `SetCalculationOrder` (explicit semantic operation only);
- `UndoCommand`, `RedoCommand`.

Each command MUST include a command ID, document ID, expected base revision, actor/origin, and typed payload. The command handler validates the payload, applies a deterministic change to the Khwarizmi model, computes the new revision, and emits the corresponding BlockSuite transaction. The adapter tags transactions with an origin token to prevent an editor-to-core-to-editor feedback loop.

A user gesture that is one logical edit MUST map to one undoable command/transaction. A transaction that fails validation MUST be rejected atomically; partial application is forbidden.

BlockSuite-originated transactions are observed and translated into commands. Unknown or unsupported model changes MUST be preserved as host/editor data where possible, but MUST NOT be interpreted as engineering semantics.

## 6. Visual order versus calculation order

Page, region, and block order are presentation/layout data. `calculationOrder` is a separate ordered list of top-level executable statement IDs. AFFiNE's page view presents the physical worksheet pages; its graph view may provide navigation and relationship discovery, but graph nodes, edges, traversal, and graph layout are non-semantic and MUST NOT alter worksheet page geometry, block identity, or calculation order.

- Dragging a block, moving it to another region, changing columns, or moving it to another page MUST NOT change calculation order.
- Changing calculation order requires an explicit command and a visible semantic action.
- Reordering a visual block MUST preserve its `blockId`, symbol IDs, assignment IDs, and evaluation history.
- Deleting or detaching a statement referenced by `calculationOrder` MUST produce a validation error or an explicit remove-from-calculation command; it MUST NOT silently rewrite the sequence.
- The evaluator consumes the canonical Khwarizmi document and never queries BlockSuite order to decide execution.

## 7. Page geometry and coordinate conversion

Khwarizmi persists page dimensions, margins, regions and engineering geometry as integer micrometres (`um`), with a page-local top-left origin, +X right and +Y down. BlockSuite may use editor-space coordinates and CSS pixels internally.

The adapter MUST perform explicit conversions at the rendering/input boundary. Zoom, pan, device-pixel ratio, scroll position and viewport size MUST NOT change persisted physical geometry. Rounding MUST be deterministic and specified by the adapter; no floating-point CSS coordinate may be written directly into the canonical physical model.

A page resize or preset change is a `SetPageGeometry` command. It MUST define how existing regions are preserved, clipped, or reflowed; the default is preserve physical coordinates and report out-of-bounds regions rather than silently scaling engineering geometry.

## 8. Tables, diagrams and structural objects

Tables are typed data models, not just visual grids. Cell IDs and row/column IDs remain stable across sorting, resizing, insertion and deletion. Formula cells reference expression IDs or stable symbol IDs; formulas are never recovered by parsing formatted cell text.

Table-to-matrix/vector and matrix/vector-to-table operations are explicit Khwarizmi transformations with shape/type validation and provenance. External CSV/Excel sources are imported through an explicit adapter with source identity, refresh policy and conflict handling; an external file is never silently treated as a live calculation authority.

A beam/frame/diagram block stores structured entities and constraints (for example nodes, members, supports, loads, dimensions and result references). The BlockSuite canvas is a view/editor for this model. Shear-force, bending-moment, deflection and other plots are derived from calculation results and retain links to the source load cases and model revision. A drawing edit updates the structured model through a command; it does not create a disconnected picture as the sole source of truth.

## 9. Save, reload, collaboration and conflict handling

- Local-first save/reload MUST work without account, subscription, cloud, realtime or licensing services.
- The adapter MUST persist the canonical Khwarizmi model and the BlockSuite binding/mapping in one recoverable document transaction or a recoverable two-phase protocol.
- A failed write MUST leave the last committed revision recoverable.
- Reopen MUST reconstruct the same stable IDs, calculation order, physical geometry, authored values and extension data.
- Collaboration MAY transport BlockSuite transactions, but semantic conflicts are resolved against Khwarizmi commands and revision preconditions.
- Concurrent edits to different visual positions may merge; conflicting edits to the same semantic symbol/assignment or calculation-order list require deterministic conflict handling and a diagnostic.
- Cloud workspace support remains an optional adapter and MUST NOT be required for the local worksheet core.

## 10. Evaluation lifecycle

After an authored command commits, the adapter computes/obtains the canonical document revision digest. It sends the validated document (not editor internals) to the calculation host through the versioned RPC contract.

Evaluation results are accepted only if their document ID, revision digest, semantic version, unit registry version and engine version match the request. Results for an older revision may remain available as history but MUST be marked stale relative to the current document.

The editor renders result blocks from normalized result records and provenance. It MUST NOT persist a computed number back into an authored input or expression. Rounding and display formatting MUST NOT feed back into subsequent evaluation.

## 11. Versioning and migration

The adapter contract is independently versioned from the Khwarizmi document schema and BlockSuite release. The binding record stores both versions.

- A supported BlockSuite upgrade MUST pass adapter conformance tests before adoption.
- Migrations MUST preserve Khwarizmi stable IDs and authored semantics.
- Unknown Khwarizmi extension data MUST survive round-trip.
- Unsupported integration versions MUST fail with an explicit compatibility error; no silent downgrade.
- BlockSuite model migration MUST NOT implicitly migrate calculation semantics. Those are handled by Khwarizmi document migrations.

## 12. Required conformance tests

1. Create/edit/save/reopen a multi-page worksheet and compare canonical authored documents.
2. Move/reorder a math block visually and prove evaluation results and calculation order are unchanged.
3. Explicitly change calculation order and prove the new sequence is applied.
4. Undo/redo a variable assignment and verify assignment versions and revision digests.
5. Resize a page and prove physical micrometre geometry is deterministic.
6. Edit a table cell, convert table ↔ matrix/vector, save/reopen, and preserve IDs/provenance.
7. Edit beam/frame geometry and prove the structured model—not a screenshot—is persisted.
8. Recompute shear/moment diagrams and verify they are tied to the correct source revision.
9. Reject stale evaluation results after an authored edit.
10. Save/reopen in local-only mode with cloud services disabled.
11. Simulate an unknown BlockSuite transaction and prove it cannot mutate calculation meaning.
12. Run the adapter suite against every supported BlockSuite version and the mandatory Windows host build.

## 13. Implementation sequence

1. Implement the canonical document bridge and stable ID mapping.
2. Add command/transaction origin tagging and atomic save/reload.
3. Implement text, math, variable/input and result block adapters.
4. Add table and structured diagram adapters after the basic command model is stable.
5. Connect evaluation snapshots through the calculation-host RPC contract.
6. Add collaboration as an optional transport adapter only after local-only conformance passes.

This contract defines the boundary and acceptance tests. It does not claim that these BlockSuite adapters or engineering blocks are already implemented.
