# Khwarizmi TypeScript contract validators

This workspace package provides the first executable TypeScript validation layer for the language-neutral v1 contracts.

## Responsibilities

- `validateJsonSchema` evaluates the JSON Schema vocabulary currently used by the checked-in v1 contract bundle, including local and relative `$ref`, `oneOf`, `allOf`, `if`/`then`/`else`, object constraints, tuple arrays (`prefixItems`), and scalar/array constraints.
- `validateCalculationSemantics` checks document-wide identity, normalized names, calculation-order completeness, symbol bindings, lexical local visibility/no-shadowing, source-map and authored-number paths, and unit references.
- `validateDependencyGraph` rejects cycles in persisted dependency snapshots.
- `validateUnitRegistrySemantics` checks unit/prefix identity, exact positive scales, and canonical dimension vectors.
- `validateUnitReference` distinguishes unknown units from the v1-rejected affine temperature units.
- `validateDiagnosticRegistrySemantics` and `validateDiagnosticCodeMembership` enforce the stable diagnostic registry.

## Deliberate boundary

The schema evaluator is a fail-closed interpreter for the exact JSON Schema vocabulary used by the checked-in contracts; it is **not** advertised as a general-purpose implementation of every JSON Schema 2020-12 keyword. Adding a new keyword to a contract schema requires adding its semantics and tests before that schema change is accepted. This avoids silently ignoring constraints.

The package does not yet evaluate mathematical expressions, run the Compute Engine adapter, verify RFC 8785 document digests, implement RPC framing, or prove Windows host isolation. Those remain separate conformance workstreams.

## Test coverage

`src/contract-validators.spec.ts` loads the checked-in schema bundle and fixture manifest, validates manifest uniqueness and paths, the diagnostic and unit registries, schema-bearing fixture payloads, and expected diagnostics for semantic-validation fixtures. Authoring-parse and evaluation expectations are not executed by this package; mathematical evaluation remains a separate phase.

Run from the repository root:

```sh
yarn vitest run packages/common/khwarizmi-contracts/src/contract-validators.spec.ts
```
