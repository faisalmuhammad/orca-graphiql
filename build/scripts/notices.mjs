import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { BUILD, PLUGIN } from './paths.mjs';
import { readInputs } from './provenance.mjs';

const root = JSON.parse(readFileSync(join(BUILD, 'package.json'), 'utf8'));
const seen = new Set(), entries = [], documents = new Map();
function documentReference(text, owner) {
  let document = documents.get(text);
  if (!document) {
    document = { id: 'NOTICE-' + String(documents.size + 1).padStart(3, '0'), text, owners: new Set() };
    documents.set(text, document);
  }
  document.owners.add(owner);
  return document.id;
}
function record(dir, scope, tool = false) {
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  const key = pkg.name + '@' + pkg.version;
  if (seen.has(key)) return;
  seen.add(key);
  const refs = new Set();
  const files = readdirSync(dir).sort().filter(file => tool
    ? /^(licen[cs]e|copying)([.-]|$)/i.test(file)
    : /^(licen[cs]e|copying|notice)([.-]|$)|third.?party.?notices/i.test(file));
  for (const file of files) {
    try { refs.add(documentReference(readFileSync(join(dir, file), 'utf8'), key)); }
    catch (error) { if (error.code !== 'EISDIR') throw error; }
  }
  if (!refs.size) {
    const fallback = join(BUILD, 'licenses', pkg.name.replaceAll('/', '__') + '.txt');
    if (!existsSync(fallback)) throw new Error('Missing license text for ' + key);
    refs.add(documentReference(readFileSync(fallback, 'utf8'), key));
  }
  entries.push(pkg.name + ' ' + pkg.version + ' — ' + (pkg.license || 'See included license') + ' (' + scope + ') — ' + [...refs].join(', '));
}
// Resolve each emitted module to its owning package, including nested versions.
const packages = new Set();
for (const input of readInputs()) {
  const normalized = resolve(BUILD, input).replaceAll('\\', '/');
  const at = normalized.lastIndexOf('/node_modules/');
  if (at < 0) continue;
  const name = /^(?:@[^/]+\/)?[^/]+/.exec(normalized.slice(at + 14))[0];
  packages.add(normalized.slice(0, at + 14) + name);
}
if (!packages.size) throw new Error('The build recorded no bundled dependency packages.');
for (const dir of [...packages].sort()) record(dir, 'bundled runtime');
const runtimeCount = seen.size;
// Credit direct tools and keep their primary licenses. Their executables and
// dependencies are installed by npm for development and are not redistributed.
for (const name of Object.keys(root.devDependencies).sort()) {
  record(join(BUILD, 'node_modules', name), 'development tool; runtime code not shipped', true);
}
for (const [name, file] of [['Fira Code font', 'LICENSE-FIRA-CODE'], ['Roboto font', 'LICENSE-ROBOTO']]) {
  const ref = documentReference(readFileSync(join(PLUGIN, file), 'utf8'), name);
  entries.push(name + ' — ' + file + ' (original screenshots only) — ' + ref);
}
const notices = [
  'Third-party notices for GraphiQL for Orca',
  'Runtime package inventory comes from emitted editor, worker, and sidebar modules. Complete original runtime license/notice documents, direct development-tool primary licenses, and screenshot font notices follow.',
  'Every included package is credited below. Byte-identical legal documents appear once with references; distinct original copyright and license text is preserved verbatim.',
  '', 'PACKAGE INDEX', ...entries, '', 'ORIGINAL LICENSE DOCUMENTS',
];
for (const document of documents.values()) notices.push('\n' + document.id + ' — ' + [...document.owners].join(', ') + '\n', document.text);
writeFileSync(join(PLUGIN, 'THIRD_PARTY_NOTICES.txt'), notices.join('\n'));
console.log('Recorded ' + runtimeCount + ' bundled packages, ' + (seen.size - runtimeCount) + ' direct tools, and screenshot fonts in ' + documents.size + ' original legal documents');
