<div align="center">

# Khwarizmi

### A visual engineering calculation workspace

**Write calculations naturally. See substitutions. Understand every result.**

Khwarizmi is an open-source project exploring a Mathcad-style worksheet for engineering calculations, combining a visual mathematical workspace with transparent intermediate substitutions and professional calculation-note output.

</div>

---

## Project status

**Status: Early development**

Khwarizmi is being developed from the AFFiNE codebase, with BlockSuite retained as the editor foundation. The repository is currently in the foundation and desktop-isolation stage. The Windows x64 desktop packaging work is being separated from the upstream cross-platform release system.

**This is not yet a usable engineering calculation application.** The calculation language, evaluation engine, worksheet format, and PDF workflow are still being designed and implemented in stages.

## Why Khwarizmi?

Engineering calculations need more than a final numerical answer. A useful calculation environment should make the reasoning visible:

- **Natural mathematical input** — write equations in a worksheet rather than programming every calculation.
- **Visible substitutions** — show how defined values are substituted into each expression, not only the final result.
- **Units and dimensional checks** — treat physical quantities and units as part of the calculation.
- **Spatial worksheets** — arrange equations, text, tables, inputs, and results freely on a page, including side-by-side calculation columns.
- **Calculation-note output** — produce clear, structured documents suitable for review, sharing, and printing.

The project takes inspiration from the worksheet experience of Mathcad, the transparent substitutions of Calcpad, and the structured calculation templates and presentation of Tekla Tedds.

## Direction and design principles

The intended experience is a **page-oriented engineering worksheet**, not an unrestricted infinite whiteboard.

- A4 portrait is the default page format, with landscape support.
- Equations, text, images, and tables are positioned on the page.
- Multiple columns and parallel calculations can share the same horizontal space.
- Evaluation follows a defined worksheet order, with visible dependency and error reporting.
- The native Khwarizmi document format and calculation semantics remain independent of the underlying editor's internal document model.
- PDF output will be generated through a dedicated renderer rather than relying on editor screenshots.

## Planned calculation pipeline

The current architectural direction is:

1. Mathematical input through a visual equation editor.
2. Conversion to a structured mathematical representation.
3. Unit-aware evaluation and dependency resolution in a separate calculation host.
4. Return of structured results, including original expressions, substituted expressions, numerical values, units, and errors.
5. Rendering in the worksheet and export to PDF.

The planned technology direction is a TypeScript application with a separate Python-assisted calculation host and a versioned RPC contract. These are architectural goals; they should not be read as a claim that the complete pipeline is already implemented.

## Current scope

The initial work focuses on establishing a stable desktop foundation while preserving useful parts of the upstream editor.

| Area | Current direction |
| --- | --- |
| Desktop target | Windows x64 |
| Editor foundation | BlockSuite |
| Visual tools | Preserve relevant shapes, connectors, and flowchart capabilities |
| Worksheet model | Khwarizmi-owned page and region model |
| Calculation engine | Separate, versioned calculation service |
| Document format | Native Khwarizmi format |
| Export | Dedicated PDF renderer |

The Windows-only packaging work does not mean the web or mobile source packages have all been removed. It isolates the active desktop release path; broader source and dependency cleanup is a separate task.

## Building

The current desktop build instructions are maintained here:

- [Windows x64 desktop build guide](docs/building-desktop-client-app.md)

The Windows packaging workflow is:

- [Windows desktop workflow](.github/workflows/windows-desktop.yml)

Build requirements and commands may change while the desktop foundation is being stabilized. The workflow and build guide should be treated as the current reference.

## Development roadmap

The work is being approached in deliberate stages:

1. **Desktop foundation** — isolate and validate the Windows x64 desktop build.
2. **Architecture contracts** — define and test the document schema, calculation model, and RPC boundary before broad implementation.
3. **Worksheet experience** — establish page coordinates, regions, positioning, and multi-column layout.
4. **Mathematical input** — integrate equation editing and a canonical mathematical representation.
5. **Calculation host** — implement safe, unit-aware evaluation, dependencies, substitutions, and structured errors.
6. **Presentation and export** — build calculation-note styling and independent PDF output.

The roadmap describes intended work, not completed features. Decisions and implementation status should be documented as each stage is reviewed.

## Contributing

At this early stage, focused technical contributions and architectural reviews are especially valuable. Please open an issue or discussion before undertaking large changes so that work can be aligned with the project direction.

When proposing changes, keep these principles in mind:

- Avoid replacing or extending the calculation architecture without reviewing its contracts first.
- Do not treat the editor's internal document format as the public Khwarizmi file format.
- Keep calculation evaluation separate from UI rendering.
- Preserve transparent substitutions, units, and traceable results as core requirements.

## Upstream

Khwarizmi builds on the open-source work of [AFFiNE](https://github.com/toeverything/AFFiNE) and [BlockSuite](https://github.com/toeverything/BlockSuite). Their editor, collaboration, and application infrastructure provide a starting point for the project.

We are grateful to the AFFiNE and BlockSuite maintainers and contributors. Please consult the repository's license files and upstream notices when using or redistributing code; this README does not replace those terms.

---

<div align="center">

**Khwarizmi — engineering calculations, made visible.**

</div>
