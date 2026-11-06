# Architecture contract conformance

**Status:** test plan; executable suite still required  
**Rule:** the implementation does not pass this phase merely because schemas compile. Contract fixtures must be consumed by independent producer and consumer implementations.

## 1. Test layers

1. **Schema tests:** valid and invalid documents, ASTs, RPC requests, responses, errors, and diagnostics.
2. **Semantic tests:** symbols, dependencies, cycles, evaluation ordering, substitutions, quantities, and units.
3. **Persistence tests:** canonical serialization, round trips, stable IDs, unknown extension preservation, and migrations.
4. **Transport tests:** byte framing, fragmented reads/writes, malformed frames, size limits, correlation, cancellation, and disconnects.
5. **Security tests:** unauthorized pipe client, pipe squatting, wrong process identity, remote connection rejection, and shutdown behavior.
6. **Interoperability tests:** TypeScript client and host modules must consume the same language-neutral fixtures. A second independent implementation is deferred to a later interoperability milestone; no Python worker is required in v1.

## 2. Required fixture layout

Proposed location:

```text
contracts/
  document/
    valid/
    invalid/
    migrations/
  expression/
    valid/
    invalid/
  evaluation/
    dependencies/
    cycles/
    substitutions/
    errors/
  units/
    compatible/
    incompatible/
    conversions/
  rpc-v1/
    framing/
    requests/
    responses/
    errors/
    cancellation/
    malformed/
  manifest.json
```

Every fixture has a stable ID, contract version, input payload, expected outcome, and expected diagnostic/error code where relevant. Numeric fixtures state precision and tolerance explicitly. Initial schemas and seed fixtures live under `contracts/schemas/v1` and `contracts/fixtures/v1`. MathJSON structural validation is distinct from Khwarizmi semantic validation.

## 3. Minimum document tests

- valid minimal document and valid multi-page document;
- duplicate page/block/region IDs;
- missing required fields and unknown major schema version;
- geometry outside page bounds, negative dimensions, non-finite values;
- stable identity after reorder;
- unknown extension round trip;
- deterministic migration from each supported prior schema;
- authored content remains unchanged when evaluation snapshots are refreshed;
- stale snapshot detection after a calculation input changes.

## 4. Minimum AST and semantic tests

- exact numeric literal and basic arithmetic;
- operator precedence and explicit grouping;
- unary operators;
- valid and invalid function arity;
- unknown function/operator rejection;
- valid symbol resolution and unresolved symbol diagnostics;
- duplicate symbol names and stable symbol-ID resolution;
- deterministic topological evaluation order;
- dependency cycle detection including self-cycle;
- independent-node evaluation order deterministic under input permutation;
- substitutions preserve units and use resolved values;
- errors retain source block/node locations.

## 5. Minimum unit tests

- same-dimension addition/subtraction;
- compatible unit conversion;
- multiplication/division dimension composition;
- valid/invalid powers;
- dimensionless and angle handling;
- incompatible addition/comparison;
- unknown unit and invalid prefix;
- absolute temperature versus temperature difference (if supported);
- no display rounding fed back into computation.

## 6. Minimum RPC tests

- canonical JSON-RPC 2.0 request/response round trip;
- string and integer IDs, unknown method, invalid params, invalid envelope;
- 4-byte little-endian framing;
- split prefix, split payload, multiple frames in one read, truncated frame;
- zero-length and >16 MiB payload rejection;
- malformed UTF-8 and malformed JSON;
- duplicate in-flight ID;
- response correlation under concurrent requests;
- cancellation before start, during evaluation, after completion, repeated cancellation;
- host crash and disconnect while calls are in flight;
- digest match and mismatch using RFC 8785 JCS;
- no batch acceptance;
- no arbitrary code/path execution through method parameters.

## 7. Python worker tests

- supported operation success with typed output;
- invalid input rejected by TypeScript before dispatch;
- malformed worker output rejected;
- timeout and worker termination normalized;
- Python worker cannot resolve symbols or mutate document state;
- deterministic result contract for each supported numerical operation.

## 8. Test harness requirements

- Fixtures are language-neutral JSON and are version-controlled.
- Expected outputs are reviewed and not generated from the implementation under test.
- Tests must assert stable error codes, not fragile error prose.
- Property-based tests cover AST depth, graph topology, numeric edge cases, and frame fragmentation.
- Golden outputs are canonicalized before comparison.
- Contract changes require updating fixtures and compatibility notes in the same change.
- CI must run schema, semantic, persistence, and transport tests without requiring the production host.

## 9. Exit criteria

The phase is complete only when:
- the schema and wire contracts have no unresolved normative ambiguity;
- fixture manifest and all required fixtures exist;
- the TypeScript validators and semantic contract tests pass;
- RPC framing/client conformance tests pass;
- error codes and diagnostics are stable and location-aware;
- the independent fake-host integration test passes;
- Windows pipe security and lifecycle tests are demonstrated or explicitly blocked pending packaged runtime validation;
- CI runs the contract suite on every relevant change.

No editor-wide implementation or production calculation-host implementation should begin before these exit criteria are met.

## 10. Published v1 semantic fixture inventory

The authoritative fixture manifest is `contracts/fixtures/v1/manifest.json`. It covers scalar expression acceptance and vector rejection; sequential reassignment snapshots; no-shadowing and local-scope leakage; failed assignment propagation; branch selection; loop resource limits; substitution provenance; exact decimal/rational and tagged approximate values; compatible-unit conversion and dimensional mismatch; temperature rejection; valid and invalid document-evaluation digests; and cancellation notification shape.

The schemas and fixtures are language-neutral. A validator must load fixture files by manifest path, reject duplicate fixture IDs, validate each file against its schema, and then run semantic assertions. Expected outcomes are not embedded in the implementation under test.

## 11. Remaining implementation conformance

This contract-definition pass does not claim that TypeScript validators, Compute Engine adapter tests, transport tests, or CI jobs already exist. The next phase must implement schema resolution (including relative references), the MathJSON profile validator, worksheet semantic validator, numeric/unit codecs, deterministic diagnostic sorting, fixture runner, and RPC framing tests. Only after those tests pass may the semantic contract be marked implementation-conformant.
