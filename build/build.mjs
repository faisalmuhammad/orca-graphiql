import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { BUILD } from './scripts/paths.mjs';

// One reproducible recipe, preserving GraphiQL's supported Vite worker setup.
for (const script of ['node_modules/vite/bin/vite.js', 'scripts/build-editor-workers.mjs',
  'scripts/build-worker.mjs', 'scripts/optimize-assets.mjs', 'scripts/notices.mjs']) {
  const result = spawnSync(process.execPath, [join(BUILD, script), ...(script.includes('/vite/') ? ['build'] : [])],
    { cwd: BUILD, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
