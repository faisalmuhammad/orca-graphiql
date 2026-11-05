import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { openSession } from '../src/persistence/session';
import { parseSession, serializeSession } from '../src/shared/session-schema';

// Orca's test runner supplies its real frame shell. Plain Vitest skips these tests.
const testModule = 'orca/testing';
const kit = await import(/* @vite-ignore */ testModule).catch(() => null);
let host: any;
let controller: Awaited<ReturnType<typeof openSession>> | undefined;
const empty = readFileSync('../templates/empty.graphiql', 'utf8');
afterEach(() => { controller?.dispose(); controller = undefined; host?.dispose(); });
describe.skipIf(!kit)('native Orca document session', () => {
  it('assigns independent persistent identities to copied Countries examples', async () => {
    const countries = readFileSync('../templates/countries.graphiql', 'utf8');
    host = kit.mockEditorHost({ text: countries });
    controller = await openSession(host.orca);
    await host.flush();
    const otherHost = kit.mockEditorHost({ text: countries });
    const otherController = await openSession(otherHost.orca);
    try {
      await otherHost.flush();
      expect(controller.sessionId).not.toBe(otherController.sessionId);
      expect(parseSession(host.text).sessionId).toBe(controller.sessionId);
      expect(parseSession(otherHost.text).sessionId).toBe(otherController.sessionId);
    } finally { otherController.dispose(); otherHost.dispose(); }
  });
  it('initializes identity, flushes configuration, and reloads outside edits', async () => {
    host = kit.mockEditorHost({ text: empty });
    controller = await openSession(host.orca);
    expect(controller.sessionId).toMatch(/^[0-9a-f-]{36}$/);
    controller.update({ ...controller.initial, name: 'Saved session' });
    await host.flush();
    expect(parseSession(host.text).name).toBe('Saved session');
    let replaced: any;
    controller.subscribe(value => { replaced = value; });
    host.replace(serializeSession({ ...parseSession(host.text), name: 'External edit' }));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(replaced.name).toBe('External edit');
  });
  it('refuses read-only configuration updates without any document edit', async () => {
    host = kit.mockEditorHost({ text: empty }, { readOnly: true });
    controller = await openSession(host.orca);
    expect(() => controller!.update({ ...controller!.initial, name: 'No' })).toThrow('read-only');
    await host.flush();
    expect(host.text).toBe(empty);
    expect(host.edits).toHaveLength(0);
  });
  it('retains a conflicting draft and lets the user choose it explicitly', async () => {
    host = kit.mockEditorHost({ text: empty });
    controller = await openSession(host.orca);
    await controller.flush();
    const base = parseSession(host.text);
    let draft: any;
    controller.subscribe((_value, conflict) => { draft = conflict; });
    host.conflictNext(serializeSession({ ...base, name: 'Outside' }));
    controller.update({ ...base, name: 'Mine' });
    await controller.flush();
    expect(draft.mine.name).toBe('Mine');
    expect(draft.outside.name).toBe('Outside');
    expect(() => controller!.update(base)).toThrow('Resolve');
    controller.resolve('mine');
    await host.flush();
    expect(parseSession(host.text).name).toBe('Mine');
  });
});
