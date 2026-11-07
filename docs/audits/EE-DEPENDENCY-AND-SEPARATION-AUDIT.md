# AFFiNE EE Dependency & Import Audit — File-by-File Separation Plan

**Repository:** [Mujshanan/Khwarizmi-Studio](https://github.com/Mujshanan/Khwarizmi-Studio)  
**Audit snapshot:** branch `khwarizmi/compute-engine-adapter`, commit `6b391ca9123513fe1d58edf5a4d0c72ce2e22153`  
**Prepared:** 2026-11-07  
**Status:** static repository/import audit; implementation separation not yet performed.


## Project scope and compatibility policy

This repository is currently a **structural engineering package development and testing effort within the AFFiNE-derived repository**. It is not being treated as a standalone project, independent application, or separate distribution target at this stage. AFFiNE remains the host application and BlockSuite remains the selected editor foundation; Khwarizmi engineering capabilities are developed and validated as an integrated package layer in this repository.

The native-boundary implementation must follow the decision **API-compatible, implementation-independent**: preserve the existing AFFiNE-facing integration contracts and expected behaviour where they are needed by the host, while removing dependencies on AFFiNE Enterprise Edition source implementations. Compatibility is required at the API/integration boundary; copying, wrapping, relocating, or retaining a dependency on EE implementation source is not an acceptable substitute. This boundary is an internal separation measure and does not change the project's current integrated test-project scope.

## Executive conclusion

The Khwarizmi calculation-contract work in PR #9 and PR #10 is currently separated from the AFFiNE EE source directories. However, the inherited AFFiNE desktop/native foundation is **not yet EE-independent**: the frontend native crate imports `affine_common::hashcash::Stamp` from `packages/common/native`, which the repository root licence expressly places under the AFFiNE EE licence. The Electron helper process imports `@affine/native`, and the Electron package declares `@affine/native` as a development/build dependency. The native package is built through NAPI-RS from the frontend native crate.

Therefore, do not treat the existing desktop build chain as clean for an independent Khwarizmi product until that dependency is removed and verified. The backend server and backend native crates are also entirely within EE-scoped directories and must remain quarantined from any Khwarizmi product build or distribution.

This does **not** require abandoning AFFiNE or BlockSuite. Keep BlockSuite as the chosen editor foundation, retain only the AFFiNE application pieces that pass the separation gates, and make the local-first Khwarizmi app independent of AFFiNE's EE backend and cloud product services.

## 1. Licence boundary established from repository files

The root `LICENSE` states that:

- `packages/backend/**` is licensed under the AFFiNE EE licence at `packages/backend/server/LICENSE`.
- `packages/common/native/**` is licensed under the AFFiNE EE licence.
- Content outside those directories is generally covered by the root MIT licence, subject to third-party components and their original licences.

The tree contains **1,203 files** under `packages/backend/` (909 in `backend/server`, 294 in `backend/native`) and **25 files** under `packages/common/native/`. The file-level inventory in [ee-file-separation-inventory.csv](./ee-file-separation-inventory.csv) records all **1,228 files** in those scoped directories and assigns a disposition to each.

The EE licence text permits copying/modification for development and testing without a subscription, but it does not grant general production, redistribution, sublicensing, or commercial-use rights. Moving a file to another directory, renaming it, or wrapping it does not remove its provenance or licence obligations. This report is a technical inventory, not legal advice.

## 2. Import and dependency graph

### 2.1 Confirmed EE path in the desktop native foundation

The confirmed chain is:

```text
Electron app package
  └─ devDependency: @affine/native
       └─ NAPI-RS package builds Rust crate affine_native
            ├─ packages/frontend/native/Cargo.toml
            │    └─ dependency: affine_common (path: packages/common/native)
            │         └─ feature: hashcash
            └─ packages/frontend/native/src/hashcash.rs
                 └─ use affine_common::hashcash::Stamp
```

Evidence inspected:

- Root `Cargo.toml` includes `packages/common/native`, `packages/backend/native`, and `packages/frontend/native` in the Cargo workspace.
- `packages/frontend/native/Cargo.toml` depends on `affine_common = { workspace = true, features = ["hashcash"] }`.
- `packages/frontend/native/src/hashcash.rs` imports `affine_common::hashcash::Stamp` and exposes N-API mint/verify functions.
- `packages/frontend/native/src/lib.rs` exports the `hashcash` module.
- `packages/frontend/native/package.json` builds the `affine_native` crate using `napi build -p affine_native`.
- `packages/frontend/apps/electron/package.json` declares `@affine/native` as a development/build dependency.
- `packages/frontend/apps/electron/src/helper/preview/index.ts` imports native functions from `@affine/native`; this proves the package is part of the Electron helper integration, though that particular helper uses the preview exports.

This is a real build/package dependency on EE-scoped source even though the TypeScript calculation-contract package itself does not import it. The exact runtime usage of the Hashcash exports by all AFFiNE UI flows was not required to establish the dependency: the Rust crate compiles the feature and links the EE-scoped crate.

**Required correction:** remove `affine_common` from the Khwarizmi product native dependency graph. If Khwarizmi does not need Hashcash, remove the wrapper and its export. If a challenge/anti-abuse function is required, specify the protocol and use an independently authored implementation or a separately licensed dependency. Do not transplant the AFFiNE source.

### 2.2 Backend EE boundary

- `packages/backend/server` contains the AFFiNE server package, API runtime, migrations, schema, plugins, and server tests. Its `package.json` depends on `@affine/server-native`.
- `packages/backend/native` is the `affine_server_native` Rust crate and has its own EE licence file. Its source includes backend runtime, entitlement, licence, payment, quota, permission, storage, search, and N-API facilities.
- `packages/backend/native` also depends on `affine_common`.

The Electron renderer/web package manifests inspected do not declare `@affine/server` or `@affine/server-native` as application dependencies. The backend is a separate AFFiNE service package. Keep it out of Khwarizmi application and product build graphs; do not assume that workspace co-location makes it a permissible dependency.

### 2.3 AFFiNE cloud/product coupling outside the EE directories

Several client-side packages are outside the two EE-scoped directory trees and are covered by the root MIT grant (subject to notices), but they are still coupled to AFFiNE cloud/self-hosted product APIs. This is a **functional integration dependency**, not by itself proof that those client files are EE-licensed.

Confirmed examples:

- `packages/frontend/core/src/modules/index.ts` imports and unconditionally calls `configureCloudModule` as part of `configureCommonModules`.
- `packages/frontend/core/src/modules/cloud/index.ts` registers AFFiNE account, server, subscription, quota, invoice, realtime, and self-hosted licence services.
- `packages/frontend/core/src/modules/workspace-engine/index.ts` registers both LOCAL and CLOUD workspace providers.
- `packages/frontend/core/src/modules/workspace-engine/impls/cloud.ts` implements cloud workspace storage and synchronisation through AFFiNE GraphQL and `@affine/nbstore/cloud`.
- `packages/frontend/core/src/modules/workspace-engine/impls/local.ts` is a separate local workspace provider and is a better starting point for a local-first Khwarizmi shell.
- `packages/frontend/core/src/modules/cloud/services/selfhost-license.ts` and `selfhost-generate-license.ts`, their stores, and the GraphQL operations under `packages/common/graphql/src/graphql/license/` call AFFiNE self-hosted licensing APIs.
- `packages/common/nbstore` contains local storage and cloud/synchronisation adapters; it should be split by capability rather than discarded wholesale.
- `packages/common/realtime` defines AFFiNE cloud/server realtime request and topic contracts. Reuse only behind an optional collaboration/server adapter.

These files are not automatically EE files simply because they call an EE server endpoint. Their source licence and API compatibility need to be reviewed independently. The separation goal is to make cloud-specific services optional, not to mislabel all client code as proprietary.

## 3. Khwarizmi PR #9 and PR #10 assessment

At the audit snapshot:

- PR #9: `feat(compute-engine): add isolated evaluator adapter and exact codecs`, head `khwarizmi/compute-engine-adapter`, base `khwarizmi/rpc-transport-conformance`, 13 changed files.
- PR #10: `feat: add deterministic document evaluation vertical slice`, head `khwarizmi/document-evaluation-v1`, base `khwarizmi/compute-engine-adapter`, 7 changed files.

The changed files are confined to:

- `packages/common/khwarizmi-contracts/**`
- `contracts/schemas/v1/evaluation-result.schema.json`
- `docs/architecture/**)

The package manifest identifies the new package as private `@khwarizmi/contracts`; its only declared development dependency is Vitest. The Compute Engine adapter receives an injected engine factory through a Khwarizmi-owned interface. The evaluator, codecs, validators, and RPC transport use local package modules and do not import AFFiNE backend/native packages.

**Assessment:** no direct EE import or package dependency was identified in PR #9 or PR #10. They can continue as isolated contract/evaluator work, with the explicit rule that no AFFiNE EE package or `affine_common` dependency is added to them. Do not yet integrate them into the inherited desktop app or claim that the overall application is EE-independent.

## 4. File-by-file separation plan

### 4.1 EE-scoped files — complete inventory

The CSV contains one row for every file under the two EE-scoped directory roots. Each row includes:

- exact repository path;
- licence scope and subsystem;
- observed dependency or role;
- recommended separation disposition;
- priority.

The general disposition is to preserve these files and their licence notices in the experimental AFFiNE testbed, but **exclude them from Khwarizmi product imports, builds, binaries, and distributions**. The few shared-native files with a confirmed frontend consumer are called out individually in the CSV.

### 4.2 Non-EE files that must change to remove the confirmed dependency

| File | Current role | Required change |
|---|---|---|
| `Cargo.toml` | Root Cargo workspace includes backend/native, common/native, and frontend/native | Keep as upstream testbed workspace if needed; create a product-target workspace/CI allowlist that does not build EE crates. Do not use `cargo build --workspace` as a product build. |
| `packages/frontend/native/Cargo.toml` | Declares path dependency `affine_common` with `hashcash` feature | Remove this dependency and feature from the Khwarizmi native target. |
| `packages/frontend/native/src/hashcash.rs` | Wraps `affine_common::hashcash::Stamp` in N-API | Remove if unused; otherwise replace with an independently authored implementation from a documented protocol or a separately licensed dependency. |
| `packages/frontend/native/src/lib.rs` | Exports `hashcash` module | Remove export with the wrapper, or point to the independent implementation. |
| `packages/frontend/native/package.json` | NAPI build target for `affine_native` | Keep only after the native crate has no EE dependency; add a CI proof for the dependency graph. |
| `packages/frontend/apps/electron/package.json` | Declares `@affine/native` as a build/dev dependency | Keep only if the rebuilt native package is clean; document its build-time role explicitly. |
| `packages/frontend/apps/electron/src/helper/preview/index.ts` | Imports preview exports from `@affine/native` | Can remain if the native package is clean; do not confuse preview usage with the Hashcash import. |
| `packages/frontend/core/src/modules/index.ts` | Always configures AFFiNE cloud module | Split local core modules from optional AFFiNE cloud/collaboration integration; local-only startup must not register cloud services. |
| `packages/frontend/core/src/modules/cloud/index.ts` | AFFiNE cloud/account/subscription/licence service composition | Move behind a separately selectable AFFiNE compatibility adapter or remove from the Khwarizmi app composition. |
| `packages/frontend/core/src/modules/workspace-engine/index.ts` | Registers LOCAL and CLOUD providers | Keep LOCAL as the default product path; register CLOUD only through an optional adapter. |
| `packages/frontend/core/src/modules/workspace-engine/impls/local.ts` | Local workspace implementation | Retain and validate as the local-first storage path. |
| `packages/frontend/core/src/modules/workspace-engine/impls/cloud.ts` | AFFiNE cloud storage and server sync | Isolate behind the optional server/collaboration adapter. |
| `packages/frontend/core/src/modules/cloud/services/selfhost-license.ts` | Self-hosted EE licence client | Exclude from Khwarizmi product composition unless a separately licensed server API is deliberately supported. |
| `packages/frontend/core/src/modules/cloud/services/selfhost-generate-license.ts` | AFFiNE licence-key generation client | Exclude from Khwarizmi product composition. |
| `packages/frontend/core/src/modules/cloud/stores/selfhost-license.ts` and `selfhost-generate-license.ts` | GraphQL client stores for AFFiNE licensing | Move with the optional AFFiNE adapter or remove. |
| `packages/common/graphql/src/graphql/license/**` | GraphQL operations for AFFiNE license APIs | Keep as upstream client code if needed; do not make them Khwarizmi core contracts. |
| `packages/common/nbstore/src/impls/cloud/**` and cloud sync modules | AFFiNE cloud persistence/synchronisation | Separate from local IndexedDB/SQLite storage; do not make cloud sync mandatory. |
| `packages/common/realtime/**` | AFFiNE server realtime protocol | Optional adapter only; Khwarizmi's document and calculation contracts remain transport-independent. |

The client-side paths above are identified for **functional decoupling**, not as additional EE-licensed directories.

### 4.3 Foundations to retain, subject to normal notice review

- `blocksuite/**`: retain BlockSuite as the editor foundation selected by the project. Keep Khwarizmi schema and calculation semantics independent of BlockSuite storage details.
- `packages/common/infra/**`: retain only the framework primitives actually needed by the chosen shell; avoid letting AFFiNE service composition become a Khwarizmi domain dependency.
- `packages/common/nbstore/**`: retain local storage primitives where useful; isolate cloud providers and AFFiNE server protocols.
- `packages/frontend/core/**`: do not wholesale delete; selectively retain shell, local workspace, navigation, and editor integration after module composition is split.
- `packages/common/graphql/**`: do not treat the entire package as EE; isolate AFFiNE server operations and keep Khwarizmi contracts in the separate `@khwarizmi/contracts` package.

## 5. Implementation sequence and gates

### Gate A — Preserve the clean calculation boundary

1. Keep PR #9 and PR #10 limited to Khwarizmi-owned contracts/evaluation code.
2. Add a package-level rule that `@khwarizmi/contracts` may not depend on `@affine/server`, `@affine/server-native`, `@affine/native`, or `affine_common`.
3. Finish contract tests independently of Electron and AFFiNE cloud services.

### Gate B — Remove EE native dependency from desktop

1. Confirm whether the product needs Hashcash at all.
2. Remove `affine_common` from `packages/frontend/native/Cargo.toml` and remove the Hashcash wrapper/export if unused.
3. If required, specify the protocol independently and use a new, independently licensed implementation. Do not copy source from `packages/common/native`.
4. Run `cargo tree -p affine_native` and assert that neither `affine_common` nor any `packages/backend/**` crate appears.
5. Build the NAPI native target on Windows, Linux, and macOS; inspect the resulting package/binary dependency manifests.

### Gate C — Make the app local-first and cloud-optional

1. Split `configureCommonModules` into Khwarizmi local core and optional AFFiNE compatibility modules.
2. Make local workspace/storage/editor startup work without registering `configureCloudModule`.
3. Move cloud workspace storage, realtime, self-hosted licensing, subscriptions, and cloud GraphQL operations behind explicit adapter boundaries.
4. Keep BlockSuite collaboration support under a separate adapter contract; do not assume that AFFiNE's backend is required for all Yjs collaboration use cases.

### Gate D — Product build and import policy

Add automated checks that fail if:

- product code imports `@affine/server`, `@affine/server-native`, or `affine_common`;
- a product build includes any source file under `packages/backend/**` or `packages/common/native/**`;
- the Khwarizmi contracts package imports AFFiNE app/backend packages;
- the local-only application startup registers AFFiNE cloud modules;
- a release artifact contains EE-scoped native libraries or server assets.

Keep separate CI jobs for (a) inherited AFFiNE testbed validation and (b) the Khwarizmi product-target allowlist. A green testbed job is not evidence that a distributable Khwarizmi build is licence-clean.

## 6. Audit limitations and evidence still required

This is a repository-wide **licence-scope inventory plus static package/import-path audit** based on the Git tree, root and package manifests, Cargo manifests, application entry points, and the relevant source files listed above. GitHub code search returned no indexed code matches for the key symbols, and a local sparse clone could not be completed in this environment because GitHub DNS resolution failed. Therefore the audit does not claim a locally executed, exhaustive AST-level import scan or successful build.

Before any release/distribution decision, run the proposed local checks in CI and inspect the actual build metafiles and native dependency tree. Also complete the separate third-party licence/notice inventory required by the root MIT licence.

## Decision

**Do not invest in new application features on top of the current AFFiNE native/cloud integration until Gates B and C are complete.** PR #9 and PR #10 may continue as isolated Khwarizmi calculation-contract work because their current changed files are outside the EE directories and have no identified EE imports. Keep AFFiNE backend code quarantined, remove the confirmed `affine_common` path from the desktop native build, and make cloud/collaboration an optional adapter rather than a foundational dependency.
