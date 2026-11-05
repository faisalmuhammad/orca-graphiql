import { build } from 'esbuild';
import { copyFileSync } from 'node:fs';
// Prefer GraphQL's ESM entry so unused schema utilities can be removed.
await build({ entryPoints: ['src/worker/main.ts'], outfile: 'worker/main.mjs', bundle: true, minify: true, mainFields: ['module', 'main'], platform: 'node', format: 'esm', target: 'node22', external: ['orca', 'orca/*'] });
await build({ entryPoints: ['src/activity/main.ts'], outfile: 'activity/main.js', bundle: true, minify: true, platform: 'browser', format: 'esm', target: 'es2022', external: ['orca', 'orca/*'] });
await build({ entryPoints: ['src/activity/styles.css'], outfile: 'activity/styles.css', minify: true, target: 'es2022' });
copyFileSync('src/activity/index.html', 'activity/index.html');
