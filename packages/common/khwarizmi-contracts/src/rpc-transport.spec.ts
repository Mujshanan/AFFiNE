import { describe, expect, it } from 'vitest';

import {
  decodeRpcPayload,
  encodeRpcFrame,
  RequestCancellationRegistry,
  RPC_MAX_FRAME_BYTES,
  RpcFrameDecoder,
  RpcTransportError,
} from './rpc-transport.js';

function expectTransportCode(
  action: () => unknown,
  code: RpcTransportError['code']
): void {
  let thrown: unknown;
  try {
    action();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(RpcTransportError);
  expect((thrown as RpcTransportError).code).toBe(code);
}

describe('Khwarizmi RPC v1 framing', () => {
  it('encodes a four-byte unsigned little-endian length prefix', () => {
    const frame = encodeRpcFrame('{"jsonrpc":"2.0"}');
    const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);

    expect(view.getUint32(0, true)).toBe(frame.byteLength - 4);
    expect(decodeRpcPayload(frame.slice(4))).toEqual({ jsonrpc: '2.0' });
  });

  it('decodes a fragmented header and fragmented payload', () => {
    const frame = encodeRpcFrame('{"id":"fragmented"}');
    const decoder = new RpcFrameDecoder();

    expect(decoder.push(frame.slice(0, 2))).toEqual([]);
    expect(decoder.push(frame.slice(2, 7))).toEqual([]);
    const payloads = decoder.push(frame.slice(7));

    expect(payloads).toHaveLength(1);
    expect(decodeRpcPayload(payloads[0])).toEqual({ id: 'fragmented' });
    expect(() => decoder.finish()).not.toThrow();
  });

  it('decodes multiple coalesced frames in order', () => {
    const first = encodeRpcFrame('{"id":1}');
    const second = encodeRpcFrame('{"id":2}');
    const combined = new Uint8Array(first.length + second.length);
    combined.set(first);
    combined.set(second, first.length);

    const decoder = new RpcFrameDecoder();
    const payloads = decoder.push(combined);

    expect(payloads.map(decodeRpcPayload)).toEqual([{ id: 1 }, { id: 2 }]);
    expect(() => decoder.finish()).not.toThrow();
  });

  it('rejects zero-length and oversized frames from the header alone', () => {
    const zero = new Uint8Array(4);
    const oversized = new Uint8Array(4);
    new DataView(oversized.buffer).setUint32(0, RPC_MAX_FRAME_BYTES + 1, true);

    expectTransportCode(
      () => new RpcFrameDecoder().push(zero),
      'INVALID_FRAME_LENGTH'
    );
    expectTransportCode(
      () => new RpcFrameDecoder().push(oversized),
      'FRAME_TOO_LARGE'
    );
    expectTransportCode(
      () => encodeRpcFrame(new Uint8Array(RPC_MAX_FRAME_BYTES + 1)),
      'FRAME_TOO_LARGE'
    );
  });

  it('rejects truncated header and payload at end-of-stream', () => {
    const decoder = new RpcFrameDecoder();
    expect(decoder.push(new Uint8Array([1, 0]))).toEqual([]);
    expectTransportCode(() => decoder.finish(), 'TRUNCATED_FRAME');

    const payloadDecoder = new RpcFrameDecoder();
    payloadDecoder.push(encodeRpcFrame('{"id":1}').slice(0, 6));
    expectTransportCode(() => payloadDecoder.finish(), 'TRUNCATED_FRAME');
  });

  it('rejects invalid UTF-8, invalid JSON, primitive payloads, and JSON-RPC batches', () => {
    expectTransportCode(
      () => decodeRpcPayload(new Uint8Array([0xff])),
      'INVALID_UTF8'
    );
    expectTransportCode(
      () => decodeRpcPayload(new TextEncoder().encode('{')),
      'INVALID_JSON'
    );
    expectTransportCode(
      () => decodeRpcPayload(new TextEncoder().encode('42')),
      'INVALID_JSON'
    );
    expectTransportCode(
      () => decodeRpcPayload(new TextEncoder().encode('[]')),
      'RPC_BATCH_UNSUPPORTED'
    );
  });
});

describe('Khwarizmi RPC v1 request cancellation', () => {
  it('tracks request IDs without conflating numeric and string IDs', () => {
    const registry = new RequestCancellationRegistry();
    const stringSignal = registry.begin('7');
    const numberSignal = registry.begin(7);

    expect(registry.size).toBe(2);
    expect(registry.cancel('7')).toBe(true);
    expect(stringSignal.aborted).toBe(true);
    expect(numberSignal.aborted).toBe(false);
    expect(registry.complete('7')).toBe(true);
    expect(registry.complete(7)).toBe(true);
    expect(registry.size).toBe(0);
  });

  it('rejects duplicate active IDs and invalid IDs', () => {
    const registry = new RequestCancellationRegistry();
    registry.begin('same');

    expectTransportCode(() => registry.begin('same'), 'DUPLICATE_REQUEST_ID');
    expectTransportCode(() => registry.begin(''), 'INVALID_REQUEST_ID');
    expectTransportCode(() => registry.begin(-1), 'INVALID_REQUEST_ID');
  });

  it('makes cancellation idempotent and ignores unknown or completed IDs', () => {
    const registry = new RequestCancellationRegistry();
    const signal = registry.begin(9);

    expect(registry.cancel(404)).toBe(false);
    expect(registry.cancel(9)).toBe(true);
    expect(registry.cancel(9)).toBe(true);
    expect(signal.aborted).toBe(true);
    expect(registry.complete(9)).toBe(true);
    expect(registry.cancel(9)).toBe(false);
  });

  it('aborts and clears all in-flight requests when the host closes', () => {
    const registry = new RequestCancellationRegistry();
    const first = registry.begin('first');
    const second = registry.begin('second');

    registry.close();

    expect(first.aborted).toBe(true);
    expect(second.aborted).toBe(true);
    expect(registry.size).toBe(0);
    expectTransportCode(() => registry.begin('after-close'), 'HOST_CLOSED');
  });
});
