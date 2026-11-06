# Expression and calculation semantics

**Status:** v1 semantic proposal  
**Authority:** TypeScript Khwarizmi Core

## 1. Canonical expression model

Persist a versioned Khwarizmi expression record whose `mathJson` field is a MathJSON expression accepted by the pinned CortexJS Compute Engine. Do not maintain a second arithmetic AST. The record adds `schemaVersion`, `mathJson`, `symbolBindings` (engine-safe token to stable `symbolId`), `authoredNumbers` (original numeric lexeme and A3 representation tag by structural path), `sourceMap` (structural path to stable node/block/page IDs), and optional `authoring` data (original LaTeX/MathLive version, never executable).

Engine tokens are deterministic aliases, never user display names. Assignment statements and control-flow blocks remain Khwarizmi execution records, not mutable engine-global definitions. MathJSON is a tree format, not a worksheet language: Khwarizmi MUST validate the supported head/arity allowlist, scalar-only values, unit policy, and conditions before evaluation. Reject vectors/matrices/tensors with `UNSUPPORTED_VALUE_KIND`. Structural JSON Schema validation is not semantic validation.

Every node has a stable node ID or deterministic path for diagnostics. AST schema version is independent from document schema version.

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

A sequential reassignment such as `a = a + 1` is valid because the right-hand side reads the preceding assignment version and the left-hand side creates the next version. This is not a dependency cycle. Because every read resolves only to a preceding successful assignment event, a valid v1 execution graph is acyclic by construction. A read before the first assignment is `UNRESOLVED_SYMBOL`, not a cycle. `DEPENDENCY_CYCLE` is reserved for a corrupt persisted dependency snapshot or an internal graph invariant violation; every dependency edge must point to a lower execution ordinal.

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

Python numerical services are deferred from v1. TypeScript owns worksheet semantics, symbol resolution, unit conversion policy, evaluation orchestration, and result normalization. Compute Engine performs the mathematical symbolic/numeric operations through the adapter. Any future worker requires a separate ADR and remains subordinate to the TypeScript contract.

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

## 10. Accepted v1 boundaries

Owner decisions ADR-010 through ADR-018 remain normative: scalar-only values; exact decimal/rational authored literals; tagged approximate results; sequential reassignment with tracked versions; lexical local variables in `if`/`while` without shadowing; unambiguous implicit multiplication; versioned built-in units; temperature arithmetic and custom units deferred.

The following sections close the semantic definitions for v1. Executable validators and conformance tests remain a separate implementation phase.

## 11. Final v1 grammar and execution rules

The machine-readable MathJSON profile is `contracts/schemas/v1/mathjson-profile.schema.json`. It is a closed allowlist, not an extensible function registry. V1 built-ins are:

| Function | Arity | Domain / result |
|---|---:|---|
| `Sqrt`, `Abs`, `Exp`, `Ln`, `Lg` | 1 | Real scalar; domain errors are diagnosed |
| `Log` | 1 or 2 | Base-10 logarithm by default; optional explicit base |
| `Sin`, `Cos`, `Tan` | 1 | Angle input only |
| `Arcsin`, `Arccos`, `Arctan` | 1 | Dimensionless input; angle output |
| `+`, `-`, `*`, `/`, `^` | 2 (unary sign 1) | Scalar arithmetic |
| comparisons | 2 | Compatible scalar dimensions |
| `and`, `or`, `not` | 2+, 1 | Boolean conditions |

MathJSON boolean conditions use the standard symbols `True` and `False`; JSON booleans are not evaluator condition atoms. Unary plus is normalized away. No function aliases, user-defined functions, lambdas, symbolic integration/differentiation, complex arithmetic, or implicit vectorization are in v1. The parser MUST canonicalize aliases before producing MathJSON. A function name that is not in this table is `UNSUPPORTED_FUNCTION`; wrong arity is `INVALID_FUNCTION_ARITY`.

