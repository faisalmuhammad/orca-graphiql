import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { BUILD } from './paths.mjs';

export const STAGES = ['editor', 'editor-workers', 'worker', 'activity'];
/** Record dependency inputs containing code/styles in an emitted build. */
export function recordInputs(stage, inputs) {
  if (!STAGES.includes(stage)) throw new Error('Unknown build stage: ' + stage);
  const paths = [...new Set(inputs.filter(input => !input.includes('\0')).map(input => input.split('?')[0])
    .filter(input => input.replaceAll('\\', '/').includes('/node_modules/') || input.startsWith('node_modules/'))
    .map(input => relative(BUILD, resolve(BUILD, input)).replaceAll('\\', '/')))].sort();
  if (!paths.length && stage !== 'activity') throw new Error('Missing dependency provenance: ' + stage);
  mkdirSync(join(BUILD, '.cache'), { recursive: true });
  writeFileSync(join(BUILD, '.cache', stage + '.json'), JSON.stringify(paths, null, 2) + '\n');
}
export function emittedInputs(metafile) {
  return [...new Set(Object.values(metafile.outputs).flatMap(output =>
    Object.entries(output.inputs).filter(([, input]) => input.bytesInOutput > 0).map(([path]) => path)))];
}
export function readInputs() {
  return [...new Set(STAGES.flatMap(stage => {
    try { return JSON.parse(readFileSync(join(BUILD, '.cache', stage + '.json'), 'utf8')); }
    catch { throw new Error('Missing build provenance for ' + stage + '; run npm run build before generating notices.'); }
  }))];
}
