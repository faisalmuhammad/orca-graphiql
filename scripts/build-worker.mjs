import { build } from 'esbuild';
await build({ entryPoints: ['src/worker/main.ts'], outfile: 'worker/main.mjs', bundle: true, platform: 'node', format: 'esm', target: 'node22', external: ['orca', 'orca/*'] });
await build({ entryPoints: ['src/activity/main.ts'], outfile: 'activity/main.js', bundle: true, platform: 'browser', format: 'esm', target: 'es2022', external: ['orca', 'orca/*'] });
