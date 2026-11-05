import { PLUGIN } from './paths.mjs';
process.chdir(PLUGIN);
import sharp from 'sharp';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import GraphQLLogo from '../node_modules/@graphiql/react/dist/icons/graphql-logo.svg_react.js';

// Compose the full cover around a large native editor capture and the GraphQL mark.
const width = 1600;
const height = 1000;
const logoSize = 276;
const center = { x: 1400, y: 380 };
const editor = { x: 46, y: 122, width: 1160, height: 755, chrome: 30 };
const output = 'images/cover.png';
const baseStops = '<stop stop-color="#18122d"/><stop offset=".35" stop-color="#442044"/><stop offset=".67" stop-color="#6e1b55"/><stop offset="1" stop-color="#251730"/>';
let seed = 731;
const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const stars = Array.from({ length: 135 }, () => {
  const x = Math.round(random() * width);
  const y = Math.round(random() * height);
  const radius = (0.4 + random() * 0.8).toFixed(2);
  const opacity = (0.08 + random() * 0.25).toFixed(2);
  return `<circle cx="${x}" cy="${y}" r="${radius}" fill="#efccdf" opacity="${opacity}"/>`;
}).join('');
const nodes = [
  [120, 525], [280, 410], [310, 610], [480, 480], [530, 335],
  [1090, 660], [1140, 445], [1310, 360], [1350, 560], [1490, 460],
];
const edges = [[0, 1], [0, 2], [1, 2], [1, 3], [2, 3], [3, 4], [1, 4], [5, 6], [5, 8], [6, 7], [6, 8], [7, 8], [7, 9], [8, 9]];
const graph = edges.map(([a, b]) => `<path d="M${nodes[a].join(' ')} L${nodes[b].join(' ')}" stroke="#e10098" stroke-opacity=".14" stroke-width="1"/>`).join('')
  + nodes.map(([x, y], index) => `<circle cx="${x}" cy="${y}" r="${index % 3 === 0 ? 4 : 2.5}" fill="#f257bc" opacity=".4"/><circle cx="${x}" cy="${y}" r="10" fill="#e10098" opacity=".035"/>`).join('');
const artwork = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs>
    <linearGradient id="base" x2="1" y2="1">${baseStops}</linearGradient>
    <radialGradient id="bloom"><stop stop-color="#ff4bc1" stop-opacity=".34"/><stop offset=".4" stop-color="#cc168c" stop-opacity=".18"/><stop offset="1" stop-color="#e10098" stop-opacity="0"/></radialGradient>
    <radialGradient id="rose"><stop stop-color="#f127ad" stop-opacity=".19"/><stop offset=".5" stop-color="#9a38ad" stop-opacity=".1"/><stop offset="1" stop-color="#9a38ad" stop-opacity="0"/></radialGradient>
    <radialGradient id="vignette"><stop offset=".35" stop-color="#090d13" stop-opacity="0"/><stop offset="1" stop-color="#090d13" stop-opacity=".45"/></radialGradient>
    <filter id="shadow" x="-20%" y="-30%" width="140%" height="180%"><feDropShadow dx="0" dy="18" stdDeviation="25" flood-color="#000" flood-opacity=".55"/></filter>
  </defs>
  <rect width="100%" height="100%" fill="url(#base)"/>
  <ellipse cx="${center.x}" cy="${center.y}" rx="640" ry="420" fill="url(#bloom)"/>
  <ellipse cx="1200" cy="470" rx="560" ry="420" fill="url(#bloom)" opacity=".4"/>
  <ellipse cx="1100" cy="210" rx="900" ry="600" fill="url(#rose)"/>
  ${stars}
  <g fill="none">${graph}</g>
  <g fill="none" stroke="#e10098">
    <circle cx="${center.x}" cy="${center.y}" r="205" stroke-opacity=".045"/>
    <circle cx="${center.x}" cy="${center.y}" r="310" stroke-opacity=".025"/>
    <ellipse cx="${center.x}" cy="${center.y}" rx="430" ry="145" stroke-opacity=".04" transform="rotate(-16 ${center.x} ${center.y})"/>
  </g>
  <rect width="100%" height="100%" fill="url(#vignette)"/>
  <rect x="${editor.x - 1}" y="${editor.y - 1}" width="${editor.width + 2}" height="${editor.height + 2}" rx="14" fill="#26202e" stroke="#a1427d" stroke-opacity=".7" filter="url(#shadow)"/>
</svg>`);
// Preserve the complete real editor, including its connection bar and native tabs.
const capture = await sharp('build/assets/captures/cover-editor.png')
  .resize(editor.width, editor.height - editor.chrome).png().toBuffer();
const chrome = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${editor.width}" height="${editor.height}"><rect width="100%" height="100%" fill="#151b25"/><path d="M0 29.5H${editor.width}" stroke="#303442"/><circle cx="20" cy="15" r="4.5" fill="#ff5f57"/><circle cx="36" cy="15" r="4.5" fill="#febc2e"/><circle cx="52" cy="15" r="4.5" fill="#28c840"/><text x="78" y="19" fill="#91a0b2" font-family="Arial, sans-serif" font-size="12">countries.graphiql</text></svg>`);
const framed = await sharp(chrome).composite([{ input: capture, left: 0, top: editor.chrome }]).png().toBuffer();
const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${editor.width}" height="${editor.height}"><rect width="100%" height="100%" rx="13" fill="white"/></svg>`);
const window = await sharp(framed).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
const svg = renderToStaticMarkup(createElement(GraphQLLogo, { width: logoSize, height: logoSize }));
const logo = await sharp(Buffer.from(svg)).png().toBuffer();
const glow = await sharp({ create: { width: logoSize + 120, height: logoSize + 120, channels: 4, background: '#0000' } })
  .composite([{ input: logo, left: 60, top: 60 }]).png().toBuffer();
const blurredGlow = await sharp(glow).blur(22).linear(0.85, 0).png().toBuffer();
const title = Buffer.from(`<svg xmlns='http://www.w3.org/2000/svg' width='400' height='210'>
  <defs><filter id='textGlow' x='-40%' y='-60%' width='180%' height='220%'><feDropShadow dx='0' dy='0' stdDeviation='12' flood-color='#ff2fbc' flood-opacity='.6'/><feDropShadow dx='0' dy='0' stdDeviation='3' flood-color='#ff79d8' flood-opacity='.5'/></filter></defs>
  <g font-family='Arial, sans-serif' text-anchor='middle' filter='url(#textGlow)'>
    <text x='200' y='78' fill='#fff2fc' font-size='58' font-weight='700' letter-spacing='-1.5'>GraphiQL</text>
    <text x='200' y='140' fill='#ffd0ee' font-size='40' font-weight='600' letter-spacing='-.5'>for Orca</text>
  </g>
</svg>`);
await sharp(artwork).composite([
  { input: blurredGlow, left: center.x - logoSize / 2 - 60, top: center.y - logoSize / 2 - 60 },
  { input: logo, left: center.x - logoSize / 2, top: center.y - logoSize / 2 },
  { input: window, left: editor.x, top: editor.y },
  { input: title, left: center.x - 200, top: 544 },
]).png().toFile(output);
console.log('Created ' + output + ' with a large Countries editor on the left, GraphQL logo on the right, and glowing title.');
