import { PLUGIN } from './paths.mjs';
process.chdir(PLUGIN);
import { randomUUID } from 'node:crypto';
import { getIntrospectionQuery } from 'graphql';
import { createFixture } from '../tests/fixture.mjs';
const cli = process.env.ORCA_CLI_COMMAND || (process.platform === 'linux' ? 'orca-ide' : 'orca');
const fixture = createFixture();
await new Promise((resolve, reject) => { fixture.server.once('error', reject); fixture.server.listen(0, '127.0.0.1', resolve); });
const endpoint = 'http://127.0.0.1:' + fixture.server.address().port;
function call(name, input) {
  // Async fixture I/O must remain on this event loop while the CLI waits.
  return new Promise(async (resolve, reject) => {
    const { execFile } = await import('node:child_process');
    execFile(cli, ['plugin', 'dev', 'request', '.', name, ...(input ? ['--data', JSON.stringify(input)] : []), '--json'], { encoding: 'utf8' }, (error, stdout) => { if (error) { reject(error); return; } try { const result = JSON.parse(stdout); if (!result.ok) throw new Error('Orca request failed'); resolve(result.result.result); } catch (failure) { reject(failure); } });
  });
}
const protection = await call('connection.protection');
console.log('Orca secure storage available: ' + !!(protection.ok && protection.value.secure));
try {
  for (const [path, type, value, header] of [['/bearer', 'bearer', 'fixture-token'], ['/api-key', 'api-key', 'fixture-key', 'X-API-Key']]) {
    const connection = await call('connection.approve', { sessionId: randomUUID(), environment: { id: 'fixture', name: 'Fixture', endpoint: endpoint + path }, allowInsecure: false, credential: { type, value, header, persist: protection.ok && protection.value.secure } });
    if (!connection.ok) throw new Error(connection.error.message);
    const result = await call('graphql.execute', { approvalId: connection.value.approvalId, requestId: randomUUID(), operation: { query: 'query Echo($message: String!) { echo(message: $message) }', variables: { message: 'DE' }, operationName: 'Echo' }, confirmedMutation: false });
    if (!result.ok || result.value.body.data.echo !== 'DE') throw new Error('Authenticated worker fixture failed');
    console.log(type + ' authentication succeeded through the actual Orca worker');
    if (connection.value.auth.type !== 'none') { const deleted = await call('credentials.delete', { approvalId: connection.value.approvalId, secretId: connection.value.auth.secretId }); if (!deleted.ok) throw new Error('Fixture secret cleanup failed'); }
    else await call('connection.disconnect', { approvalId: connection.value.approvalId });
  }
  for (const path of ['/no-introspection', '/redirect']) {
    const connection = await call('connection.approve', { sessionId: randomUUID(), environment: { id: 'fixture', name: 'Fixture', endpoint: endpoint + path }, allowInsecure: false });
    if (path === '/redirect') { if (connection.ok || connection.error.kind !== 'http') throw new Error('Redirect protection failed'); console.log('Redirect refused; no forwarding occurred'); }
    else { if (!connection.ok) throw new Error('Disabled introspection must not prevent connection'); const schema = await call('graphql.execute', { approvalId: connection.value.approvalId, requestId: randomUUID(), operation: { query: getIntrospectionQuery() }, confirmedMutation: false }); if (!schema.ok || !schema.value.body.errors || schema.value.ok) throw new Error('Introspection error was not preserved'); await call('connection.disconnect', { approvalId: connection.value.approvalId }); console.log('Introspection-disabled endpoint remains reachable; GraphQL error preserved'); }
  }
  const production = await call('connection.approve', { sessionId: randomUUID(), environment: { id: 'fixture', name: 'Production fixture', endpoint, production: true }, allowInsecure: false });
  if (!production.ok) throw new Error('Production fixture connection failed');
  const mutation = { approvalId: production.value.approvalId, requestId: randomUUID(), operation: { query: 'mutation Increment { increment }', operationName: 'Increment' }, confirmedMutation: false };
  const blocked = await call('graphql.execute', mutation); if (blocked.ok || blocked.error.kind !== 'production') throw new Error('Unconfirmed production mutation was sent');
  const executed = await call('graphql.execute', { ...mutation, requestId: randomUUID(), confirmedMutation: true });
  if (!executed.ok || executed.value.body.data.increment !== 1) throw new Error('Confirmed mutation failed');
  await call('connection.disconnect', { approvalId: production.value.approvalId }); console.log('Production mutation refused before confirmation and executed once after confirmation');
  if (fixture.forwarded) throw new Error('A redirect was followed');
} finally { await new Promise(resolve => fixture.server.close(resolve)); }
