import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const vitest = fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url));
const result = spawnSync(process.execPath, [vitest, 'run'], {
  stdio: 'inherit',
  env: { ...process.env, GRAPHIQL_TEST_COMPILED_WORKER: '1' },
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
