import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createCollectionsStorage } from '../src/persistence/collections';
import { parseSession, serializeSession } from '../src/shared/session-schema';
import type { SessionController } from '../src/persistence/session';
describe('official Collections workspace storage', () => {
  it('uses saved operations and strips headers and variables from file writes', async () => {
    let session = parseSession(readFileSync('templates/countries.graphiql', 'utf8'));
    const update = vi.fn(next => { session = next; });
    const controller = { sessionId: 'test', update, flush: async () => {} } as unknown as SessionController;
    const adapter = createCollectionsStorage(controller, () => session, next => { session = next; }, vi.fn());
    const loaded = await adapter.load(); expect(loaded[0].items[0].name).toBe('GetCountry');
    loaded[0].items[0].headers = '{"Authorization":"secret"}'; loaded[0].items[0].variables = '{"token":"secret"}';
    await adapter.save(loaded);
    expect(serializeSession(session)).not.toContain('secret'); expect(session.operations).toHaveLength(1);
  });
  it('propagates a read-only refusal without overwriting the document', async () => {
    const session = parseSession(readFileSync('templates/empty.graphiql', 'utf8'));
    const error = vi.fn();
    const adapter = createCollectionsStorage({ sessionId: 'test', update: () => { throw new Error('Read only'); } } as unknown as SessionController, () => session, vi.fn(), error);
    await expect(adapter.save([])).rejects.toThrow('Read only'); expect(error).toHaveBeenCalled(); expect(session.collections).toEqual([]);
  });
});
