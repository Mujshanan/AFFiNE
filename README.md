# Khwarizmi Studio — Structural Engineering Package Test Project

<p align="center"><img src="assets/khwarizmi-logo.svg" alt="Khwarizmi Studio logo" width="112" /></p>

**An experimental structural engineering package test project within an AFFiNE-derived application repository.**

> [!IMPORTANT]
> **For now, this repository is a structural engineering package development and testing effort inside the existing AFFiNE-derived repository. It is not a standalone project, an independent application, a finished product, or a production-ready engineering tool.** The immediate goal is to test how structural-engineering functionality and package integrations can work within the inherited AFFiNE/BlockSuite application foundation. A standalone product is not the current project scope.

## Purpose

This repository is used to develop and test a structural engineering package within an AFFiNE-derived application. Work includes:

- Establishing and validating the inherited AFFiNE/BlockSuite application baseline.
- Testing structural-engineering document, worksheet, calculation, table, diagram, and drawing workflows.
- Evaluating package integration and editor extensions needed by engineering use cases.
- Developing Khwarizmi-specific document, worksheet, and calculation contracts as an experimental layer within this repository.
- Recording architecture decisions and validating technical approaches against the existing application foundation.

The immediate objective is to validate structural-engineering package capabilities within the current AFFiNE-based repository. The project remains an integration and testing effort: it does not currently establish a separate application, standalone repository, or independent distribution target. Features and prototypes may be incomplete, temporary, or subject to replacement.

## What this repository is — and is not

| This repository is | This repository is not |
|---|---|
| A structural engineering package development and test project | A standalone project or independent application |
| An experimental engineering package within the AFFiNE-derived repository | A finished or production-ready product |
| A place for architecture prototypes and validation | A verified structural design or code-compliance tool |
| A structural-engineering test layer using AFFiNE/BlockSuite foundations | An official AFFiNE or BlockSuite distribution |
| A record of technical decisions and experiments | A supported end-user release |

Do not use builds, calculations, prototypes, or other outputs from this repository for real project design decisions. No engineering capability should be considered verified until its scope, assumptions, tests, and independent validation evidence are explicitly documented.

## Upstream foundations

This structural engineering package test project remains part of the AFFiNE-derived repository. It is based on the [AFFiNE](https://github.com/toeverything/AFFiNE) application and uses [BlockSuite](https://github.com/toeverything/BlockSuite) as its editor foundation. AFFiNE/BlockSuite are the current host and foundation; Khwarizmi is the engineering-focused package and experimental layer being developed and tested within that host.

The repository may contain substantial upstream code, packages, build tooling, assets, and documentation. The purpose of retaining this baseline is to develop and test structural-engineering functionality in the existing application context. Do not interpret Khwarizmi as a separate standalone application at this stage.

AFFiNE and BlockSuite are separate upstream projects. This repository is not an official distribution of either project, and their names and trademarks remain with their respective owners.

## Experimental Khwarizmi architecture

The experiments may include engineering-oriented foundations such as:

- A page-oriented worksheet and document model.
- Physical page geometry and layout contracts.
- Mathematical expression and variable semantics.
- Calculation evaluation, dependency tracking, and unit handling.
- Tables, diagrams, and engineering drawing concepts.
- Interfaces between the editor and a separate calculation host.

These are areas of investigation, not a statement that the corresponding features are implemented or ready for use. They are being developed as an engineering package layer within the AFFiNE-derived repository. Khwarizmi-specific document semantics and calculation behaviour should remain clearly separated from AFFiNE/BlockSuite internals where practical, while still integrating with the existing host application. This separation is an internal architecture boundary, not a declaration that the project is currently standalone.

## Development status

Work is organized through the [Development Plan](./DEVELOPMENT_PLAN.md) and the architecture records in [docs/architecture](./docs/architecture/README.md).

The current focus is validating the structural-engineering package inside the AFFiNE-derived repository: baseline and licence auditing, architecture contracts, and controlled package/workflow experiments. A successful build or passing package test does not establish that this repository is a standalone application or suitable for production engineering use or distribution.

## Licensing and third-party notices

This repository contains inherited AFFiNE code and third-party components. **Licensing must be assessed at the file and component level.** In particular, the upstream AFFiNE repository identifies `packages/backend/**` and `packages/common/native/**` as subject to the licence at `packages/backend/server/LICENSE`, while other portions have different licensing terms.

The presence of source code in this test repository must not be interpreted as permission to use, modify, redistribute, or deploy every component in production. Before distributing a build or using any inherited component beyond permitted development and testing, review the applicable licence, third-party notices, and any required commercial terms.

Preserve all upstream copyright notices and licence files. See [LICENSE](./LICENSE), [LICENSE-MIT](./LICENSE-MIT), and the relevant package-level notices. This README is a project-status description, not legal advice or a replacement for the applicable licence texts.

## Building and testing

Build instructions currently describe the inherited development baseline and may change as package experiments evolve. Consult [docs/BUILDING.md](./docs/BUILDING.md) and the repository's package scripts.

Only build and test this repository in accordance with the licences governing the relevant components. Do not treat a locally successful build as authorization for production use or redistribution.

## Contributions

Contributions should support the repository's test-project purpose: package evaluation, reproducible experiments, architecture validation, documentation, and focused tests.

When proposing a change, explain:

- Which package, integration, or architecture question it addresses.
- How the experiment can be reproduced.
- What behaviour or compatibility it is intended to validate.
- Which upstream components and licences are affected.

Please preserve upstream attribution, notices, and licence boundaries.
