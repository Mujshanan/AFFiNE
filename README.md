# Khwarizmi Studio — Package Integration Testbed

<p align="center"><img src="assets/khwarizmi-logo.svg" alt="Khwarizmi Studio logo" width="112" /></p>

**A development test project for evaluating, integrating, and validating application packages and technical foundations.**

> [!IMPORTANT]
> **This repository is an experimental development and package-integration testbed. It is not a finished application, a production-ready product, or a software release intended for end users.** Its name and engineering-oriented experiments describe the direction of investigation, not a promise that a usable engineering application is available.

## Purpose

This repository is used to:

- Establish and test an AFFiNE-derived application baseline.
- Evaluate the integration and behaviour of AFFiNE and BlockSuite packages.
- Prototype package boundaries, editor extensions, and application-level integrations.
- Develop and test Khwarizmi-specific document, worksheet, and calculation contracts.
- Record architecture decisions and validate technical approaches before considering product implementation.

The immediate objective is to learn which inherited packages and foundations are suitable, identify constraints, and keep experimental work reproducible. Features and prototypes in this repository may be incomplete, temporary, or subject to replacement.

## What this repository is — and is not

| This repository is | This repository is not |
|---|---|
| A package and integration test project | A finished engineering application |
| An experimental development workspace | A production-ready product |
| A place for architecture prototypes and validation | A verified structural design or code-compliance tool |
| An AFFiNE/BlockSuite evaluation baseline | An official AFFiNE or BlockSuite distribution |
| A record of technical decisions and experiments | A supported end-user release |

Do not use builds, calculations, prototypes, or other outputs from this repository for real project design decisions. No engineering capability should be considered verified until its scope, assumptions, tests, and independent validation evidence are explicitly documented.

## Upstream foundations

This test project is based on the [AFFiNE](https://github.com/toeverything/AFFiNE) repository and uses [BlockSuite](https://github.com/toeverything/BlockSuite) as an editor foundation.

The repository may contain substantial upstream code, packages, build tooling, assets, and documentation. The purpose of retaining this baseline is to evaluate and adapt the existing package ecosystem rather than imply that all inherited code is part of a completed Khwarizmi product.

AFFiNE and BlockSuite are separate upstream projects. This repository is not an official distribution of either project, and their names and trademarks remain with their respective owners.

## Experimental Khwarizmi architecture

The experiments may include engineering-oriented foundations such as:

- A page-oriented worksheet and document model.
- Physical page geometry and layout contracts.
- Mathematical expression and variable semantics.
- Calculation evaluation, dependency tracking, and unit handling.
- Tables, diagrams, and engineering drawing concepts.
- Interfaces between the editor and a separate calculation host.

These are areas of investigation, not a statement that the corresponding features are implemented or ready for use. The intended architecture is to keep engineering document semantics and calculation behaviour under Khwarizmi's control, independently of the inherited application foundation.

## Development status

Work is organized through the [Development Plan](./DEVELOPMENT_PLAN.md) and the architecture records in [docs/architecture](./docs/architecture/README.md).

The current focus is repository baseline validation, package and licence auditing, architecture contracts, and controlled experiments. A successful build or passing package test does not establish that this repository is suitable for production distribution.

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
