# Khwarizmi Studio

**An open-source workspace for structural engineering calculations and technical documentation.**

Khwarizmi Studio aims to bring engineering mathematics, calculation workflows, and design documentation into one visual, editable environment. It is being developed for structural engineers who need more than a calculator or a conventional word processor: they need to show the assumptions, inputs, equations, substitutions, intermediate steps, checks, and final results that support an engineering decision.

> **Project status:** Early development. Khwarizmi Studio is being shaped from an existing open-source workspace foundation. The product description below sets out the intended direction; it is not a claim that every capability is already implemented.

## Why Khwarizmi?

Structural calculations are often split across spreadsheets, standalone calculation tools, handwritten notes, drawings, and report documents. This makes it difficult to keep the calculation itself and its explanation together, review the sequence of work, or update a design without manually reconciling several files.

Khwarizmi is intended to provide one coherent workspace in which engineers can develop calculations and communicate their reasoning.

## Product vision

Khwarizmi Studio is being designed around three connected capabilities:

### 1. Engineering calculation worksheets

Create calculations as structured, readable worksheets rather than isolated formula fields.

The intended workflow includes:

- Define variables, parameters, units, and input values.
- Write mathematical expressions and engineering equations.
- Evaluate expressions in a meaningful calculation sequence.
- Show numerical substitution as well as the evaluated result.
- Keep intermediate values visible and reusable in later expressions.
- Organize related calculations into sections and calculation sequences.

### 2. A visual, flexible workspace

Arrange calculation content in a visual workspace that supports the way engineers explain technical work.

The intended content includes:

- Equations, variables, and calculated results.
- Input data, assumptions, and explanatory text.
- Tables, diagrams, sketches, and supporting references.
- Multiple calculation areas within the same engineering document.
- Side-by-side presentation of inputs or expressions and their corresponding results where useful.

The goal is to make the worksheet expressive without losing the structure and readability expected of an engineering calculation.

### 3. Engineering calculation documentation

Treat the calculation document as an engineering deliverable, not merely a place to perform arithmetic.

The long-term direction includes:

- Clear separation of design basis, assumptions, input data, calculations, and conclusions.
- Traceable relationships between inputs, equations, intermediate values, and results.
- Consistent units and readable mathematical notation.
- Calculation layouts suitable for technical checking and design review.
- Print-ready, paginated PDF output.

## Intended engineering applications

Khwarizmi is being developed with structural engineering workflows in mind. Potential application areas include:

- Reinforced concrete member design.
- Beams, slabs, columns, and foundations.
- Structural analysis results and design checks.
- Load calculations and combinations.
- Steel and concrete member verification.
- Supporting calculations, schedules, and design notes.

These are intended use cases, not a statement that the application currently implements or validates the relevant design standards.

## Design principles

- **Show the work:** Preserve the calculation process, including substitutions and intermediate results—not only the final answer.
- **Keep content together:** Equations, explanations, assumptions, tables, and diagrams should live in the same engineering document.
- **Make results reviewable:** A calculation should be understandable by another engineer who needs to check it.
- **Respect engineering units:** Units and quantities are fundamental parts of engineering expressions, not decorative labels.
- **Separate presentation from computation:** The worksheet presents the work; a dedicated calculation layer is responsible for evaluating it.
- **Support durable documents:** Engineering work should remain organized, editable, and suitable for long-term reference and PDF delivery.
- **Build on open source:** Reuse mature open-source foundations where practical while keeping Khwarizmi's engineering document model and calculation behavior under project control.

## Development direction

Khwarizmi is currently in its foundation and architecture stage. Work is being approached incrementally:

1. Establish and document a reproducible baseline of the upstream application.
2. Audit the inherited codebase, dependencies, package structure, and licensing.
3. Define Khwarizmi's engineering document and worksheet model.
4. Specify the calculation engine boundary and its communication contract.
5. Develop the worksheet experience and engineering-specific presentation in controlled stages.
6. Add calculation examples, validation tests, and document-export workflows as the relevant capabilities are implemented.

The project is expected to use a TypeScript-based application layer with a separate calculation host. The exact implementation and supported calculation capabilities will be documented as the architecture is established.

## What Khwarizmi is not (yet)

Khwarizmi Studio is not currently presented as a verified structural design program, a certified code-compliance tool, or a replacement for engineering judgement and independent checking. Do not rely on it for project design decisions until the relevant calculation capabilities, standards implementations, and validation evidence are available.

Any future implementation of design standards must identify the applicable standard and edition, document its assumptions and limitations, and be supported by test cases and independent verification.

## Repository foundation and acknowledgements

Khwarizmi Studio builds on the open-source [AFFiNE](https://github.com/toeverything/AFFiNE) project and its editor ecosystem, including [BlockSuite](https://github.com/toeverything/BlockSuite).

We are grateful to the AFFiNE and BlockSuite maintainers and contributors for the work that makes this foundation possible. Khwarizmi will adapt that foundation for engineering calculation worksheets and technical documentation.

This repository may still contain upstream application code, documentation, assets, and references while the project is being adapted. Upstream notices and license terms must be preserved. See the repository's [LICENSE](./LICENSE) and the relevant upstream notices for details.

## Building from source

Khwarizmi is in early development, and the build workflow may change as the project is adapted.

For now, consult the upstream build documentation in [docs/BUILDING.md](./docs/BUILDING.md) and the repository's package scripts. These instructions describe the inherited application baseline and may not yet represent a finalized Khwarizmi developer workflow.

## Contributing

Contributions, technical discussions, and focused reviews are welcome. During this early stage, the most useful contributions help establish a reliable foundation and clarify engineering requirements.

Before proposing a substantial feature, please open an issue or discussion describing:

- The engineering workflow or problem being addressed.
- A representative calculation or document example.
- Expected inputs, outputs, units, and intermediate steps.
- Any relevant design standard and edition.
- How the behavior could be tested or independently checked.

Please preserve upstream licensing, notices, and attribution when modifying inherited code.

## License

Khwarizmi's licensing obligations are governed by the license and notices in this repository and by the licenses of its upstream dependencies. See [LICENSE](./LICENSE) before using, modifying, or redistributing the project.
