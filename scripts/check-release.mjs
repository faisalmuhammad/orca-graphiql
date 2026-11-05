import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ignored = new Set(['.git', '.orca', 'node_modules', 'dist']);
const files = new Set();
const issues = [];
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
  const isImage = /[.](png|jpe?g|webp|gif)$/i.test(path);
  if (isImage) {
    const valid = data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      || data.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
      || ['GIF87a', 'GIF89a'].includes(data.subarray(0, 6).toString('ascii'))
      || (data.subarray(0, 4).toString('ascii') === 'RIFF' && data.subarray(8, 12).toString('ascii') === 'WEBP');
    if (!valid) issues.push(path + ': invalid image');
    continue;
  }
  try { decoder.decode(data); if (data.includes(0)) throw new Error('binary'); }
  catch { issues.push(path + ': non-image binary file'); }
}
if (issues.length) {
  console.error('Release file check failed:\n' + [...new Set(issues)].join('\n'));
  process.exitCode = 1;
} else console.log('Release file check passed: ' + files.size + ' text/image files, no non-image binaries or symlinks.');
