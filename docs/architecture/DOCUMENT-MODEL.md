# Engineering document and worksheet model

**Status:** v1 proposal for schema review  
**Owner:** Khwarizmi Core  
**Not owned by:** BlockSuite internals or the renderer's transient state

## 1. Design goals

- Persist a durable, versioned engineering worksheet.
- Preserve authored material independently of calculation outputs.
- Support page-oriented A4 and custom-size documents.
- Support text, equations, variables, input data, tables, diagrams, references, and result regions.
- Support flexible multi-column placement and side-by-side input/expression/result layouts.
- Keep stable IDs across reorder, editing, save/reload, and migration.
- Make document migrations explicit and testable.

## 2. Document envelope

The native format is a JSON document (proposed extension: `.mpad.json`). The envelope contains:
- `format`: stable format identifier, `khwarizmi.document`;
- `schemaVersion`: integer schema version;
- `documentId`: stable UUID;
- `metadata`: title, authoring metadata, created/modified timestamps;
- `settings`: locale, display preferences, default unit system, page defaults;
- `pages[]`: ordered page records;
- `assets[]`: content-addressed references to embedded images/attachments;
- `extensions`: namespaced forward-compatible extension data.

Evaluation output is not authored content. It is stored separately as a derived snapshot keyed by document revision and calculation-engine contract/version. A stale snapshot MUST be detectable and MUST NOT silently replace authored values.

## 3. Page model and coordinates

Each page has a stable `pageId`, a physical width and height, orientation, margins, and ordered layout regions.

**Proposed canonical geometry:** integer micrometres (`um`) for page dimensions, margins, and region geometry. Convert to CSS pixels only at the rendering boundary using the configured display scale. This prevents zoom and device pixel ratio from changing persisted physical layout. The exact canonical unit remains an ADR sign-off item.

A region has:
- stable `regionId`;
- `kind` (flow, grid, column, or positioned);
- physical bounds `x, y, width, height`;
- z-order where overlap is supported;
- child block IDs and region-specific layout properties.

Coordinates are page-local, top-left origin, positive x rightward and positive y downward. Geometry MUST be finite, non-negative where applicable, and within declared page bounds unless an explicit overflow policy is enabled. Renderer zoom/pan is view state and MUST NOT be persisted as page geometry.

## 4. Block model

Every block has a stable `blockId`, a `type`, a `contentVersion`, and authored `content`. Initial logical block types:

- `text`: rich text and headings;
- `math`: canonical expression AST plus optional display/editor interchange data;
- `variable`: explicit variable declaration/assignment;
- `input`: user-supplied scalar or structured input;
- `table`: typed cells and optional calculated bindings;
- `diagram`: asset or structured diagram reference;
- `reference`: citation/standard/source metadata;
- `result`: reference to a calculated expression or named result;
- `group`: semantic grouping of child blocks.

A block's display style is not its semantic type. A result region cannot redefine a variable by virtue of being visually placed after another block.

## 5. Ordering and identity

Page order, region order, and block order are explicit. IDs are immutable once persisted. Reordering changes ordering metadata, not identity. References target stable IDs or explicit symbol IDs, never array indices or display labels.

## 6. Persistence and migration

- Schema versions are integer and monotonically increasing.
- Readers MUST reject unknown major versions with a clear compatibility error.
- Migrations are deterministic, version-to-version functions.
- Migrations MUST preserve stable IDs and authored values.
- Evaluation snapshots are invalidated when authored calculation inputs or semantic schema versions change.
- Unknown namespaced extension data SHOULD be preserved through read/write round trips.
- Save/load round-trip tests MUST compare canonicalized authored documents.

## 7. BlockSuite adapter boundary

BlockSuite may represent and edit visual blocks, selection, and ordering. An adapter maps BlockSuite transactions into Khwarizmi document commands. The adapter MUST:
- validate incoming commands against the Khwarizmi schema;
- preserve stable IDs;
- avoid storing calculation truth only in editor-specific properties;
- keep editor undo/redo synchronized with document commands;
- serialize the canonical Khwarizmi document, not a raw BlockSuite snapshot as the sole source of truth.

## 8. Open schema decisions

- Confirm integer micrometres as canonical physical unit.
- Finalize layout region grammar and responsive behavior.
- Finalize asset embedding versus external references and size limits.
- Decide whether block content versions are independent from document schema version.
- Define stable symbol-ID syntax and migration rules.
