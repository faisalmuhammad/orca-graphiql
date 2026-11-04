import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { getIntrospectionQuery } from 'graphql';
const cli = process.env.ORCA_CLI_COMMAND || (process.platform === 'linux' ? 'orca-ide' : 'orca');
const endpoint = process.argv[2] || 'https://countries.trevorblades.com/';
const sessionId = randomUUID();
function request(name, input) {
  const result = JSON.parse(execFileSync(cli, ['plugin', 'dev', 'request', '.', name, ...(input ? ['--data', JSON.stringify(input)] : []), '--json'], { encoding: 'utf8' }));
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  const output = result.result.result;
  if (output.ok === false) throw new Error(output.error.message);
  return output.value ?? output;
}
const connection = request('connection.approve', { sessionId, environment: { id: 'runtime-test', name: 'Runtime test', endpoint }, allowInsecure: false });
function execute(operation) { return request('graphql.execute', { approvalId: connection.approvalId, requestId: randomUUID(), operation, confirmedMutation: false }); }
try {
  const schema = execute({ query: getIntrospectionQuery() }).body;
  if (!schema.data?.__schema?.types?.length) throw new Error('Introspection did not return a schema');
  console.log('Introspection succeeded: ' + schema.data.__schema.types.length + ' types');
  const query = endpoint.includes('countries.trevorblades.com') ? 'query GetCountry { country(code: "DE") { name capital currency emoji languages { name } } }' : 'query { hello }';
  const result = execute({ query }).body;
  if (result.errors) throw new Error('GraphQL operation failed');
  console.log(JSON.stringify(result, null, 2));
} finally { request('connection.disconnect', { approvalId: connection.approvalId }); }
