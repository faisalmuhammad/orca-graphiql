import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { buildSchema, graphql } from 'graphql';
export function createFixture() {
  const schema = buildSchema('type Query { hello: String!, echo(message: String!): String!, slow(ms: Int!): String!, big(bytes: Int!): String! } type Mutation { increment: Int! }');
  let count = 0;
  let forwarded = 0;
  const server = createServer(async (req, res) => {
    const respond = (body, status = 200) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));
    if (req.url === '/redirect') { res.writeHead(302, { location: '/forwarded' }).end(); return; }
    if (req.url === '/forwarded') { forwarded++; respond({ data: { hello: 'redirect target' } }); return; }
    if (req.url === '/bearer' && req.headers.authorization !== 'Bearer fixture-token') { respond({ errors: [{ message: 'Unauthorized' }] }, 401); return; }
    if (req.url === '/api-key' && req.headers['x-api-key'] !== 'fixture-key') { respond({ errors: [{ message: 'Unauthorized' }] }, 403); return; }
    if (req.url === '/bad-json') { res.writeHead(200, { 'content-type': 'application/json' }).end('{'); return; }
    if (req.url === '/http-error') { respond({ errors: [{ message: 'Fixture unavailable' }] }, 500); return; }
    let body = '';
    for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body) > 262144) { respond({ errors: [{ message: 'Too large' }] }, 413); return; } }
    try {
      const input = JSON.parse(body);
      if (req.url === '/no-introspection' && input.query.includes('__schema')) { respond({ errors: [{ message: 'Schema introspection is disabled' }] }); return; }
      const result = await graphql({ schema, source: input.query, variableValues: input.variables, operationName: input.operationName, rootValue: { hello: () => 'Hello from the Orca fixture', echo: ({ message }) => message, increment: () => ++count, slow: ({ ms }) => new Promise(resolve => setTimeout(() => resolve('done'), Math.min(ms, 1000))), big: ({ bytes }) => 'x'.repeat(Math.min(bytes, 1000000)) } });
      respond(result);
    } catch { respond({ errors: [{ message: 'Invalid fixture request' }] }, 400); }
  });
  return { server, get forwarded() { return forwarded; } };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { server } = createFixture();
  server.listen(4010, '127.0.0.1', () => console.log('GraphQL fixture: http://127.0.0.1:4010/graphql'));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
}
