import { PLUGIN } from './paths.mjs';
process.chdir(PLUGIN);
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ignored = new Set(['.git', '.orca', 'node_modules', 'dist', '.cache', '.DS_Store', 'Thumbs.db']);
const files = new Set();
const issues = [];
const manifest = JSON.parse(readFileSync('orca-plugin.json', 'utf8'));
const entries = new Set([...(manifest.contributes?.panels || []), ...(manifest.contributes?.customEditors || [])].map(item => item.entry));
let totalBytes = 0;
function collect(folder = '.') {
  for (const name of readdirSync(folder)) {
    if (ignored.has(name)) continue;
    const path = join(folder, name);
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) issues.push(path + ': symlink');
    else if (stat.isDirectory()) collect(path);
    else files.add(path);
  }
}
collect();
// Also catch files accidentally committed inside normally ignored directories.
try {
  for (const path of execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\0').filter(Boolean)) files.add(path);
} catch { /* Manual source uploads may not have local Git metadata. */ }
const decoder = new TextDecoder('utf-8', { fatal: true });
for (const path of files) {
  let data;
  try {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) { issues.push(path + ': symlink'); continue; }
    data = readFileSync(path);
  } catch { issues.push(path + ': missing or unreadable tracked file'); continue; }
  totalBytes += data.length;
  if (entries.has(path.replaceAll('\\', '/')) && data.length > 10 * 1024 * 1024) issues.push(path + ': exceeds the Orca 10 MiB entry limit');
  if (/[.](ts|tsx|mts|jsx)$/i.test(path) && data.length > 1024 * 1024) issues.push(path + ': exceeds the Orca 1 MiB transpilation limit');
  // A stricter project budget for editor scripts; this is not an Orca limit.
  if (/^editor[\\/]assets[\\/].*[.]js$/.test(path) && data.length > 1024 * 1024) issues.push(path + ': exceeds the 1 MiB editor-chunk budget');
  const isImage = /[.](png|jpe?g|webp|gif)$/i.test(path);
  if (isImage) {
    const valid = data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      || data.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
      || ['GIF87a', 'GIF89a'].includes(data.subarray(0, 6).toString('ascii'))
      || (data.subarray(0, 4).toString('ascii') === 'RIFF' && data.subarray(8, 12).toString('ascii') === 'WEBP');
    if (!valid) issues.push(path + ': invalid image');
    continue;
  }
  try {
    const source = decoder.decode(data);
    if (data.includes(0)) throw new Error('binary');
    // Reject the known stale tab adapter even when old assets are left unused.
    // Its classic JSX output calls React without an imported binding.
    if (/^editor[\\/]assets[\\/].*[.]js$/.test(path)
      && source.includes('Reorder.Item') && source.includes('Reorder.Group')
      && /return\s+React[.]createElement\(["'](?:li|ul)["']/.test(source)) {
      issues.push(path + ': contains the broken tab adapter (React is not defined); rebuild and replace editor/, removing obsolete assets');
    }
  }
  catch { issues.push(path + ': non-image binary file'); }
}
if (files.size > 2000) issues.push('Plugin source folder exceeds the Orca 2,000-file limit');
if (totalBytes > 50 * 1024 * 1024) issues.push('Plugin source folder exceeds the Orca 50 MiB total-size limit');
if (issues.length) {
  console.error('Release file check failed:\n' + [...new Set(issues)].join('\n'));
  process.exitCode = 1;
} else console.log('Release file check passed: ' + files.size + ' text/image files, ' + totalBytes + ' bytes, no non-image binaries or symlinks; Orca limits and the editor-chunk budget passed.');
