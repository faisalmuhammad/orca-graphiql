import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseSession, serializeSession, environmentSchema } from '../src/shared/session-schema';
import { mergeSessions } from '../src/persistence/merge';
const empty = () => parseSession(readFileSync('../templates/empty.graphiql', 'utf8'));
describe('session persistence', () => {
  it('keeps a valid empty default and a separate Countries example', () => {
    expect(empty().environments).toEqual([]); expect(empty().operations).toEqual([]);
    const example = parseSession(readFileSync('../templates/countries.graphiql', 'utf8'));
    expect(example.environments[0].endpoint).toBe('https://countries.trevorblades.com/');
    expect(parseSession(serializeSession(example))).toEqual(example);
  });
  it('rejects malformed, unsupported, duplicate and plaintext credential files', () => {
    expect(() => parseSession('{')).toThrow('valid JSON');
    expect(() => parseSession(JSON.stringify({ ...empty(), schemaVersion: 2 }))).toThrow('schemaVersion');
    const env = environmentSchema.parse({ id: 'dev', name: 'Dev', endpoint: 'http://localhost:4000' });
    expect(() => parseSession(JSON.stringify({ ...empty(), environments: [env, env] }))).toThrow('unique');
    expect(() => parseSession(JSON.stringify({ ...empty(), environments: [{ ...env, headers: { Authorization: 'secret' } }] }))).toThrow('Sensitive');
    expect(() => parseSession(JSON.stringify({ ...empty(), token: 'secret' }))).toThrow();
    expect(() => environmentSchema.parse({ ...env, headers: { 'X-Custom': 'value\r\nInjected: header' } })).toThrow();
  });
  it('merges independent edits by environment identity', () => {
    const env = environmentSchema.parse({ id: 'dev', name: 'Dev', endpoint: 'http://localhost:4000' });
    const base = { ...empty(), environments: [env] };
    const outside = { ...base, name: 'Changed outside' };
    const mine = { ...base, environments: [{ ...env, name: 'Changed locally' }] };
    expect(mergeSessions(base, outside, mine)).toMatchObject({ name: 'Changed outside', environments: [{ name: 'Changed locally' }] });
  });
  it('refuses competing edits and delete-versus-edit conflicts', () => {
    const base = empty();
    expect(() => mergeSessions(base, { ...base, name: 'outside' }, { ...base, name: 'mine' })).toThrow('outside');
    const env = environmentSchema.parse({ id: 'dev', name: 'Dev', endpoint: 'http://localhost:4000' });
    const original = { ...base, environments: [env] };
    expect(() => mergeSessions(original, { ...original, environments: [] }, { ...original, environments: [{ ...env, name: 'changed' }] })).toThrow();
  });
  it('refuses session documents larger than the native transport budget', () => {
    expect(() => parseSession(' '.repeat(800000))).toThrow('768 KiB');
    const query = '#' + 'x'.repeat(200000);
    const session = { ...empty(), operations: Array.from({ length: 4 }, (_, index) => ({ id: 'operation-' + index, name: 'Operation', query })) };
    expect(() => serializeSession(session)).toThrow('768 KiB');
  });
});
