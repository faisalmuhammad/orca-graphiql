import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { environmentSchema } from '../src/shared/session-schema';
import type { Operation } from "../src/shared/protocol";
import { mockWorker } from './helpers/worker';
import { httpExecute } from '../src/worker/transport';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
describe('worker safety and transport', () => {
  let worker: ReturnType<typeof mockWorker>;
  const environment = () => environmentSchema.parse({ id: 'local', name: 'Local', endpoint: 'http://localhost:4010/graphql' });
  const sessionId = '6d31af4a-64e5-4f14-b2a9-73c9b0969238';
  const operation = { query: 'query { hello }' };
  async function approve(patch: Record<string, unknown> = {}, credential?: unknown) { const result = await worker.call('connection.approve', { sessionId, environment: { ...environment(), ...patch }, allowInsecure: false, credential }); expect(result.ok).toBe(true); return result.value.approvalId as string; }
  const request = (approvalId: string, op: Operation = operation, extra = {}) => ({ approvalId, requestId: crypto.randomUUID(), operation: op, confirmedMutation: false, ...extra });
  beforeEach(() => { worker = mockWorker(); vi.stubGlobal('fetch', vi.fn(async () => json({ data: { hello: 'ok' } }))); });
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
  it('requires per-editor connection approval and never fetches on file registration', async () => {
    await worker.call('activity.register', { sessionId, name: 'Local', environment: 'Local' });
    expect(fetch).not.toHaveBeenCalled();
    expect((await worker.call('graphql.execute', request('missing'))).error.kind).toBe('approval');
    const id = await approve();
    const result = await worker.call('graphql.execute', request(id), { ...worker.context, panel: { ...worker.context.panel, id: 'other' } });
    expect(result.error.kind).toBe('approval');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('refuses URL credentials and insecure remote endpoints without confirmation', async () => {
    for (const endpoint of ['file:///tmp/a', 'https://user:password@example.com', 'https://example.com/?token=secret', 'http://example.com/graphql']) {
      const result = await worker.call('connection.approve', { sessionId, environment: { ...environment(), endpoint }, allowInsecure: false });
      expect(result.ok).toBe(false);
    }
    expect(fetch).not.toHaveBeenCalled();
  });
  it('preserves GraphQL errors with HTTP status and redacts reflected secrets', async () => {
    const id = await approve({}, { type: 'bearer', value: 'fixture-token', persist: false });
    vi.mocked(fetch).mockResolvedValueOnce(json({ data: null, errors: [{ message: 'Rejected fixture-token' }] }, 400));
    const result = await worker.call('graphql.execute', request(id));
    expect(result.ok).toBe(true); expect(result.value.status).toBe(400);
    expect(result.value.body.errors[0].message).toBe('Rejected [redacted]');
  });
  it('refuses redirects without following them or forwarding credentials', async () => {
    const id = await approve({}, { type: 'api-key', value: 'fixture-key', header: 'X-API-Key', persist: false });
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: 'https://other.example/graphql' } }));
    const result = await worker.call('graphql.execute', request(id));
    expect(result.error.kind).toBe('http'); expect(result.error.message).toContain('Redirects are refused');
    expect(vi.mocked(fetch).mock.calls.at(-1)![1]!.redirect).toBe('manual');
  });
  it('redacts short credentials reflected in GraphQL errors', async () => {
    const id = await approve({}, { type: 'api-key', value: 'abc', header: 'X-API-Key', persist: false });
    vi.mocked(fetch).mockResolvedValueOnce(json({ errors: [{ message: 'Invalid key abc', extensions: { reason: 'abc' } }] }));
    const result = await worker.call('graphql.execute', request(id));
    expect(result.value.body.errors[0]).toEqual({ message: 'Invalid key [redacted]', extensions: { reason: '[redacted]' } });
  });
  it('requires confirmation only for selected production mutations', async () => {
    const id = await approve({ production: true });
    const mutation = { query: 'query Q { hello } mutation M { increment }', operationName: 'M' };
    expect((await worker.call('graphql.execute', request(id, mutation))).error.kind).toBe('production');
    expect((await worker.call('graphql.execute', request(id, mutation, { confirmedMutation: true }))).ok).toBe(true);
    expect((await worker.call('graphql.execute', request(id, { ...mutation, operationName: 'Q' }))).ok).toBe(true);
  });
  it('rejects oversized requests and responses without displaying truncated data', async () => {
    const id = await approve();
    expect((await worker.call('graphql.execute', request(id, { query: 'x'.repeat(270000) }))).error.kind).toBe('limit');
    vi.mocked(fetch).mockResolvedValueOnce(json({ data: { huge: 'x'.repeat(800000) } }));
    expect((await worker.call('graphql.execute', request(id))).error.message).toContain('768 KiB');
  });
  it('binds secure credentials to an exact endpoint, session and environment', async () => {
    await approve({}, { type: 'bearer', value: 'fixture-token', persist: true });
    const secretId = [...worker.secrets.keys()][0];
    const result = await worker.call('connection.approve', { sessionId, environment: { ...environment(), endpoint: 'https://other.example/graphql', auth: { type: 'bearer', secretId } }, allowInsecure: false });
    expect(result.error.kind).toBe('approval');
    expect(worker.secrets.get(secretId)).toContain('fixture-token');
    expect(JSON.stringify([...worker.storage.values()])).not.toContain('fixture-token');
  });
  it('requires explicit temporary credentials if OS secret protection is unavailable', async () => {
    worker = mockWorker(false);
    const failed = await worker.call('connection.approve', { sessionId, environment: environment(), allowInsecure: false, credential: { type: 'bearer', value: 'fixture-token', persist: true } });
    expect(failed.error.kind).toBe('secrets'); expect(worker.secrets.size).toBe(0);
    const id = await approve({}, { type: 'bearer', value: 'fixture-token', persist: false });
    expect(id).toBeTruthy(); expect(worker.secrets.size).toBe(0);
  });
  it('does not allow alternate-case request headers to override saved authentication', async () => {
    const id = await approve({}, { type: 'bearer', value: 'fixture-token', persist: false });
    await worker.call('graphql.execute', request(id, operation, { headers: { authorization: 'Bearer other-token' } }));
    const headers = vi.mocked(fetch).mock.calls.at(-1)![1]!.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer fixture-token');
    expect(Object.keys(headers).filter(k => k.toLowerCase() === 'authorization')).toHaveLength(1);
  });
  it('rejects subscriptions and incremental directives with clear errors', async () => {
    const id = await approve();
    for (const query of ['subscription { changed }', 'query { hello @defer }']) expect((await worker.call('graphql.execute', request(id, { query }))).error.kind).toBe('unsupported');
  });
  it('classifies TLS and connection errors without exposing raw diagnostics', async () => {
    const id = await approve();
    vi.mocked(fetch).mockRejectedValueOnce(Object.assign(new Error('secret-diagnostic'), { cause: { code: 'CERT_HAS_EXPIRED' } }));
    const result = await worker.call('graphql.execute', request(id));
    expect(result.error.kind).toBe('tls'); expect(result.error.message).not.toContain('secret-diagnostic');
  });
  it('aborts transport after the timeout and reports cancellation separately', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_endpoint, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted'))))));
    const promise = httpExecute(environment().endpoint, operation, {}, 20, new AbortController().signal);
    const check = expect(promise).rejects.toMatchObject({ kind: 'timeout' });
    await vi.advanceTimersByTimeAsync(21); await check;
    const cancel = new AbortController();
    const next = httpExecute(environment().endpoint, operation, {}, 1000, cancel.signal);
    const cancelled = expect(next).rejects.toMatchObject({ kind: 'cancelled' }); cancel.abort(); await cancelled;
  });
  it('prevents duplicate execution, bounds concurrency, and releases cancelled requests', async () => {
    const id = await approve();
    vi.stubGlobal('fetch', vi.fn((_endpoint, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    })));
    const firstInput = request(id);
    const first = worker.call('graphql.execute', firstInput);
    expect((await worker.call('graphql.execute', request(id))).error.message).toContain('already running');
    const secondInput = request(id, { query: 'query Other { hello }' });
    const second = worker.call('graphql.execute', secondInput);
    expect((await worker.call('graphql.execute', request(id, { query: 'query Third { hello }' }))).error.message).toContain('concurrent');
    await worker.call('graphql.cancel', { requestId: firstInput.requestId });
    await worker.call('graphql.cancel', { requestId: secondInput.requestId });
    expect((await first).error.kind).toBe('cancelled');
    expect((await second).error.kind).toBe('cancelled');
    vi.mocked(fetch).mockResolvedValue(json({ data: { hello: 'recovered' } }));
    expect((await worker.call('graphql.execute', request(id))).value.body.data.hello).toBe('recovered');
  });
  it('cleans newly persisted credentials after a failed connection with default auth', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(json({ errors: [{ message: 'Rejected' }] }, 401));
    const result = await worker.call('connection.approve', { sessionId, environment: { id: 'dev', name: 'Dev', endpoint: 'http://localhost:4010' }, credential: { type: 'bearer', value: 'fixture-token', persist: true } });
    expect(result.error.kind).toBe('authentication');
    expect(worker.secrets.size).toBe(0);
  });
});