The precedence table in section 3 is normative. Comparisons are non-associative. `-x^2` means `-(x^2)`; exponentiation is right-associative. Implicit multiplication is accepted only where tokenization has one parse; `2x`, `2(x+1)`, and `(a)(b)` may normalize to Multiply when no identifier/function ambiguity exists. `ab` is one identifier, not automatically `a*b`. A symbol followed by parentheses is a function call only if the name is in the function allowlist; otherwise it is ambiguous and rejected.

A calculation document declares document-level symbols in `symbols`, places statements in page blocks, and supplies `calculationOrder` as an ordered list of every top-level statement ID exactly once. Nested branch/loop statements are ordered by their array position and MUST NOT appear in the top-level order list. IDs are unique across the complete document, including nested statements. Reordering pages or visual blocks does not change calculation order.

The statement schema is a discriminated union: `assign`, `declareLocal`, `if`, `while`, and `expression`. `if` and `while` conditions are separate condition-expression records with their own MathJSON, stable symbol bindings, authored-number metadata, and source maps; they are not bare strings or raw arrays. `declareLocal` creates a local binding at that point; assignment never implicitly declares a local. An assignment target must identify an existing document symbol or a visible local. A document symbol's first successful assignment creates version 1; each later successful execution creates the next version. A failed assignment does not increment the version.

Resource limits are fixed for semantic v1: control-flow nesting 32; 10,000 iterations per loop; 100,000 aggregate loop iterations per document evaluation; expression depth 256; expression nodes 100,000; diagnostics 10,000. A limit violation emits `RESOURCE_LIMIT_EXCEEDED` and stops the affected control-flow path safely.

## 12. Numeric and unit wire policy

The wire scalar schema is `contracts/schemas/v1/numeric-value.schema.json`; the initial immutable unit registry is `contracts/schemas/v1/unit-registry.v1.json`. MathJSON exact decimal literals use the standard `{\"num\":\"...\"}` number object, and exact rationals use the `Rational` head with integer MathJSON number operands. The original lexeme and A3 representation tag remain in `authoredNumbers`. Wire result scalars use canonical base-10 strings for exact decimals, reduced numerator/positive-denominator strings for exact rationals, and decimal/scientific strings plus precision/method for approximate values. Default approximate precision is 34 significant decimal digits; supported precision ceiling is 1,000 digits. The display rounding mode is round-half-even and never mutates stored values.

The registry stores exact rational scale factors to canonical base units. Prefixes are a versioned explicit table; a prefix may be composed only with a unit marked prefixable in that registry. The resolver uses the longest registered prefix, gives explicit unit symbols precedence, and never guesses an unregistered prefix. Angle degrees use a `piRational` scale (π/180), not a binary floating-point approximation. The selected Compute Engine adapter must preserve this representation or perform a tagged approximation with precision metadata. It may not silently coerce a unit scale to JavaScript `number`. Configure the engine for arbitrary-precision numeric mode and the requested precision. Do not use `BoxedExpression.json` as a persistence path for high-precision values because its shorthand serialization may convert numbers to JavaScript numbers; use the precision-preserving MathJSON serialization API and test round trips.

The v1 registry includes length, mass, time, force, pressure, energy, power, and angle units used in engineering worksheets. Dimension vectors are sorted by base-dimension identifier, omit zero exponents, and use reduced rational exponents with positive denominators. Derived-unit dimensions use rational exponents. Absolute temperature, temperature differences, affine conversions, and custom units remain rejected with `UNSUPPORTED_UNIT_KIND`.

## 13. Stable diagnostic registry

The normative code inventory is `contracts/schemas/v1/diagnostic-codes.json`. Diagnostic ordering is deterministic: execution ordinal, source-map path, then code. Consumers branch on code only. Validation failures prevent evaluation; evaluation failures may allow independent later statements to continue. A failed assignment is not visible to later reads, which instead receive `DEPENDENCY_FAILED`.

