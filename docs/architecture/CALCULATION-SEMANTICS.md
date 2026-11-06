# Expression and calculation semantics

**Status:** v1 semantic proposal  
**Authority:** TypeScript Khwarizmi Core

## 1. Canonical expression model

Persist a versioned, typed AST. A formatted equation string, MathLive DOM, LaTeX string, or MathJSON interchange payload is not the authoritative executable representation.

Initial AST node families:

- `NumberLiteral`: exact decimal/rational or explicitly tagged floating-point literal;
- `SymbolRef`: stable symbol ID, with display name as presentation metadata;
- `UnaryOp`: sign and supported unary operators;
- `BinaryOp`: arithmetic operators;
- `Call`: allowlisted function identifier and argument list;
- `UnitAttach`: quantity unit expression;
- `Group`: explicit grouping where required;
- `Vector` / `Matrix`: reserved pending v1 sign-off.

Every node has a stable node ID or deterministic path for diagnostics. AST schema version is independent from document schema version.

## 2. Authoring and interchange

MathLive may provide visual math editing and LaTeX/MathJSON interchange. Import must pass through a normalization and validation layer that produces the canonical AST. Unsupported constructs are rejected with a location-aware diagnostic; they must not be silently approximated or converted into executable text.

## 3. Symbols and assignments

- Symbol scope is document-local, with optional future page/section namespaces.
- Each symbol has a stable `symbolId`, display name, declared type, optional unit, and definition reference.
- A definition is explicit and immutable for a given document revision.
- A symbol name is not its identity.
- Duplicate active names in the same scope are validation errors unless a future explicit scoping rule says otherwise.
- No hidden mutable calculator state is allowed.
- Reassignment is not implicit. A changed value creates a new document revision/definition or an explicit sequential assignment construct after that construct is approved.

## 4. Evaluation order and dependency graph

The evaluator derives dependencies from symbol references in canonical ASTs. It MUST:
1. validate document and AST schemas;
2. build a symbol table;
3. resolve every reference;
4. construct a directed dependency graph;
5. detect cycles and unresolved references;
6. topologically order independent calculation nodes with a deterministic tie-break (document/page order, then stable ID);
7. evaluate only nodes whose dependencies are valid;
8. emit a result record and trace for every evaluated node.

A dependency cycle is a semantic error, not a runtime timeout. Independent nodes may be evaluated in parallel only if result determinism is preserved. Reordering a page must not alter a dependency relationship; it may alter deterministic presentation order only.

## 5. Substitution and traceability

A calculation result MUST retain:
- source expression AST and a display-safe expression representation;
- resolved symbol values and units;
- substitution representation suitable for human review;
- evaluated value and resulting unit/dimension;
- status and diagnostics;
- engine/semantic version and input document revision.

Substitution is a presentation of resolved operands in the expression tree, not a string replacement algorithm. Intermediate results are referenced by symbol/result IDs, never by copying formatted output text.

## 6. Values, quantities, and units

TypeScript owns the quantity and unit model. A quantity is a magnitude plus a normalized unit/dimension representation. Unit conversion must be explicit and dimension-preserving.

- Addition/subtraction require compatible dimensions and normalize to a declared/common unit.
- Multiplication/division combine dimensions.
- Powers require supported exponent semantics; dimensional exponents must be valid.
- Trigonometric functions require angle-compatible inputs or an explicit dimensionless convention.
- Comparisons require compatible dimensions.
- Unitless values are not silently treated as arbitrary engineering quantities.
- Absolute temperatures and temperature differences require distinct semantics if supported.
- Unknown units, invalid prefixes, and incompatible dimensions are validation/evaluation errors.

Python/Pint may be used as an optional numerical service, but its results must be checked/normalized through the TypeScript-owned contract. Python must not own symbol resolution or redefine the canonical unit registry semantics.

## 7. Numerical policy

- Preserve exact decimal/rational literals where practical.
- Record numeric representation and precision policy in result metadata.
- Avoid display rounding in the internal value.
- Formatting/rounding is a presentation policy and must not feed back into later calculations.
- Tolerances are domain-specific and must be explicit in tests; no universal engineering pass/fail tolerance is implied.

## 8. Error model

At minimum distinguish:
- schema/AST invalid;
- duplicate symbol;
- unresolved symbol;
- dependency cycle;
- unsupported operator/function;
- unit parse/unknown unit;
- dimensional mismatch;
- division by zero/domain error;
- numeric overflow/underflow;
- cancelled;
- internal evaluator failure.

Errors include stable code, message, severity, document/page/block/node location, and optional structured details. Error text is not a machine-readable discriminator; consumers branch on stable codes.

## 9. Open decisions

- Exact grammar and supported operator precedence.
- Function catalog and overload rules.
- Whether vector/matrix values are v1 or later.
- Decimal/rational versus IEEE-754 representation policy.
- Angle and temperature semantics.
- Unit registry provenance/version and custom-unit policy.
- Whether sequential assignment is required for the first release.
