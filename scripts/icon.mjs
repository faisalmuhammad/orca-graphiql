import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import GraphQLLogo from '../node_modules/@graphiql/react/dist/icons/graphql-logo.svg_react.js';
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
mkdirSync('images', { recursive: true });
const svg = renderToStaticMarkup(createElement(GraphQLLogo, { width: 256, height: 256 }));
await sharp(Buffer.from(svg)).png().toFile('images/icon.png');
console.log('Rendered official GraphQL logo at 256 × 256');
