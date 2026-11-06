# Calculation host RPC v1

**Status:** transport and responsibility direction accepted; wire schemas require conformance lock  
**Protocol:** JSON-RPC 2.0 over a local Windows named pipe

## 1. Process topology

`Renderer → allowlisted preload API → Electron main → named-pipe client → TypeScript calculation host`

An optional Python worker may be invoked by the TypeScript host for specialized numerical routines:

`TypeScript host → controlled worker adapter → Python worker`

- Renderer never opens a named pipe, launches a process, or chooses an executable path.
- Preload exposes a small allowlist of typed operations only.
- Electron main owns host startup, process verification, connection lifecycle, request forwarding, cancellation, health monitoring, and shutdown.
- TypeScript host is the named-pipe server and authoritative calculation service.
- Python is an implementation detail behind the TypeScript host; it is not directly exposed to the renderer.

## 2. Transport framing

- Encoding: UTF-8.
- Payload: one JSON-RPC 2.0 object per frame.
- Framing: 4-byte unsigned length prefix followed by exactly that many UTF-8 bytes. **Proposed byte order: little-endian.**
- Maximum frame payload: 16 MiB (proposed v1 ceiling).
- Reject zero-length, oversized, truncated, malformed UTF-8, and invalid JSON frames.
- Read exactly the declared payload length; pipe read boundaries are not message boundaries.
- One request per frame; JSON-RPC batch arrays are not supported.
- No newline-delimited JSON and no delimiter scanning.

The little-endian prefix and 16 MiB cap must be encoded in shared test fixtures before host implementation. Changing either requires a protocol version change or explicit compatibility decision.

## 3. JSON-RPC rules

- JSON-RPC version field MUST be `"2.0"`.
- Requests MUST have a non-empty string or integer ID; notifications are limited to explicitly documented lifecycle events.
- Responses MUST echo the request ID.
- Unknown methods return `-32601`.
- Invalid request/envelope returns `-32600`.
- Invalid JSON returns `-32700`.
- Invalid method parameters return `-32602`.
- Internal errors use a reserved Khwarizmi error range and structured `data`.
- Batch requests are rejected.
- A response is returned exactly once for each request with an ID unless the connection fails.

## 4. Initial methods

| Method | Direction | Purpose |
|---|---|---|
| `host.getInfo` | request | protocol, host, semantic, and capability versions |
| `document.validate` | request | validate document/schema/AST and return diagnostics |
| `document.evaluate` | request | evaluate a document revision and return result records/traces |
| `$/cancelRequest` | notification | cancel an in-flight request by its JSON-RPC ID |

Method parameter and result objects MUST be schema-versioned and validated. Do not accept arbitrary code, filesystem paths, import expressions, or Python snippets as RPC parameters.

## 5. Evaluation result statuses

Document evaluation returns one of:
- `completed`: all requested calculations completed without error diagnostics;
- `completedWithErrors`: evaluation completed but one or more nodes contain errors;
- `cancelled`: caller cancellation was acknowledged and no further work for that request should be committed.

Transport/process failure is not an evaluation status; it is an RPC/transport error. Partial results must identify their node status and must not masquerade as a completed document.

## 6. Request cancellation and concurrency

- Cancellation is best-effort and idempotent.
- The host tracks in-flight request IDs.
- A cancellation notification for an unknown/completed ID is ignored.
- A cancelled request must not publish a completed result snapshot.
- Requests are isolated; no shared mutable document evaluation context between requests.
- Duplicate in-flight request IDs are rejected.
- Timeouts are enforced by the caller and host policy; exact default values remain open and must be specified before conformance freeze.

## 7. Security and lifecycle

The named pipe is local-only and restricted to the current Windows user via a protected DACL. The host MUST reject remote clients and unexpected clients. Electron main MUST verify the spawned process identity/ownership and connect only to the pipe instance it created or securely discovered. Pipe names must be unpredictable per app instance or otherwise protected against squatting.

- Host starts with the desktop application and is owned by Electron main.
- Startup includes a bounded readiness/health handshake.
- Unexpected host exit fails in-flight calls with a transport error.
- Main process performs controlled shutdown and bounded termination.
- Do not expose a general-purpose pipe name or privileged process-launch method to renderer content.

The exact pipe naming scheme, DACL construction, and process verification implementation are release-blocking security details.

## 8. Integrity and canonicalization

For document payload integrity, use SHA-256 over RFC 8785 JSON Canonicalization Scheme (JCS) bytes. The digest is an integrity/cache key, not an authorization mechanism. The receiver recomputes and verifies the digest over the exact canonical document payload and rejects mismatches. Do not hash ordinary JSON serialization with unspecified property order.

## 9. Python worker boundary

Python worker calls are internal to the TypeScript host. The TypeScript host sends typed, bounded requests and validates typed responses. No Python worker API is exposed over the renderer RPC. Worker crash, timeout, invalid output, or unsupported operation becomes a normalized host diagnostic/error. The worker cannot mutate the document, symbol table, or dependency graph.

## 10. Unresolved v1 details

- Exact JSON Schema definitions for each method's params/results and diagnostic structures.
- Exact request timeout defaults and maximum concurrent request count.
- Pipe naming, ACL implementation, process identity verification, and reconnect policy.
- Whether digest is required on every document RPC or only document-bearing calls.
- Exact host capability/version negotiation fields.
- Python worker transport and allowlisted operation catalog.

These must be resolved in the contract-conformance phase; they are not implementation freedoms.
