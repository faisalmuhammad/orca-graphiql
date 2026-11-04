import { describe, expect, it, vi } from 'vitest';
import type { OrcaFrameApi } from '../src/shared/orca-api';
import { createWorkerTransport } from '../src/editor/transport';
import { environmentSchema } from '../src/shared/session-schema';
function setup(production = false) {
  const request = vi.fn(async (_name, input) => { expect(input).toStrictEqual(JSON.parse(JSON.stringify(input))); return { ok: true, value: { body: { data: { hello: 'ok' } }, status: 200, ok: true, totalMs: 1, requestBytes: 1, responseBytes: 1 } }; });
  const confirmMutation = vi.fn().mockResolvedValue(true);
  const environment = environmentSchema.parse({ id: 'dev', name: 'Dev', endpoint: 'https://example.com/graphql', production });
  const bridge = createWorkerTransport({ plugin: { request } } as unknown as OrcaFrameApi, environment, 'approval', { status: vi.fn(), failure: vi.fn(), confirmMutation });
  return { bridge, request, confirmMutation };
}
describe('official GraphiQL transport adapter', () => {
  it('sends only JSON across Orca IPC, including GraphiQL undefined optional fields', async () => {
    const { bridge, request } = setup();
    await bridge.transport.send({ query: 'query GetCountry { country(code: "DE") { name } }', variables: undefined, operationName: 'GetCountry', headers: undefined });
    expect(request.mock.calls[0][1].operation).toStrictEqual({ query: 'query GetCountry { country(code: "DE") { name } }', operationName: 'GetCountry' });
  });
  it('preserves variables, null values and GraphQL extensions', async () => {
    const { bridge, request } = setup();
    await bridge.transport.send({ query: '{ hello }', variables: { code: 'DE', optional: null }, extensions: { trace: true } });
    expect(request.mock.calls[0][1].operation).toStrictEqual({ query: '{ hello }', variables: { code: 'DE', optional: null }, extensions: { trace: true } });
  });
  it('does not request networking before explicit connection approval', async () => {
    const request = vi.fn();
    const bridge = createWorkerTransport({ plugin: { request } } as unknown as OrcaFrameApi, null, null, { status: vi.fn(), failure: vi.fn(), confirmMutation: vi.fn() });
    await expect(bridge.transport.send({ query: '{ hello }' })).rejects.toThrow('Connect');
    expect(request).not.toHaveBeenCalled();
  });
  it('does not request production confirmation for queries', async () => {
    const { bridge, confirmMutation } = setup(true);
    await bridge.transport.send({ query: 'query { hello }' });
    expect(confirmMutation).not.toHaveBeenCalled();
  });
  it('requires user confirmation before sending a production mutation', async () => {
    const { bridge, request, confirmMutation } = setup(true); confirmMutation.mockResolvedValue(false);
    await expect(bridge.transport.send({ query: 'mutation M { increment }' })).rejects.toThrow('cancelled');
    expect(request).not.toHaveBeenCalled();
  });
  it('prevents stale requests from replacing the new environment result', async () => {
    const { bridge, request } = setup();
    let resolve: (value: any) => void;
    request.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    const running = bridge.transport.send({ query: '{ hello }' });
    bridge.dispose();
    resolve!({ ok: true, value: { body: { data: { hello: 'stale' } } } });
    await expect(running).rejects.toThrow('cancelled');
  });
});
