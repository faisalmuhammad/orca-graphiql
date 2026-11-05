import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseSession, serializeSession } from '../src/shared/session-schema';
import { mockWorker } from './helpers/worker';
const sessionId = 'be699eb4-c1e2-48b0-865f-19f7a73a1f0c';
describe('Explorer file navigation and management', () => {
  it('indexes native session saves and opens exactly that file through the public API', async () => {
    const worker = mockWorker();
    worker.api.host.call.mockImplementation(async method => method === 'workspace.list' ? { workspaces: [{ id: 'workspace-1', name: 'Fixture', path: '/workspace', hostId: 'local' }], truncated: false } as any : { opened: true } as any);
    const session = { ...parseSession(readFileSync('../templates/countries.graphiql', 'utf8')), sessionId };
    await worker.hook('editor.save.before', { workspaceId: 'workspace-1', path: '/workspace/countries.graphiql', text: serializeSession(session) });
    const list = await worker.call('activity.list');
    expect(list[0].file).toEqual({ workspaceId: 'workspace-1', path: '/workspace/countries.graphiql' });
    expect((await worker.call('activity.open', { sessionId })).ok).toBe(true);
    expect(worker.api.host.call).toHaveBeenCalledWith('editor.open', { workspaceId: 'workspace-1', path: 'countries.graphiql' });
    await worker.hook('editor.save.before', { workspaceId: 'workspace-1', path: '/workspace/other.json', text: 'secret-other-document' });
    expect(JSON.stringify([...worker.storage.values()])).not.toContain('secret-other-document');
  });
  it('removes an Explorer record without deleting a file or disconnecting its endpoint', async () => {
    const worker = mockWorker();
    await worker.call('activity.register', { sessionId, name: 'Countries', environment: 'Countries' });
    await worker.call('activity.remove', { sessionId });
    expect(await worker.call('activity.list')).toEqual([]);
    expect(worker.api.host.call).not.toHaveBeenCalled();
  });
  it('requires the target editor to acknowledge a rename and rejects read-only sessions', async () => {
    const worker = mockWorker();
    await worker.call('activity.register', { sessionId, name: 'Countries', environment: 'Countries' });
    const pending = worker.call('activity.rename', { editorId: worker.context.panel.id, name: 'My session' });
    const post = worker.api.panels.post.mock.calls.find(args => args[0] === 'editor.rename')!;
    const payload = post[1] as { requestId: string };
    const stranger = { ...worker.context, panel: { ...worker.context.panel, id: 'other-editor' } };
    await worker.call('activity.rename-result', { requestId: payload.requestId, ok: true }, stranger);
    await worker.call('activity.rename-result', { requestId: payload.requestId, ok: true });
    expect((await pending).ok).toBe(true);
    expect((await worker.call('activity.list'))[0].name).toBe('My session');
    await worker.call('activity.register', { sessionId, name: 'Read only', environment: 'Countries', readOnly: true });
    expect((await worker.call('activity.rename', { editorId: worker.context.panel.id, name: 'Denied' })).ok).toBe(false);
  });
});
