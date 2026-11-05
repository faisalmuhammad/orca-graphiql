import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
const root = JSON.parse(readFileSync('package.json', 'utf8'));
const seen = new Set();
const entries = [];
const documents = new Map();
function documentReference(text, owner) {
  let document = documents.get(text);
  if (!document) {
    document = { id: 'NOTICE-' + String(documents.size + 1).padStart(3, '0'), text, owners: new Set() };
    documents.set(text, document);
  }
  document.owners.add(owner);
  return document.id;
}
function packageDirectory(name, from) {
  let base = resolve(from);
  for (;;) {
    const candidate = join(base, 'node_modules', name);
    if (existsSync(join(candidate, 'package.json'))) return candidate;
    const parent = dirname(base); if (parent === base) return null; base = parent;
  }
}
function record(dir, scope) {
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  const key = pkg.name + '@' + pkg.version; if (seen.has(key)) return null; seen.add(key);
  const refs = new Set();
  const files = readdirSync(dir).sort().filter(file => /^(license|copying|notice)([.-]|$)|third.?party.?notices/i.test(file));
  for (const file of files) {
    try { refs.add(documentReference(readFileSync(join(dir, file), 'utf8'), key)); }
    catch (error) { if (error.code !== 'EISDIR') throw error; }
  }
  if (!refs.size) {
    const fallback = join('licenses', pkg.name.replaceAll('/', '__') + '.txt');
    if (!existsSync(fallback)) throw new Error('Missing license text for ' + key);
    refs.add(documentReference(readFileSync(fallback, 'utf8'), key));
  }
  entries.push(`${pkg.name} ${pkg.version} — ${pkg.license || 'See included license'} (${scope}) — ${[...refs].join(', ')}`);
  return pkg;
}
function visit(name, from = '.', scope = 'runtime') {
  const dir = packageDirectory(name, from); if (!dir) return;
  const pkg = record(dir, scope); if (!pkg) return;
  for (const dep of Object.keys({ ...pkg.dependencies, ...pkg.optionalDependencies, ...pkg.peerDependencies })) visit(dep, dir, scope);
}
for (const name of Object.keys(root.dependencies)) visit(name);
for (const name of Object.keys(root.devDependencies)) { const dir = packageDirectory(name, '.'); if (dir) record(dir, 'development tool; not shipped as runtime code'); }
for (const [name, file] of [['Fira Code font', 'LICENSE-FIRA-CODE'], ['Roboto font', 'LICENSE-ROBOTO']]) {
  const ref = documentReference(readFileSync(file, 'utf8'), name);
  entries.push(`${name} — ${file} (original screenshots only) — ${ref}`);
}
const notices = [
  'Third-party notices for GraphiQL for Orca',
  'Runtime dependencies, embedded Codicon font, and development tools. Fira Code and Roboto notices are retained for original screenshots; these text fonts are not bundled in the runtime CSS.',
  'Every package is credited below. Byte-identical license documents appear once with references; distinct original copyright and license text is preserved in full.',
  '', 'PACKAGE INDEX', ...entries, '', 'ORIGINAL LICENSE DOCUMENTS',
];
for (const document of documents.values()) notices.push(
  `\n${document.id} — ${[...document.owners].join(', ')}\n`, document.text,
);
writeFileSync('THIRD_PARTY_NOTICES.txt', notices.join('\n'));
console.log(`Recorded ${seen.size} installed packages and screenshot fonts in ${documents.size} distinct original license documents`);
