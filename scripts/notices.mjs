import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
const root = JSON.parse(readFileSync('package.json', 'utf8'));
const seen = new Set();
const notices = ['Third-party notices for GraphiQL for Orca', 'Runtime dependencies, embedded font assets, and development tools. Original notices follow.'];
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
  notices.push(`\n${pkg.name} ${pkg.version} — ${pkg.license || 'See included license'} (${scope})\n`);
  const files = readdirSync(dir).filter(file => /^(license|copying|notice)([.-]|$)|third.?party.?notices/i.test(file));
  if (!files.length) {
    const fallback = join('licenses', pkg.name.replaceAll('/', '__') + '.txt');
    if (!existsSync(fallback)) throw new Error('Missing license text for ' + key);
    notices.push(readFileSync(fallback, 'utf8'));
  }
  for (const file of files) { try { notices.push(readFileSync(join(dir, file), 'utf8')); } catch (error) { if (error.code !== 'EISDIR') throw error; } }
  return pkg;
}
function visit(name, from = '.', scope = 'runtime') {
  const dir = packageDirectory(name, from); if (!dir) return;
  const pkg = record(dir, scope); if (!pkg) return;
  for (const dep of Object.keys({ ...pkg.dependencies, ...pkg.optionalDependencies, ...pkg.peerDependencies })) visit(dep, dir, scope);
}
for (const name of Object.keys(root.dependencies)) visit(name);
for (const name of Object.keys(root.devDependencies)) { const dir = packageDirectory(name, '.'); if (dir) record(dir, 'development tool; not shipped as runtime code'); }
for (const [name, file] of [['Fira Code font', 'LICENSE-FIRA-CODE'], ['Roboto font', 'LICENSE-ROBOTO']]) { notices.push(`\n${name} — ${file}\n`, readFileSync(file, 'utf8')); }
writeFileSync('THIRD_PARTY_NOTICES.txt', notices.join('\n'));
console.log(`Recorded ${seen.size} installed packages plus embedded font notices`);
