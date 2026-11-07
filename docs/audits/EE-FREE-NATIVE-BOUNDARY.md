# EE-Free Native Boundary

**Status:** native implementation, dedicated conformance checks, Windows x64/ARM64 builds, and static artifact inspection completed; final license-policy CI rerun is pending.  
**Scope:** AFFiNE-derived repository, frontend native package and its `affine_nbstore` dependency only.  
**Compatibility policy:** API-compatible, implementation-independent.

## Change made

The frontend native crate no longer declares `affine_common` as a dependency and no longer imports `affine_common::hashcash::Stamp`. The transitive path through `affine_nbstore` is also removed: its `affine_common::napi_utils::to_napi_error` helper call is replaced with the same `napi::Error::new(status, err.to_string())` mapping, and the existing `napi` Cargo feature is retained as an empty compatibility feature.

The existing N-API surface remains unchanged:

- `verify_challenge_response(response, bits, resource)`
- `mint_challenge_response(resource, bits)`

The functions remain asynchronous N-API tasks and retain their existing argument and return types. The `hashcash` module remains publicly exported from `affine_native`, so consumers do not need an import-path change.

The Hashcash implementation is maintained in `packages/frontend/native/src/hashcash.rs`, within the MIT-scoped frontend native package. The nbstore error conversion is maintained in `packages/frontend/native/nbstore/src/lib.rs`. It uses the existing workspace SHA3 dependency and direct workspace dependencies for randomness and hex encoding. It does not import, wrap, copy, or link the EE-scoped Rust crate.

## v1 wire compatibility and deliberate input hardening

The implementation preserves the seven-field v1 stamp representation:

```text
version:claim:timestamp:resource:extension:salt:counter
```

For positive difficulty values, it preserves the SHA3-256 proof construction, hexadecimal counter, resource binding, five-minute expiry, default mint difficulty, and the legacy v1 whole-hex-nibble verification rule. The legacy verifier checks `floor(claim / 4)` leading zero nibbles, while minting produces `ceil(claim / 4)`; this historical asymmetry is intentionally retained for existing v1 compatibility rather than silently changing the wire protocol.

Input hardening is deliberate and must be visible to callers:

- Parsed v1 claims are restricted to 1–256.
- Mint difficulty is restricted to 1–24 to prevent unbounded proof-of-work requests from monopolizing a native worker.
- Zero-bit mint requests, zero-claim stamps, and zero-bit verification requests are rejected. The old implementation accepted these degenerate zero-difficulty cases; they are intentionally no longer accepted because they provide no proof-of-work protection.
- Timestamps are validated during parsing and counter increment is checked for overflow.

A future protocol revision should define bit-precise difficulty and stronger expiry/replay semantics as a versioned change, not as an undocumented alteration to v1.

## Dependency and licensing boundary

The root `LICENSE` states that content outside `packages/backend` and `packages/common/native` is available under `LICENSE-MIT`; `packages/common/native` carries the EE license. The changed frontend native source and manifests are outside the EE-scoped directory. The workspace may still contain `packages/common/native` for other inherited AFFiNE workspace members; that fact alone does not make it a dependency of the frontend native package.

The authoritative dependency proof is the resolved graph for both relevant packages, including all dependency kinds:

```sh
cargo tree -p affine_native -e all
cargo tree -p affine_nbstore -e all
```

Neither graph may contain `affine_common`. The dedicated CI checks this assertion and scans all tracked files under `packages/frontend/native` for EE crate/source references. The repository's `deny.toml` is the third-party license allowlist; the dedicated CI now also runs `cargo deny check licenses` so the lockfile's dependency license policy is checked rather than inferred from package names.

The native-only CI run on commit `987297d83bcf3db953b0330af85fa910a1dcaf50` passed the direct-import scan, all-edge `affine_native` dependency graph, Rust formatting, both native test suites, and Clippy with warnings denied. The expanded two-package graph and cargo-deny license check were added afterward and require a fresh CI pass.

## Windows build and artifact inspection

The inherited Build & Test run `42351961628` completed both mandatory Windows native build jobs successfully:

| Target | Artifact | SHA-256 of downloaded ZIP | PE machine |
|---|---|---|---|
| Windows x64 | `affine.win32-x64-msvc.node` | `824bcfc3d2392032a2743929384436dee077b485908ac66a548cd652dad80a30` | `0x8664` (AMD64) |
| Windows ARM64 | `affine.win32-arm64-msvc.node` | `4ed7d075f452db5dfd8c6abfa18d569a38688c15717c758adaf9952372a927d4` | `0xAA64` (ARM64) |

Both downloaded ZIP hashes match the SHA-256 artifact digests reported by GitHub Actions. Each archive contains the expected single `.node` binary, with a valid PE signature and the expected machine architecture. Both binaries contain the N-API registration identifiers `verify_challenge_response` and `mint_challenge_response`.

This is static artifact inspection, not a runtime load test on Windows. The inherited CI confirms successful native builds and artifact uploads; it does not by itself prove a full packaged desktop install/launch/uninstall cycle.

## Required validation gates and current disposition

- [x] Rust formatting: `cargo fmt -p affine_native -p affine_nbstore -- --check`.
- [x] Native unit tests: `cargo test -p affine_native -p affine_nbstore`.
- [x] Native lint: `cargo clippy -p affine_native -p affine_nbstore --all-targets -- -D warnings`.
- [x] Direct source-import scan for the targeted frontend native package.
- [x] All-edge dependency graph check for `affine_native` on the initial dedicated CI run.
- [x] Windows x64 and ARM64 native build jobs.
- [x] Downloaded Windows artifact integrity, PE architecture, and embedded N-API identifier inspection.
- [ ] Fresh CI pass for the expanded `affine_native` + `affine_nbstore` graph checks and `cargo deny check licenses`.
- [ ] Final inherited Build & Test run must finish; the inspected run had a repository-wide formatting failure in eight pre-existing files outside this PR's six-file change set (`docs/BASELINE.md`, architecture docs, and `docs/index.html`). Several E2E jobs were still running when inspected.
- [ ] Runtime loading of both Windows binaries and invocation of the two Hashcash N-API functions on Windows.
- [ ] Full Windows desktop installer install/launch/uninstall smoke tests remain a separate repository-baseline/release-readiness gate.

Do not describe the entire inherited AFFiNE application as EE-independent after this work. This boundary closes the identified direct and transitive EE native dependency paths from the frontend native package only.

## Explicitly out of scope

This change does not remove EE-scoped backend/server code from the upstream AFFiNE repository, remove the root Cargo workspace member, redesign cloud services, or declare the entire inherited AFFiNE application EE-independent. Any additional transitive or packaging path must be found by the dependency-graph, license-policy, and platform checks above.
