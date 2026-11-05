import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import { buildSchema, graphql, getIntrospectionQuery } from 'graphql';
import { httpExecute } from '../src/worker/transport';
const schema = buildSchema('type Query { hello: String!, echo(message: String!): String! } type Mutation { increment: Int! }');
let count = 0;
let forwarded = 0;
const server = createServer(async (req, res) => {
  const respond = (body: unknown, status = 200) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));
  if (req.url === '/redirect') { res.writeHead(302, { location: '/target' }).end(); return; }
  if (req.url === '/target') { forwarded++; respond({ data: {} }); return; }
  if (req.url === '/bearer' && req.headers.authorization !== 'Bearer fixture-token') { respond({ errors: [] }, 401); return; }
  if (req.url === '/api-key' && req.headers['x-api-key'] !== 'fixture-key') { respond({ errors: [] }, 403); return; }
  let body = ''; for await (const chunk of req) body += chunk;
  const input = JSON.parse(body);
  if (req.url === '/no-introspection' && input.query.includes('__schema')) { respond({ errors: [{ message: 'Introspection disabled' }] }); return; }
  respond(await graphql({ schema, source: input.query, variableValues: input.variables, operationName: input.operationName, rootValue: { hello: () => 'fixture', echo: ({ message }: { message: string }) => message, increment: () => ++count } }));
});
let endpoint: string;
const send = (path: string, operation: any, headers: Record<string, string> = {}) => httpExecute(endpoint + path, operation, headers, 2000, new AbortController().signal);
beforeAll(async () => { await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); }); endpoint = 'http://127.0.0.1:' + (server.address() as { port: number }).port; });
afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });
describe('deterministic GraphQL HTTP integration', () => {
  it('executes named operations with variables and mutations', async () => {
    const result = await send('/graphql', { query: 'query Echo($message: String!) { echo(message: $message) }', variables: { message: 'DE' }, operationName: 'Echo' });
    expect(result.body).toEqual({ data: { echo: 'DE' } });
    expect((await send('/graphql', { query: 'mutation { increment }' })).body).toEqual({ data: { increment: 1 } });
  });
  it('introspects schemas and preserves disabled introspection separately from reachability', async () => {
    expect((await send('/graphql', { query: getIntrospectionQuery() })).ok).toBe(true);
    expect((await send('/no-introspection', { query: '{ __typename }' })).ok).toBe(true);
    expect((await send('/no-introspection', { query: getIntrospectionQuery() })).body).toHaveProperty('errors');
  });
  it('supports bearer and API-key authentication and refuses unauthorized responses', async () => {
    await expect(send('/bearer', { query: '{ hello }' })).rejects.toMatchObject({ kind: 'authentication' });
    expect((await send('/bearer', { query: '{ hello }' }, { Authorization: 'Bearer fixture-token' })).ok).toBe(true);
    expect((await send('/api-key', { query: '{ hello }' }, { 'X-API-Key': 'fixture-key' })).ok).toBe(true);
  });
  it('never follows a redirect carrying credentials', async () => {
    await expect(send('/redirect', { query: '{ hello }' }, { Authorization: 'Bearer fixture-token' })).rejects.toMatchObject({ kind: 'http' });
    expect(forwarded).toBe(0);
  });
});
