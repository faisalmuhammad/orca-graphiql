import sharp from 'sharp';
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// Archive original captures once. Rebuild from them to avoid repeated framing.
const originals = 'assets/captures';
mkdirSync(originals, { recursive: true });
const names = readdirSync('images').filter(name => name.endsWith('.png') && name !== 'icon.png' && !/^cover[0-9]*[.]png$/.test(name));
for (const name of names) {
  const source = join(originals, name);
  if (!existsSync(source)) copyFileSync(join('images', name), source);
  const { width, height } = await sharp(source).metadata();
  const padding = width < 600 ? 48 : 64;
  const radius = width < 600 ? 16 : 20;
  const canvasWidth = width + 2 * padding;
  const canvasHeight = height + 2 * padding;
  const background = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${canvasWidth}" height="${canvasHeight}">
    <defs>
      <linearGradient id="base" x2="1" y2="1"><stop stop-color="#151326"/><stop offset=".35" stop-color="#3d1838"/><stop offset=".67" stop-color="#501743"/><stop offset="1" stop-color="#1b1931"/></linearGradient>
      <radialGradient id="pink"><stop stop-color="#ff4bc1" stop-opacity=".32"/><stop offset=".45" stop-color="#e10098" stop-opacity=".12"/><stop offset="1" stop-color="#e10098" stop-opacity="0"/></radialGradient>
      <radialGradient id="rose"><stop stop-color="#f127ad" stop-opacity=".19"/><stop offset=".5" stop-color="#9a38ad" stop-opacity=".1"/><stop offset="1" stop-color="#9a38ad" stop-opacity="0"/></radialGradient>
      <radialGradient id="edge"><stop offset=".35" stop-color="#090d13" stop-opacity="0"/><stop offset="1" stop-color="#090d13" stop-opacity=".45"/></radialGradient>
      <filter id="shadow" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="14" stdDeviation="18" flood-color="#000" flood-opacity=".45"/></filter>
    </defs>
    <rect width="100%" height="100%" fill="url(#base)"/>
    <ellipse cx="${canvasWidth * .18}" cy="${canvasHeight * .62}" rx="${canvasWidth * .75}" ry="${canvasHeight * .72}" fill="url(#pink)"/>
    <ellipse cx="${canvasWidth * .8}" cy="${canvasHeight * .15}" rx="${canvasWidth * .7}" ry="${canvasHeight * .65}" fill="url(#rose)"/>
    <rect width="100%" height="100%" fill="url(#edge)"/>
    <rect x="${padding - 1}" y="${padding - 1}" width="${width + 2}" height="${height + 2}" rx="${radius + 1}" fill="#151b25" stroke="#a1427d" stroke-opacity=".7" filter="url(#shadow)"/>
  </svg>`);
  const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" rx="${radius}" fill="white"/></svg>`);
  const rounded = await sharp(source).ensureAlpha().composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  await sharp(background).composite([{ input: rounded, left: padding, top: padding }]).png().toFile(join('images', name));
  console.log('Framed ' + name + ' without resizing the capture.');
}