## 14. Contract completion boundary

The semantic rules, JSON Schemas, diagnostic inventory, unit registry, and language-neutral seed fixtures are now published under `contracts/schemas/v1` and `contracts/fixtures/v1`. JSON Schema validation is necessary but not sufficient: semantic validation must check binding uniqueness, complete calculation order, declaration visibility, no-shadowing, exact assignment-version resolution, MathJSON path provenance, dimensional compatibility, unit-registry membership, and resource limits. Executable TypeScript validators and CI conformance tests are a separate implementation phase; they are not part of this contract-definition deliverable.

## 15. Additional normative execution details

A document symbol's `normalizedName` is Unicode NFC followed by locale-independent Unicode case folding; trimming is not performed implicitly. Empty names are invalid. Two active symbols with the same normalized name produce `DUPLICATE_SYMBOL_NAME`. Renaming changes display metadata only and preserves `symbolId`.

The initializer of a `declareLocal` statement is evaluated in the environment immediately before the declaration. The new local becomes visible only after its initializer succeeds. A failed initializer does not create a binding. A local assignment may update only an already-visible local or document symbol; it never creates a new binding. The declaration's lexical block is the visibility boundary. An `if` branch has its own child scope; an inner block can capture a visible outer local. A local declared in one branch is invisible in the other branch and after the `if`. A `while` body receives a fresh child scope per iteration.

A `while` condition is evaluated before iteration zero and again after each completed body. The loop stops when the condition becomes false. If the condition remains true after the maximum permitted body executions, the loop emits `RESOURCE_LIMIT_EXCEEDED`; it does not silently truncate and report success. A break/continue statement is not in v1.

Assignment versions begin at 1 for each document symbol within each evaluation. A successful execution of an assignment statement increments that symbol's version; a failed execution does not. Repeated execution of one assignment statement in a loop retains its source `assignmentId`, while each successful execution receives a distinct `assignmentEventId`. The event ID is unique within the evaluation and is derived from evaluation identity plus execution ordinal. A new evaluation/revision starts a new version sequence; old evaluation records remain immutable.

Boolean `And` and `Or` conditions evaluate left-to-right with short-circuit behavior. Comparison operands must have compatible dimensions. `Exp`, `Ln`, `Lg`, and `Log` require dimensionless real operands; `Log(x,b)` requires (x>0), (b>0), and (b\ne1). `Sin`, `Cos`, and `Tan` require angle dimensions. `Arcsin` and `Arccos` require dimensionless operands in [-1,1]; `Arctan` accepts any dimensionless real operand and returns an angle. Domain violations produce `DOMAIN_ERROR`.

For a dimensioned base, `Power(base, exponent)` requires a dimensionless exact rational exponent. The resulting dimension exponents are multiplied by that rational. `Sqrt` halves each dimension exponent. A result unit is selected deterministically: preserve the left operand's unit for addition/subtraction; for multiplication/division, combine the operand unit factors and reduce equal factors; use a registered derived unit when the resulting dimension and scale match exactly, otherwise serialize a normalized composite unit expression. All scale arithmetic remains exact rational or explicit pi-rational.

Dependency edges point only to assignment events with a lower execution ordinal than the consuming statement. A forward read before a symbol's first successful assignment is `UNRESOLVED_SYMBOL`. A cycle in a persisted dependency graph violates this invariant and is `DEPENDENCY_CYCLE`; v1 worksheet execution does not create forward-reference cycles.

Exact decimal authored lexemes are parsed without passing through JavaScript `number`. For example, `1.2300` is normalized as the exact MathJSON number object `{"num":"1.23"}`, while `authoredNumbers` retains `1.2300`. A rational such as `2/16` is normalized by the Compute Engine to `1/8`, while the original numerator/denominator and lexeme remain in the authored metadata. The adapter must use precision-preserving MathJSON serialization; the convenience `.json` shorthand is not an acceptable persistence codec for arbitrary-precision values.
