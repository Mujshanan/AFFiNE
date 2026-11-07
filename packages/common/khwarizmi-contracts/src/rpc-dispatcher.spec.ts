import { describe, expect, it } from 'vitest';

import {
  RpcDispatchFailure,
  RpcRequestDispatcher,
} from './rpc-dispatcher.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('Khwarizmi JSON-RPC dispatcher', () => {
  it('dispatches a registered method and preserves request correlation', async () => {
    const dispatcher = new RpcRequestDispatcher({
      'document.evaluate': {
        validateParams: params =>
          typeof params === 'object' && params !== null && !Array.isArray(params),
        handler: params => ({ accepted: true, params }),
      },
    });

    await expect(
      dispatcher.dispatch({
        jsonrpc: '2.0',
        id: 'eval-1',
        method: 'document.evaluate',
        params: { documentId: 'doc-1' },
      })
    ).resolves.toEqual({
      jsonrpc: '2.0',
      id: 'eval-1',
      result: { accepted: true, params: { documentId: 'doc-1' } },
    });
    expect(dispatcher.activeCount).toBe(0);
  });

  it('returns stable errors for invalid requests, params, and unknown methods', async () => {
    const dispatcher = new RpcRequestDispatcher({
      'document.evaluate': {
        validateParams: params =>
          typeof params === 'object' && params !== null && 'documentId' in params,
        handler: () => 'unused',
      },
    });

    await expect(dispatcher.dispatch(null)).resolves.toMatchObject({
      error: { code: -32600, message: 'Invalid Request' },
    });
    await expect(
      dispatcher.dispatch({
        jsonrpc: '2.0',
        id: -1,
        method: 'document.evaluate',
      })
    ).resolves.toMatchObject({ error: { code: -32600 } });
    await expect(
      dispatcher.dispatch({
        jsonrpc: '2.0',
        id: 2,
        method: 'document.missing',
      })
    ).resolves.toMatchObject({ id: 2, error: { code: -32601 } });
    await expect(
      dispatcher.dispatch({
        jsonrpc: '2.0',
        id: 3,
        method: 'document.evaluate',
        params: { wrong: true },
      })
    ).resolves.toMatchObject({ id: 3, error: { code: -32602 } });
  });

  it('rejects duplicate in-flight IDs and enforces the concurrency limit', async () => {
    const firstWork = deferred<string>();
    const secondWork = deferred<string>();
    const dispatcher = new RpcRequestDispatcher({
      work: {
        handler: params =>
          (params as { key: string }).key === 'first'
            ? firstWork.promise
            : secondWork.promise,
      },
    }, 1);

    const first = dispatcher.dispatch({
      jsonrpc: '2.0',
      id: 'same',
      method: 'work',
      params: { key: 'first' },
    });
    const duplicate = await dispatcher.dispatch({
      jsonrpc: '2.0',
      id: 'same',
      method: 'work',
      params: { key: 'second' },
    });
    expect(duplicate).toMatchObject({ error: { code: -32600 } });

    const limited = await dispatcher.dispatch({
      jsonrpc: '2.0',
      id: 'other',
      method: 'work',
      params: { key: 'second' },
    });
    expect(limited).toMatchObject({ error: { code: -32002 } });

    firstWork.resolve('first-result');
    await expect(first).resolves.toMatchObject({
      id: 'same',
      result: 'first-result',
    });
    expect(dispatcher.activeCount).toBe(0);
  });

  it('aborts a running method when a cancellation notification arrives', async () => {
    const work = deferred<string>();
    let signal: AbortSignal | undefined;
    const dispatcher = new RpcRequestDispatcher({
      work: {
        handler: (_params, context) => {
          signal = context.signal;
          return work.promise;
        },
      },
    });

    const pending = dispatcher.dispatch({
      jsonrpc: '2.0',
      id: 'cancel-me',
      method: 'work',
    });
    await dispatcher.dispatch({
      jsonrpc: '2.0',
      method: '$/cancelRequest',
      params: { id: 'cancel-me' },
    });
    expect(signal?.aborted).toBe(true);
    work.resolve('late-result');
    await expect(pending).resolves.toMatchObject({
      id: 'cancel-me',
      error: { code: -32800, message: 'Request cancelled' },
    });
  });

  it('does not dispatch ordinary notifications and aborts active work on close', async () => {
    const work = deferred<string>();
    let calls = 0;
    let signal: AbortSignal | undefined;
    const dispatcher = new RpcRequestDispatcher({
      work: {
        handler: (_params, context) => {
          calls++;
          signal = context.signal;
          return work.promise;
        },
      },
    });

    await expect(
      dispatcher.dispatch({ jsonrpc: '2.0', method: 'work' })
    ).resolves.toBeNull();
    expect(calls).toBe(0);

    const pending = dispatcher.dispatch({
      jsonrpc: '2.0',
      id: 1,
      method: 'work',
    });
    dispatcher.close();
    expect(signal?.aborted).toBe(true);
    work.resolve('late-result');
    await expect(pending).resolves.toMatchObject({
      id: 1,
      error: { code: -32800 },
    });
    await expect(
      dispatcher.dispatch({ jsonrpc: '2.0', id: 2, method: 'work' })
    ).resolves.toMatchObject({ error: { code: -32000 } });
  });

  it('maps declared failures and hides unexpected exception details', async () => {
    const dispatcher = new RpcRequestDispatcher({
      declared: {
        handler: () => {
          throw new RpcDispatchFailure(4220, 'Document revision conflict', {
            expected: 'a',
            actual: 'b',
          });
        },
      },
      unexpected: {
        handler: () => {
          throw new Error('private implementation detail');
        },
      },
    });

    await expect(
      dispatcher.dispatch({ jsonrpc: '2.0', id: 1, method: 'declared' })
    ).resolves.toMatchObject({
      error: {
        code: 4220,
        message: 'Document revision conflict',
        data: { expected: 'a', actual: 'b' },
      },
    });
    await expect(
      dispatcher.dispatch({ jsonrpc: '2.0', id: 2, method: 'unexpected' })
    ).resolves.toMatchObject({
      error: { code: -32603, message: 'Internal error' },
    });
  });
});
