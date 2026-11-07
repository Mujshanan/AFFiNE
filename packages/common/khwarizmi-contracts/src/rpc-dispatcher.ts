import {
  RequestCancellationRegistry,
  type RpcRequestId,
  RpcTransportError,
} from './rpc-transport.js';

export interface RpcMethodContext {
  requestId: RpcRequestId;
  signal: AbortSignal;
}

export interface RpcMethodDefinition {
  handler: (params: unknown, context: RpcMethodContext) => unknown | Promise<unknown>;
  validateParams?: (params: unknown) => boolean;
}

export type RpcDispatchResponse =
  | { jsonrpc: '2.0'; id: RpcRequestId; result: unknown }
  | {
      jsonrpc: '2.0';
      id: RpcRequestId | null;
      error: { code: number; message: string; data?: unknown };
    };

export class RpcDispatchFailure extends Error {
  constructor(
    readonly code: number,
    message: string,
    readonly data?: unknown
  ) {
    if (!Number.isInteger(code) || code < -32099 || code > -32000)
      throw new RangeError('RPC application error codes must be in the -32000..-32099 range');
    super(message);
    this.name = 'RpcDispatchFailure';
  }
}

type RpcRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is RpcRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function isRequestId(value: unknown): value is RpcRequestId {
  return (
    (typeof value === 'string' && value.length > 0) ||
    (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0)
  );
}

function errorResponse(
  id: RpcRequestId | null,
  code: number,
  message: string,
  data?: unknown
): RpcDispatchResponse {
  return {
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message,
      ...(data === undefined ? {} : { data }),
    },
  };
}

/**
 * In-process JSON-RPC dispatcher. It is transport-neutral: Electron main,
 * worker, and test hosts provide the method table and the byte-pipe separately.
 */
export class RpcRequestDispatcher {
  private readonly cancellation = new RequestCancellationRegistry();
  private readonly methods: Map<string, RpcMethodDefinition>;
  private closed = false;

  constructor(
    methods: Record<string, RpcMethodDefinition>,
    private readonly maxConcurrentRequests = 8
  ) {
    if (
      !Number.isSafeInteger(maxConcurrentRequests) ||
      maxConcurrentRequests < 1 ||
      maxConcurrentRequests > 64
    )
      throw new RangeError('maxConcurrentRequests must be between 1 and 64');
    this.methods = new Map(Object.entries(methods));
    if ([...this.methods.keys()].some(name => !name || name === '$/cancelRequest'))
      throw new TypeError('RPC method names must be non-empty and cannot replace cancellation');
  }

  get activeCount(): number {
    return this.cancellation.size;
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.cancellation.close();
  }

  async dispatch(message: unknown): Promise<RpcDispatchResponse | null> {
    if (!isRecord(message) || message.jsonrpc !== '2.0' || typeof message.method !== 'string' || !message.method)
      return errorResponse(null, -32600, 'Invalid Request');

    // Cancellation is a JSON-RPC notification and therefore has no response.
    if (message.method === '$/cancelRequest' && !Object.prototype.hasOwnProperty.call(message, 'id')) {
      const params = isRecord(message.params) ? message.params : undefined;
      if (params && isRequestId(params.id)) this.cancellation.cancel(params.id);
      return null;
    }

    // Other notifications are intentionally not dispatched in v1.
    if (!Object.prototype.hasOwnProperty.call(message, 'id')) return null;
    if (message.method === '$/cancelRequest')
      return errorResponse(null, -32600, 'Cancellation must be sent as a notification');

    const id = message.id;
    if (!isRequestId(id))
      return errorResponse(null, -32600, 'Invalid Request ID');

    const params = message.params ?? {};
    if (!(isRecord(params) || Array.isArray(params)))
      return errorResponse(id, -32602, 'Invalid params');

    const definition = this.methods.get(message.method);
    if (!definition) return errorResponse(id, -32601, 'Method not found');
    if (definition.validateParams) {
      try {
        if (!definition.validateParams(params))
          return errorResponse(id, -32602, 'Invalid params');
      } catch {
        return errorResponse(id, -32602, 'Invalid params');
      }
    }

    if (this.closed)
      return errorResponse(id, -32000, 'RPC host is closed');
    if (this.cancellation.size >= this.maxConcurrentRequests)
      return errorResponse(id, -32002, 'Server concurrency limit exceeded');

    let signal: AbortSignal;
    try {
      signal = this.cancellation.begin(id);
    } catch (error) {
      if (error instanceof RpcTransportError) {
        if (error.code === 'DUPLICATE_REQUEST_ID')
          return errorResponse(id, -32600, 'Duplicate active request ID');
        if (error.code === 'HOST_CLOSED')
          return errorResponse(id, -32000, 'RPC host is closed');
      }
      return errorResponse(id, -32600, 'Invalid Request ID');
    }

    try {
      const result = await definition.handler(params, { requestId: id, signal });
      if (signal.aborted) return errorResponse(id, -32800, 'Request cancelled');
      return { jsonrpc: '2.0', id, result };
    } catch (error) {
      if (signal.aborted) return errorResponse(id, -32800, 'Request cancelled');
      if (error instanceof RpcDispatchFailure)
        return errorResponse(id, error.code, error.message, error.data);
      return errorResponse(id, -32603, 'Internal error');
    } finally {
      this.cancellation.complete(id);
    }
  }
}
