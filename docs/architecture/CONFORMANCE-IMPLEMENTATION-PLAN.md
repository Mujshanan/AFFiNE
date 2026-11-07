# Khwarizmi v1 conformance implementation plan

**Status:** implementation sequence; the contracts in PR #5 remain normative.

This document turns the remaining conformance work into independently reviewable workstreams. A green check must never imply that a blocked fixture stage was executed.

## 1. Executable fixture runner

- Load and validate the fixture manifest before executing entries.
- Execute entries in manifest order and compare outcome plus diagnostic codes.
- Treat missing stage adapters as `blocked`; never skip them.
- Current executable stages: JSON Schema / MathJSON profile, document semantic validation, dependency graph, unit-reference validation, and RPC envelope.
- Remaining fixture stages: authoring parse, calculation evaluation, and RPC integrity.
- CI runs the runner as a dedicated job. The final release gate must require `failed === 0` and `blocked === 0`.

## 2. Compute Engine adapter and numeric/unit codecs

### Engine pin

Use **`@cortex-js/compute-engine@0.180.0`** as the first adapter target. The package metadata published for this release declares Node.js `>=22.3.0`, compatible with the repository's Node.js `>=22.12.0 <23` engine range. Keep the dependency exact-pinned until adapter conformance is established.

The adapter must use `ce.box(mathJson)` for MathJSON input and `BoxedExpression.toMathJson()` for output. Never persist `BoxedExpression.json` as the canonical result because it can serialize high-precision values through JavaScript numbers. Use precision-preserving serialization (`fractionalDigits: "max"`, with shorthands disabled for canonical persistence).

### Numeric codec

- Preserve authored exact decimals as decimal strings; do not route them through JS `number`.
- Decode exact rationals using `BigInt`, reduce by GCD, require a positive denominator, and serialize canonical numerator/denominator strings.
- Keep approximate values explicitly tagged with precision and method; the display formatter must never feed rounded display text back into evaluation.
- Test values beyond IEEE-754 precision, negative values, zero, large exponents, repeating results, rational reduction, and round-trip stability.
- CE is the evaluator, not the authority for authored lexemes or Khwarizmi value tags. Those remain in Khwarizmi records.

### Unit codec

- The versioned Khwarizmi registry is authoritative for unit identity, dimensions, and exact scale.
- Perform dimension compatibility and unit conversion in a Khwarizmi codec before/after CE evaluation; do not depend on CE's experimental dimensional-analysis hooks for v1 correctness.
- Use exact rational arithmetic for rational scales. Keep angle `piRational` scales symbolic so degree/radian conversions can participate in exact trigonometric evaluation.
- Reject unsupported affine temperature units and dimension mismatches before evaluating a mixed-dimension expression.
- Test registry-version mismatch, same-dimension conversions, incompatible dimensions, compound-unit scale composition, angle conversion, and exact round trips.

## 3. RPC framing and cancellation

- Implement a streaming decoder for a four-byte unsigned little-endian payload length followed by exactly that many UTF-8 bytes.
- Enforce the fixed 16 MiB cap before allocating the payload buffer.
- Test fragmented headers, fragmented payloads, coalesced frames, zero-length frames, oversized frames, truncated EOF, invalid UTF-8, invalid JSON, and batch rejection.
- Track in-flight requests by JSON-RPC ID. Reject duplicate active IDs; cancellation is idempotent; unknown/completed IDs are ignored; completed results must not publish after cancellation.
- Test cancellation before execution, during asynchronous evaluation, after completion, duplicate cancel notifications, disconnect cleanup, and request-ID reuse after cleanup.
- Verify one response at most for each request ID and no response for the cancellation notification.

## 4. Windows process security

The security tests must exercise the actual Windows host supervisor and named-pipe implementation, not only mocked helper functions.

- Verify the launched executable's canonical path, signature/hash policy, process identity, and ownership before accepting a pipe connection.
- Bind readiness to a fresh, unguessable per-launch capability delivered over a protected channel; never expose it to renderer code or logs.
- Create a per-instance unpredictable pipe name with a current-user-only DACL; reject remote clients and pipe squatting.
- Test wrong executable, replaced binary, wrong PID, stale/replayed capability, wrong user, remote connection, pre-created pipe, startup timeout, early process exit, forced termination, and clean shutdown.
- Run these tests on Windows CI. Linux tests may cover platform-independent policy logic but cannot count as Windows security conformance.

## 5. CI enforcement

- Add a dedicated `Khwarizmi Conformance` status check.
- Run schema, semantic, numeric, unit, evaluation, RPC, and host-security suites as they become available.
- Report fixture totals by `passed / failed / blocked` and preserve logs/artifacts for failures.
- During staged implementation, explicitly enumerate allowed blocked stages. Remove each allowance only when its adapter and tests land.
- Final release gate: no failed tests, no blocked fixture stages, and Windows security job successful. Configure the repository branch-protection rule to require the conformance and Windows-security checks; workflow YAML alone cannot enforce a GitHub branch-protection setting.

## Delivery sequence

1. PR #6: TypeScript schemas and semantic validators.
2. PR #7: executable fixture runner and dedicated CI job.
3. Next: Compute Engine adapter + numeric/unit codecs, then enable evaluation fixtures.
4. Next: RPC frame codec + cancellation + integrity tests.
5. Next: Windows process supervisor/security tests and Windows CI.
6. Final: remove every allowed blocked stage and require all conformance checks before merge/release.
