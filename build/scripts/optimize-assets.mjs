import { PLUGIN } from './paths.mjs';
process.chdir(PLUGIN);
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import postcss from 'postcss';
import sharp from 'sharp';
import wawoff2 from 'wawoff2';

let fontRulesRemoved = 0;
let textFontRulesRemoved = 0;
let duplicateStyleRulesRemoved = 0;
let iconFontsCompressed = 0;
let cssBytesSaved = 0;
let imageBytesSaved = 0;
function files(folder) {
  return readdirSync(folder, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? files(join(folder, entry.name)) : [join(folder, entry.name)]);
}
function fontTables(buffer) {
  const tables = new Map();
  for (let i = 0; i < buffer.readUInt16BE(4); i++) {
    const entry = 12 + i * 16;
    const tag = buffer.toString('ascii', entry, entry + 4);
    const offset = buffer.readUInt32BE(entry + 8);
    const table = Buffer.from(buffer.subarray(offset, offset + buffer.readUInt32BE(entry + 12)));
    if (tag === 'head') {
      // WOFF2 updates the checksum and marks lossless font transformation.
      table.fill(0, 8, 12);
      table.writeUInt16BE(table.readUInt16BE(16) & ~0x0800, 16);
    }
    tables.set(tag, table);
  }
  return tables;
}
async function compressIconFont(source) {
  const original = Buffer.from(source, 'base64');
  const compressed = Buffer.from(await wawoff2.compress(original));
  const restored = fontTables(Buffer.from(await wawoff2.decompress(compressed)));
  const tables = fontTables(original);
  if (tables.size !== restored.size || [...tables].some(([tag, table]) => !restored.get(tag)?.equals(table))) {
    throw new Error('Icon font round-trip changed glyphs or font metrics');
  }
  return compressed.toString('base64');
}
for (const path of files('editor').filter(path => path.endsWith('.css'))) {
  const before = readFileSync(path, 'utf8');
  const tree = postcss.parse(before);
  // The host uses system text fonts. Codicon is an icon font and must remain.
  tree.walkAtRules('font-face', rule => {
    const family = rule.nodes.find(node => node.type === 'decl' && node.prop === 'font-family')?.value;
    if (family && ['Roboto', 'Fira Code'].includes(family.replaceAll('"', '').replaceAll("'", '').trim())) {
      rule.remove();
      textFontRulesRemoved++;
    }
  });
  const fonts = [];
  tree.walkAtRules('font-face', rule => fonts.push(rule));
  const seen = new WeakMap();
  // Retain the last identical declaration in the same CSS scope.
  for (const rule of fonts.reverse()) {
    let declarations = seen.get(rule.parent);
    if (!declarations) seen.set(rule.parent, declarations = new Set());
    const key = rule.toString();
    if (declarations.has(key)) { rule.remove(); fontRulesRemoved++; }
    else declarations.add(key);
  }
  for (const rule of fonts) {
    if (!rule.parent) continue;
    const family = rule.nodes.find(node => node.type === 'decl' && node.prop === 'font-family')?.value;
    if (family !== 'codicon') continue;
    const src = rule.nodes.find(node => node.type === 'decl' && node.prop === 'src');
    const match = src?.value.match(/^url\(data:font\/ttf;base64,([A-Za-z0-9+/=]+)\) format\("truetype"\)$/);
    if (!match) continue;
    const compressed = await compressIconFont(match[1]);
    if (compressed.length >= match[1].length) continue;
    src.value = 'url(data:font/woff2;base64,' + compressed + ') format("woff2")';
    iconFontsCompressed++;
  }
  const styles = [];
  tree.walkRules(rule => styles.push(rule));
  const seenStyles = new WeakMap();
  for (const rule of styles.reverse()) {
    let declarations = seenStyles.get(rule.parent);
    if (!declarations) seenStyles.set(rule.parent, declarations = new Set());
    const key = rule.toString();
    if (declarations.has(key)) { rule.remove(); duplicateStyleRulesRemoved++; }
    else declarations.add(key);
  }
  const after = tree.toString();
  if (after === before) continue;
  cssBytesSaved += Buffer.byteLength(before) - Buffer.byteLength(after);
  const oldName = basename(path);
  const newName = 'style-' + createHash('sha256').update(after).digest('base64url').slice(0, 8) + '.css';
  writeFileSync(path, after);
  renameSync(path, join(dirname(path), newName));
  for (const reference of files('editor').filter(path => /[.](html|js)$/.test(path))) {
    const text = readFileSync(reference, 'utf8');
    if (text.includes(oldName)) writeFileSync(reference, text.replaceAll(oldName, newName));
  }
}
for (const folder of ['images', 'build/assets/captures']) {
  for (const path of files(folder).filter(path => path.endsWith('.png'))) {
    const before = readFileSync(path);
    const after = await sharp(before).png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
    if (after.length >= before.length) continue;
    const originalPixels = await sharp(before).ensureAlpha().raw().toBuffer();
    const optimizedPixels = await sharp(after).ensureAlpha().raw().toBuffer();
    if (!originalPixels.equals(optimizedPixels)) throw new Error('Lossless image check failed: ' + path);
    writeFileSync(path, after);
    imageBytesSaved += before.length - after.length;
  }
}
console.log(JSON.stringify({ textFontRulesRemoved, fontRulesRemoved, duplicateStyleRulesRemoved, iconFontsCompressed, cssBytesSaved, imageBytesSaved }));
