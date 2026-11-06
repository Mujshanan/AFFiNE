# Expression and calculation semantics

**Status:** v1 semantic proposal  
**Authority:** TypeScript Khwarizmi Core

## 1. Canonical expression model

Persist a versioned Khwarizmi expression record whose `mathJson` field is a MathJSON expression accepted by the pinned CortexJS Compute Engine. Do not maintain a second arithmetic AST. The record adds `schemaVersion`, `mathJson`, `symbolBindings` (engine-safe token to stable `symbolId`), `authoredNumbers` (original numeric lexeme and A3 representation tag by structural path), `sourceMap` (structural path to stable node/block/page IDs), and optional `authoring` data (original LaTeX/MathLive version, never executable).

Engine tokens are deterministic aliases, never user display names. Assignment statements and control-flow blocks remain Khwarizmi execution records, not mutable engine-global definitions. MathJSON is a tree format, not a worksheet language: Khwarizmi MUST validate the supported head/arity allowlist, scalar-only values, unit policy, and conditions before evaluation. Reject vectors/matrices/tensors with `UNSUPPORTED_VALUE_KIND`. Structural JSON Schema validation is not semantic validation.

## 2. Authoring and interchange

MathLive provides visual editing and LaTeX input/output. Its MathJSON export is normalized into the Khwarizmi expression record. Normalization binds names to stable symbol IDs, preserves authored numeric lexemes, builds source maps, and validates supported MathJSON forms. Original LaTeX may be retained for editing fidelity but is never reparsed during evaluation.

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
- original Khwarizmi expression record, including MathJSON, authored numeric lexemes, and source map;
- resolved symbol values and units;
- substitution representation suitable for human review;
- evaluated value and resulting unit/dimension;
- status and diagnostics;
- engine/semantic version and input document revision.

Substitution is a presentation of resolved operands in the expression tree, not string replacement. Khwarizmi resolves each engine token to the exact preceding assignment version, then emits a separate substituted MathJSON tree and provenance entries. Engine `subs()` helpers may transform expressions but cannot infer worksheet assignment identity or history.

## 6. Values, quantities, and units

TypeScript owns the quantity and unit model. A quantity is a magnitude plus a normalized unit/dimension representation. Unit conversion must be explicit and dimension-preserving.

- Addition/subtraction require compatible dimensions and normalize to a declared/common unit.
- Multiplication/division combine dimensions.
- Powers require supported exponent semantics; dimensional exponents must be valid.
- Trigonometric functions require angle-dimension inputs; radians are canonical and degrees are converted through the versioned registry.
- Comparisons require compatible dimensions.
- Unitless values are not silently treated as arbitrary engineering quantities.
- Temperature arithmetic is unsupported in v1 and must be rejected with a stable diagnostic.
- Unknown units, invalid prefixes, and incompatible dimensions are validation/evaluation errors.

Python numerical services are deferred from v1. TypeScript owns numeric evaluation, unit conversion, symbol resolution, and result normalization. Any future worker requires a separate ADR and remains subordinate to the TypeScript contract.

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

## 9. Compute Engine adapter boundary

CortexJS Compute Engine is the selected mathematical evaluator and MathJSON implementation. It owns symbolic simplification and expression evaluation inside the validated v1 subset. Khwarizmi owns normalization policy, symbol-token binding, execution order, immutable assignment versions, lexical scope/no-shadowing validation, dependency graph, invalidation/replay, unit registry, numeric representation policy, source mapping, substitution provenance, diagnostics, and durable result records.

Use isolated evaluation contexts per document-evaluation request. Engine-global definitions MUST NOT become the durable symbol table or leak between requests. Khwarizmi resolves exact visible assignment versions before each expression and supplies an immutable binding environment. Engine scoping is not a substitute for Khwarizmi's no-shadowing rule. `simplify()` is a symbolic transform, not worksheet assignment resolution. `evaluate()`/`N()` output alone is not a result record. Preserve original and substituted expressions, consumed assignment versions, tagged scalar value, units/dimensions, and engine metadata. Never route exact values through JavaScript `number`. Compiled JavaScript execution is excluded from the exact v1 path unless separately proven equivalent. Pin MathLive and Compute Engine independently; MathLive does not imply an installed Compute Engine dependency.

## 10. Accepted v1 boundaries and remaining contract work

Owner decisions are recorded in DECISIONS.md (ADR-010 through ADR-018): scalar-only values; exact decimal and rational authored literals; tagged approximate results; sequential reassignment with tracked assignment versions; lexical local variables in `if`/`while` without shadowing; unambiguous implicit multiplication normalized to explicit multiplication; versioned built-in units with explicit radian/degree semantics; temperature arithmetic and custom units deferred.

The implementation team must still publish the exact grammar/precedence table, function allowlist and arities, condition and block syntax, loop limits, schema fields, stable diagnostics, and executable fixtures. These are not owner approval gates, but they remain blockers to declaring the v1 schemas stable.
