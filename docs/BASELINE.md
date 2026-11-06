# Repository baseline

**Status:** baseline identified; runtime and packaging verification still open  
**Baseline source:** AFFiNE fork at `b2c882c8de221af6c3eaa424ca150711309701ff`  
**Khwarizmi baseline ref:** `khwarizmi/baseline`  
**Working branch:** `canary`

## Foundation and provenance

Khwarizmi starts from the AFFiNE repository, not from a new application scaffold. AFFiNE is the application foundation; BlockSuite is the editor foundation. The baseline is intentionally retained before Khwarizmi-specific product changes so upstream behavior remains inspectable.

The root package identifies itself as `@affine/monorepo` version `0.27.5`, with Yarn workspaces spanning BlockSuite, packages, tools, tests, and docs. The repository also contains a Rust Cargo workspace for native components. This is an inherited monorepo; it is not yet a Khwarizmi-only codebase.

## Reproducible toolchain (observed)

| Tool | Repository pin / requirement |
|---|---|
| Node.js | `.nvmrc` = 22.23.4; package engine `>=22.12.0 <23.0.0` |
| Package manager | Yarn 4.18.0 via Corepack / checked-in Yarn release |
| Rust | `rust-toolchain.toml` (rustup-managed; verify exact components on setup) |
| JS runtime | Node.js; workspaces use Yarn node-modules linker |
| Native build | Rust + NAPI bindings |
| Desktop | Electron / Electron Forge + custom NSIS packaging |
| Tests | Vitest, Playwright, BlockSuite integration/E2E suites |

The root `postinstall` invokes `yarn affine init` and Husky. `.yarnrc.yml` has `enableScripts: false`; build prerequisites and explicit native build commands matter. Do not assume a plain package install is sufficient.

## Baseline build instructions

From a clean clone on Windows:

1. Enable Windows Developer Mode (the inherited source uses symbolic links) and configure Git symlink support.
2. Install Node.js 22.23.4.
3. Enable Corepack and verify `yarn -v` reports 4.18.0.
4. Install the Rust toolchain declared in `rust-toolchain.toml`.
5. Clone the Khwarizmi repository and install with `yarn install`.
6. Build the Windows native module using the command documented by the desktop build guide / workflow.
7. Build and launch the Electron desktop app using the repository's Electron workspace scripts.
8. Record OS build, Node/Yarn/Rust versions, exact commit, commands, and logs.

Upstream build instructions in `docs/BUILDING.md` are explicitly marked as potentially outdated and primarily describe the inherited AFFiNE web workflow. They are reference material, not a verified Khwarizmi Windows runbook.

## Verification ledger

| Item | State | Evidence / remaining work |
|---|---|---|
| AFFiNE origin and baseline ref | Identified | Fork baseline commit above |
| BlockSuite foundation | Identified | Inherited workspace and editor packages |
| Node/Yarn versions | Recorded | `.nvmrc`, root `package.json`, `.yarnrc.yml` |
| Rust toolchain | Partially recorded | Pin file exists; verify exact installed components |
| License provenance | Partial | Root license identifies MIT portions and separate backend/native licensing; inventory all package-level licenses and notices |
| Clean install | Not verified here | Run on clean Windows checkout |
| Unmodified app launch | Not verified here | Run and record screenshot/log/commit |
| Windows ZIP/Squirrel/NSIS package generation | Builds | PR #1 workflow reached all three package build steps |
| Packaged-app smoke tests | Re-test in progress | The Squirrel bootstrapper may exit after handing off to the installed app. PR #1 smoke test now checks for the actual packaged executable process at its installed path; fresh Windows run pending |
| Release artifacts | Not verified | Upload step skipped after smoke-test failure |

## Packaging gate: PR #1

PR #1 remains draft and unmerged. Latest checked head before the smoke-test correction: `3608823d82affeced4195d910d905e12c14f3ef9`. The correction and formatting fixes are committed on `khwarizmi/pr-1-windows-only`; the latest Windows workflow is still running.

The previous Windows workflow successfully built ZIP, Squirrel, and NSIS packages. Its smoke test treated the Squirrel bootstrapper's successful exit (code 0) as an application failure. The corrected smoke test now observes a process whose executable path matches the packaged application and verifies that it remains available for a startup observation window. A fresh run must pass before this gate is closed.

The latest general Build & Test run before the final formatting fix failed on:
- inherited i18n code generation reporting generated changes were not submitted;
- Oxfmt formatting in two PR #1-modified Electron files (now corrected on the PR branch; a fresh run is required);
- one BlockSuite cross-browser shard, where the browser connection closed during the test.
Several other E2E shards, native builds, Electron renderer build, and static analysis jobs passed. These failures are recorded separately from the Windows package-specific validation.

PR #1's stated purpose is Windows x64 release packaging. It intentionally leaves general cross-platform validation workflows intact. Separate packaging-specific success from unrelated upstream CI failures, but do not ignore failures without documenting whether they are required checks.

## License and upstream inventory

The root `LICENSE` explains that:
- much of the repository is MIT-licensed under `LICENSE-MIT`;
- `packages/backend` and `packages/common/native`, where present, have separate licensing terms;
- third-party components retain their upstream licenses.

No top-level `NOTICE` or `COPYING` file was found during this audit. This is not proof that no additional notices exist. Before redistribution, inventory nested LICENSE/NOTICE files, package manifests, bundled binaries/assets, Rust crates, and third-party notices. Preserve upstream copyright and attribution.

## Baseline exit criteria

The baseline is complete only when:
- a clean Windows checkout can install, build, launch, and run the inherited desktop app;
- the exact toolchain and commands are recorded and repeatable;
- Windows package smoke tests verify actual installed/launchable outputs;
- upstream license/notice inventory is recorded;
- inherited versus Khwarizmi-owned code boundaries are documented.

Until then, treat the baseline as established but not fully validated.
