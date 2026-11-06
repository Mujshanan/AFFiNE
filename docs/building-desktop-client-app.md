# Building Khwarizmi for Windows

Khwarizmi is built and packaged as a **Windows x64 Electron desktop application**.
This repository intentionally does not produce macOS, Linux, Android, iOS, or
standalone web release artifacts.

The Electron renderer is still required: it is the UI embedded inside the
Windows desktop application, not a separately shipped web product.

## Prerequisites

Follow the prerequisites in [BUILDING.md](./BUILDING.md), including:

- Node.js 22.12.x
- Yarn 4 through Corepack
- Rust toolchain pinned by `rust-toolchain.toml`
- Visual Studio C++ Build Tools and the Windows SDK
- Windows Developer Mode and Git symbolic-link support

## Build and package

Run these commands from the repository root in PowerShell:

```powershell
$env:BUILD_TYPE = "canary"
$env:DISTRIBUTION = "desktop"
$env:SKIP_WEB_BUILD = "1"

yarn install
yarn affine @affine/native build
yarn affine @affine/electron generate-assets
yarn affine @affine/electron build

# Reinstall using the workspace hoisting layout required by Electron packaging.
yarn config set nmMode classic
yarn config set nmHoistingLimits workspaces
yarn install

$env:HOIST_NODE_MODULES = "1"
yarn affine @affine/electron make --platform=win32 --arch=x64
yarn affine @affine/electron make-nsis
```

The Windows build produces a portable ZIP, a Squirrel installer, and an NSIS
installer under:

`packages/frontend/apps/electron/out/canary/make`

Change `BUILD_TYPE` to `stable`, `beta`, or `internal` when preparing
those channels. The GitHub Actions workflow
[`windows-desktop.yml`](../.github/workflows/windows-desktop.yml) runs the
same Windows x64 packaging path.

## Scope

- Supported build target: Windows x64 (`win32-x64`)
- Desktop runtime: Electron
- UI: Electron renderer
- Installer formats: ZIP, Squirrel, and NSIS
- No cross-platform packaging or mobile release jobs
