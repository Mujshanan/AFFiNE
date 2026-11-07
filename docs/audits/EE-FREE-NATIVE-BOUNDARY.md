# EE-Free Native Boundary

**Status:** implementation candidate; awaiting repository CI and platform validation.  
**Scope:** AFFiNE-derived repository, frontend native package only.  
**Compatibility policy:** API-compatible, implementation-independent.

## Change made

The frontend native crate no longer declares `affine_common` as a dependency and no longer imports `affine_common::hashcash::Stamp`. The transitive path through `affine_nbstore` is also removed: its `affine_common::napi_utils::to_napi_error` helper call is replaced with an equivalent local N-API error conversion, and the existing `napi` Cargo feature is retained as an empty compatibility feature. The existing N-API surface remains unchanged:

- `verify_challenge_response(response, bits, resource)`
- `mint_challenge_response(resource, bits)`

The functions remain asynchronous N-API tasks and retain their existing argument and return types. The `hashcash` module remains publicly exported from `affine_native`, so consumers do not need an import-path change.

The Hashcash implementation is maintained in `packages/frontend/native/src/hashcash.rs`, in the MIT-scoped frontend native package. The nbstore error conversion is maintained in `packages/frontend/native/nbstore/src/lib.rs`. It uses the existing workspace SHA3 dependency and direct workspace dependencies for randomness and hex encoding. It does not import, wrap, copy, or link the EE-scoped Rust crate.

## v1 wire compatibility

The implementation preserves the seven-field v1 stamp representation:

```text
version:claim:timestamp:resource:extension:salt:counter
```

It preserves the SHA3-256 proof construction, hexadecimal counter, resource binding, five-minute expiry, default mint difficulty, and the legacy v1 whole-hex-nibble verification rule. The legacy verifier checks `floor(claim / 4)` leading zero nibbles, while minting produces `ceil(claim / 4)`; this historical asymmetry is intentionally retained for existing v1 compatibility rather than silently changing the wire protocol.

The parser enforces a v1 claim range of 1–256, while minting is deliberately capped at 24 bits to prevent unbounded proof-of-work requests from monopolizing a native worker. It also uses strict timestamp parsing, malformed-field rejection, and checked counter increment. A future protocol revision should define bit-precise difficulty and stronger expiry/replay semantics as a versioned change, not as an undocumented alteration to v1.

## Dependency boundary

The root Cargo workspace may still contain `packages/common/native` for other inherited AFFiNE workspace members. That fact alone does not make it a dependency of the frontend native package. The required proof is the resolved dependency graph for `affine_native`, not the presence or absence of a workspace member declaration.

Run from the repository root:

```sh
cargo tree -p affine_native -e normal
cargo tree -p affine_native -i affine_common
```

The first command must contain no `affine_common` node, including transitive nodes reached through `affine_nbstore`. The second command must report that no matching package is in the dependency graph (or be replaced by an equivalent machine-checked assertion in CI).

## Required validation gates

- Rust formatting and lint: `cargo fmt -p affine_native -p affine_nbstore -- --check`, `cargo clippy -p affine_native --all-targets -- -D warnings`.
- Native unit tests: `cargo test -p affine_native -p affine_nbstore`.
- Dependency graph: the two commands above.
- Windows is mandatory: `cargo check -p affine_native --target x86_64-pc-windows-msvc` and the repository's Windows N-API packaging/build job.
- Verify the generated Windows N-API artifact still exports both existing Hashcash functions.
- Inspect the final native artifact and dependency/license inventory; do not include EE-scoped source or binaries.
- Re-run the repository's relevant desktop CI on this branch and inspect all job results.

These commands and platform gates are requirements, not claims that they have already passed. This change is not considered complete until the Windows job, dependency-tree check, and artifact inspection succeed.

## Explicitly out of scope

This change does not remove EE-scoped backend/server code from the upstream AFFiNE repository, remove the root Cargo workspace member, redesign cloud services, or declare the entire inherited AFFiNE application EE-independent. It closes the identified direct EE dependency from the frontend native crate only. Any additional transitive or packaging path must be found by the dependency-tree and artifact gates above.
