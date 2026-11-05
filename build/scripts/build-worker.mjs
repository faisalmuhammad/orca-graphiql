import { build } from 'esbuild';
import { copyFileSync } from 'node:fs';
import { emittedInputs, recordInputs } from './provenance.mjs';
// Prefer GraphQL's ESM entry so unused schema utilities can be removed.
const worker = await build({ entryPoints: ['src/worker/main.ts'], outfile: '../worker/main.mjs', bundle: true, minify: true, mainFields: ['module', 'main'], platform: 'node', format: 'esm', target: 'node22', external: ['orca', 'orca/*'], metafile: true, legalComments: 'none' });
recordInputs('worker', emittedInputs(worker.metafile));
const activity = await build({ entryPoints: ['src/activity/main.ts'], outfile: '../activity/main.js', bundle: true, minify: true, platform: 'browser', format: 'esm', target: 'es2022', external: ['orca', 'orca/*'], metafile: true, legalComments: 'none' });
recordInputs('activity', emittedInputs(activity.metafile));
await build({ entryPoints: ['src/activity/styles.css'], outfile: '../activity/styles.css', minify: true, target: 'es2022' });
copyFileSync('src/activity/index.html', '../activity/index.html');
