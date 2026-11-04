import type { Storage } from '@graphiql/toolkit';
import type { StorageApi } from '../shared/orca-api';
import { LIMITS } from '../shared/protocol';
function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, ['headers', 'response'].includes(key) ? null : sanitize(item)]));
  return value;
}
export async function createSessionStorage(host: StorageApi, sessionId: string, environmentId: string, persist: boolean, endpoint = '') {
  const identity = new TextEncoder().encode(JSON.stringify([sessionId, environmentId, endpoint]));
  const digest = await crypto.subtle.digest('SHA-256', identity);
  const namespace = 'session:' + Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  const value = persist ? await host.get(namespace) : null;
  let cache: Record<string, string> = value && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).filter((pair): pair is [string, string] => typeof pair[1] === 'string')) : {};
  let timer: ReturnType<typeof setTimeout> | undefined;
  let writing = Promise.resolve();
  let failure: Error | null = null;
  function queue() {
    if (!persist) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = undefined; const snapshot = { ...cache }; writing = writing.then(() => host.set(namespace, snapshot)).catch(() => { failure = new Error('Local history could not be persisted.'); }); }, 250);
  }
  const storage: Storage = {
    getItem(key) { return cache[key] ?? null; },
    setItem(key, text) {
      if (/headers/i.test(key)) return;
      let clean: string;
      try { clean = JSON.stringify(sanitize(JSON.parse(text))); } catch { clean = text; }
      const next = { ...cache, [key]: clean };
      if (new TextEncoder().encode(JSON.stringify(next)).byteLength > LIMITS.storageBytes) throw new DOMException('Local GraphiQL history exceeded its 512 KiB limit. Clear history or reduce saved operations.', 'QuotaExceededError');
      cache = next; queue();
    },
    removeItem(key) { delete cache[key]; queue(); },
    clear() { cache = {}; queue(); },
    get length() { return Object.keys(cache).length; },
  };
  return { storage, async flush() { if (timer) { clearTimeout(timer); timer = undefined; const snapshot = { ...cache }; writing = writing.then(() => persist ? host.set(namespace, snapshot) : undefined).catch(() => { failure = new Error('Local history could not be persisted.'); }); } await writing; if (failure) throw failure; }, dispose() { if (timer) clearTimeout(timer); } };
}
export type SessionStorage = Awaited<ReturnType<typeof createSessionStorage>>;
