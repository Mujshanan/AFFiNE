export const RPC_MAX_FRAME_BYTES = 16 * 1024 * 1024;

export type RpcRequestId = string | number;

export class RpcTransportError extends Error {
  constructor(
    readonly code:
      | 'INVALID_FRAME_LENGTH'
      | 'FRAME_TOO_LARGE'
      | 'TRUNCATED_FRAME'
      | 'INVALID_UTF8'
      | 'INVALID_JSON'
      | 'RPC_BATCH_UNSUPPORTED'
      | 'INVALID_REQUEST_ID'
      | 'DUPLICATE_REQUEST_ID'
      | 'HOST_CLOSED',
    message: string
  ) {
    super(message);
    this.name = 'RpcTransportError';
  }
}

const utf8Encoder = new TextEncoder();

export function encodeRpcFrame(
  payload: Uint8Array | string,
  maxFrameBytes = RPC_MAX_FRAME_BYTES
): Uint8Array {
  const bytes = typeof payload === 'string' ? utf8Encoder.encode(payload) : payload;
  if (bytes.byteLength === 0) {
    throw new RpcTransportError('INVALID_FRAME_LENGTH', 'RPC frames cannot be empty');
  }
  if (bytes.byteLength > maxFrameBytes) {
    throw new RpcTransportError('FRAME_TOO_LARGE', 'RPC frame exceeds the configured byte limit');
  }
  const frame = new Uint8Array(4 + bytes.byteLength);
  new DataView(frame.buffer).setUint32(0, bytes.byteLength, true);
  frame.set(bytes, 4);
  return frame;
}

export function decodeRpcPayload(payload: Uint8Array): unknown {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(payload);
  } catch {
    throw new RpcTransportError('INVALID_UTF8', 'RPC payload is not valid UTF-8');
  }

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new RpcTransportError('INVALID_JSON', 'RPC payload is not valid JSON');
  }
  if (Array.isArray(value)) {
    throw new RpcTransportError('RPC_BATCH_UNSUPPORTED', 'JSON-RPC batch arrays are not supported');
  }
  if (value === null || typeof value !== 'object') {
    throw new RpcTransportError('INVALID_JSON', 'RPC payload must be a JSON object');
  }
  return value;
}

/** Incremental decoder: pipe read boundaries are not frame boundaries. */
export class RpcFrameDecoder {
  private readonly header = new Uint8Array(4);
  private headerBytesRead = 0;
  private payload: Uint8Array | undefined;
  private payloadBytesRead = 0;

  constructor(private readonly maxFrameBytes = RPC_MAX_FRAME_BYTES) {
    if (!Number.isSafeInteger(maxFrameBytes) || maxFrameBytes < 1 || maxFrameBytes > RPC_MAX_FRAME_BYTES) {
      throw new RangeError('maxFrameBytes must be between 1 and the v1 16 MiB limit');
    }
  }

  push(chunk: Uint8Array): Uint8Array[] {
    const frames: Uint8Array[] = [];
    let offset = 0;

    while (offset < chunk.byteLength) {
      if (!this.payload) {
        const headerCount = Math.min(4 - this.headerBytesRead, chunk.byteLength - offset);
        this.header.set(chunk.subarray(offset, offset + headerCount), this.headerBytesRead);
        this.headerBytesRead += headerCount;
        offset += headerCount;
        if (this.headerBytesRead < 4) break;

        const length = new DataView(this.header.buffer).getUint32(0, true);
        if (length === 0) {
          throw new RpcTransportError('INVALID_FRAME_LENGTH', 'RPC frame length must be greater than zero');
        }
        if (length > this.maxFrameBytes) {
          throw new RpcTransportError('FRAME_TOO_LARGE', 'RPC frame exceeds the configured byte limit');
        }

        // Allocate only after the length prefix has passed the hard limit.
        this.payload = new Uint8Array(length);
        this.payloadBytesRead = 0;
        this.headerBytesRead = 0;
      }

      const payload = this.payload;
      if (!payload) throw new Error('Frame decoder lost its active payload buffer');
      const payloadCount = Math.min(
        payload.byteLength - this.payloadBytesRead,
        chunk.byteLength - offset
      );
      payload.set(chunk.subarray(offset, offset + payloadCount), this.payloadBytesRead);
      this.payloadBytesRead += payloadCount;
      offset += payloadCount;

      if (this.payloadBytesRead === payload.byteLength) {
        frames.push(payload);
        this.payload = undefined;
        this.payloadBytesRead = 0;
      }
    }

    return frames;
  }

  finish(): void {
    if (this.headerBytesRead !== 0 || this.payload !== undefined) {
      throw new RpcTransportError('TRUNCATED_FRAME', 'RPC stream ended with an incomplete frame');
    }
  }

  reset(): void {
    this.headerBytesRead = 0;
    this.payload = undefined;
    this.payloadBytesRead = 0;
  }
}

function requestIdKey(id: unknown): string {
  if (typeof id === 'string' && id.length > 0) return 'string:' + id;
  if (typeof id === 'number' && Number.isSafeInteger(id) && id >= 0) return 'number:' + id;
  throw new RpcTransportError('INVALID_REQUEST_ID', 'Request ID must be a non-empty string or non-negative safe integer');
}

/** Tracks cancellation by JSON-RPC ID; evaluation state remains request-local. */
export class RequestCancellationRegistry {
  private readonly active = new Map<string, AbortController>();
  private closed = false;

  begin(id: RpcRequestId): AbortSignal {
    if (this.closed) throw new RpcTransportError('HOST_CLOSED', 'Cancellation registry is closed');
    const key = requestIdKey(id);
    if (this.active.has(key)) {
      throw new RpcTransportError('DUPLICATE_REQUEST_ID', 'A request with this ID is already in flight');
    }
    const controller = new AbortController();
    this.active.set(key, controller);
    return controller.signal;
  }

  cancel(id: RpcRequestId): boolean {
    const controller = this.active.get(requestIdKey(id));
    if (!controller) return false;
    controller.abort();
    return true;
  }

  complete(id: RpcRequestId): boolean {
    return this.active.delete(requestIdKey(id));
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const controller of this.active.values()) controller.abort();
    this.active.clear();
  }

  get size(): number {
    return this.active.size;
  }
}
