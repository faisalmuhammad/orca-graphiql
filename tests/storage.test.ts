import { describe, expect, it } from 'vitest';
import type { StorageApi } from '../src/shared/orca-api';
import { createSessionStorage } from '../src/persistence/storage';
describe('GraphiQL local state isolation', () => {
  it('isolates sessions and environments and strips headers and responses', async () => {
    const values = new Map<string, any>();
    const host = { get: async (key: string) => values.get(key) ?? null, set: async (key: string, value: any) => { values.set(key, value); } } as StorageApi;
    const first = await createSessionStorage(host, 'session-a', 'dev', true);
    first.storage.setItem('graphiql:tabState', JSON.stringify({ tabs: [{ query: '{ hello }', headers: 'Authorization: secret', response: 'sensitive result' }] }));
    await first.flush();
    expect(JSON.stringify([...values.values()])).not.toContain('secret'); expect(JSON.stringify([...values.values()])).not.toContain('sensitive result');
    const reopened = await createSessionStorage(host, 'session-a', 'dev', true);
    expect(reopened.storage.getItem('graphiql:tabState')).toContain('{ hello }');
    expect((await createSessionStorage(host, 'session-b', 'dev', true)).storage.getItem('graphiql:tabState')).toBeNull();
    expect((await createSessionStorage(host, 'session-a', 'prod', true)).storage.getItem('graphiql:tabState')).toBeNull();
    expect((await createSessionStorage(host, 'session-a', 'dev', true, 'https://other.example/graphql')).storage.getItem('graphiql:tabState')).toBeNull();
  });
  it('uses memory when history persistence is disabled and enforces the size bound', async () => {
    const host = { get: async () => null, set: async () => { throw new Error('Must not persist'); } } as unknown as StorageApi;
    const store = await createSessionStorage(host, 'session-a', 'dev', false);
    store.storage.setItem('query', '{ hello }'); await store.flush();
    expect(() => store.storage.setItem('query', 'x'.repeat(600000))).toThrow('512 KiB');
  });
});
