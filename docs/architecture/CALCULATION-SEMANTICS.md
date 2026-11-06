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
- Vector/matrix/tensor nodes: unsupported in v1; reject with `UNSUPPORTED_VALUE_KIND`.

Every node has a stable node ID or deterministic path for diagnostics. AST schema version is independent from document schema version.

## 2. Authoring and interchange

MathLive may provide visual math editing and LaTeX/MathJSON interchange. Import must pass through a normalization and validation layer that produces the canonical AST. Unsupported constructs are rejected with a location-aware diagnostic; they must not be silently approximated or converted into executable text.

## 3. Symbols, assignments, and scopes

- The document has one shared document-level namespace across all pages and sections.
- Each variable has a stable `symbolId`; display name is not identity.
- The first assignment establishes the variable. Later assignments reassign the same variable and create distinct immutable assignment events with stable `assignmentId` values.
- Duplicate document-level names are conflicts; they do not create separate variables.
- Reads resolve to the latest preceding assignment visible at the point of execution.
- Execution order is an explicit calculation order, separate from page coordinates, region placement, or visual layout. Visual repositioning alone MUST NOT change calculation meaning.
- `if` and `while` blocks support lexical local variables and reassignment. Nested blocks may access enclosing locals.
- A local variable may not shadow a document-level variable or another visible local in v1. A local is not visible outside its defining block.
- Variable identity, assignment identity/version, and evaluation-result identity are separate concepts.
- Reassignment in a later document revision invalidates/recomputes affected later evaluations for that revision, while previous revision snapshots remain immutable and inspectable.
- The engine records each assignment's source, order, expression, resolved dependencies, evaluated value, status, and control-flow path.

## 4. Evaluation order and dependency tracking

The evaluator MUST:
1. validate document, AST, and control-flow schemas;
2. build the document namespace and lexical scope environments;
3. validate declarations, duplicate names, and forbidden shadowing;
4. resolve symbol reads to stable variable identities and preceding assignment events;
5. execute the explicit calculation sequence; evaluate only the selected `if` branch and iterate `while` bodies according to the defined condition semantics;
6. record a dependency edge from each evaluation to the exact assignment versions it consumed;
7. detect invalid references and cycles in the resulting assignment/evaluation graph;
8. enforce deterministic loop, recursion/nesting, time, and resource limits;
9. emit an evaluation record and human-readable substitution trace for each executed statement.

A sequential reassignment such as `a = a + 1` is valid because the right-hand side reads the preceding assignment version and the left-hand side creates the next version. This is not a dependency cycle. A true cyclic dependency that cannot be resolved by source order/control-flow semantics is an error.

Independent calculations may be scheduled in parallel only when doing so preserves explicit execution order and deterministic results. Page/region visual reordering MUST NOT silently reorder the calculation sequence.

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

## 9. Accepted v1 boundaries and remaining contract work

Owner decisions are recorded in DECISIONS.md (ADR-010 through ADR-018): scalar-only values; exact decimal and rational authored literals; tagged approximate results; sequential reassignment with tracked assignment versions; lexical local variables in `if`/`while` without shadowing; unambiguous implicit multiplication normalized to explicit multiplication; versioned built-in units with explicit radian/degree semantics; temperature arithmetic and custom units deferred.

The implementation team must still publish the exact grammar/precedence table, function allowlist and arities, condition and block syntax, loop limits, schema fields, stable diagnostics, and executable fixtures. These are not owner approval gates, but they remain blockers to declaring the v1 schemas stable.
