import { vi } from 'vitest';
import type { OrcaWorkerApi, PanelRequestContext } from '../../src/shared/orca-api';
import activate from '../../src/worker/main';
const activateWorker: typeof activate = process.env.GRAPHIQL_TEST_COMPILED_WORKER === '1'
  ? (await import(new URL('../../../worker/main.mjs', import.meta.url).href)).default
  : activate;
export function mockWorker(secure = true) {
  const handlers = new Map<string, (input: any, context: PanelRequestContext) => any>();
  const hooks = new Map<string, (event: any) => any>();
  const secrets = new Map<string, string>();
  const storage = new Map<string, any>();
  const api = { hooks: { on: (name: string, handler: any) => hooks.set(name, handler) }, panels: { handle: (name: string, handler: any) => handlers.set(name, handler), post: vi.fn() }, storage: { get: async (key: string) => storage.get(key) ?? null, set: async (key: string, value: any) => { storage.set(key, value); } }, secrets: { get: async (key: string) => secrets.get(key) ?? null, set: async (key: string, value: string) => { secrets.set(key, value); }, delete: async (key: string) => { secrets.delete(key); } }, host: { call: vi.fn(async (method: string, _params?: any) => method === 'editor.open' ? { opened: true } : { status: secure ? 'os-keyring' : 'unavailable' }) } };
  activateWorker(api as unknown as OrcaWorkerApi);
  const context = { panel: { id: 'editor-a', surface: 'editor', contributionId: 'graphiql' }, signal: new AbortController().signal } as PanelRequestContext;
  return { secrets, storage, api, context, hook: (name: string, event: any) => hooks.get(name)!(event), call: (name: string, input?: any, caller = context) => handlers.get(name)!(input, caller) };
}
