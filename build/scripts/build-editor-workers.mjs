import { build } from 'esbuild';
import { readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { emittedInputs, recordInputs } from './provenance.mjs';

// Build all three module workers together so their common Monaco/GraphQL
// infrastructure is emitted once. The official GraphiQL worker constructors
// still load local module URLs and retain their original labels and lifecycle.
const folder = '../editor/assets';
const entries = {
  'editor.worker': 'node_modules/monaco-editor/esm/vs/editor/editor.worker.js',
  'json.worker': 'node_modules/monaco-editor/esm/vs/languages/features/json/json.worker.js',
  'graphql.worker': 'node_modules/monaco-graphql/esm/graphql.worker.js',
};
const oldNames = new Map(Object.keys(entries).map(name => {
  const matches = readdirSync(folder).filter(file => file.startsWith(name + '-') && file.endsWith('.js'));
  if (matches.length !== 1) throw new Error('Expected one Vite worker entry for ' + name);
  return [name, matches[0]];
}));
const result = await build({
  entryPoints: entries, outdir: folder, bundle: true, minify: true,
  splitting: true, format: 'esm', platform: 'browser', target: 'es2022',
  mainFields: ['browser', 'module', 'main'],
  entryNames: '[name]-[hash]', chunkNames: 'worker-shared-[hash]',
  metafile: true, write: false,
  legalComments: 'none',
});
recordInputs('editor-workers', emittedInputs(result.metafile));
const replacements = new Map();
for (const [name, entry] of Object.entries(entries)) {
  const output = Object.entries(result.metafile.outputs).find(([, metadata]) => metadata.entryPoint === entry);
  if (!output) throw new Error('Shared worker build omitted ' + entry);
  replacements.set(oldNames.get(name), basename(output[0]));
}
for (const file of result.outputFiles) writeFileSync(file.path, file.contents);
const references = new Map([...replacements.keys()].map(name => [name, 0]));
const files = ['../editor/index.html', ...readdirSync(folder).filter(file => file.endsWith('.js')).map(file => join(folder, file))];
for (const path of files) {
  const before = readFileSync(path, 'utf8');
  let after = before;
  for (const [oldName, newName] of replacements) {
    if (after.includes(oldName)) { references.set(oldName, references.get(oldName) + 1); after = after.replaceAll(oldName, newName); }
  }
  if (after !== before) writeFileSync(path, after);
}
for (const oldName of replacements.keys()) {
  if (!references.get(oldName)) throw new Error('No official worker constructor referenced ' + oldName);
  unlinkSync(join(folder, oldName));
}
console.log('Shared editor workers: ' + result.outputFiles.length + ' local scripts, ' + result.outputFiles.reduce((bytes, file) => bytes + file.contents.length, 0) + ' bytes.');
