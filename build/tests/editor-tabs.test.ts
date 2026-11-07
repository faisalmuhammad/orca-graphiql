import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Reorder } from '../src/editor/stubs/framer-motion.js';

describe('GraphiQL tab adapter', () => {
  it('renders tabs without requiring a global React binding', () => {
    expect('React' in globalThis).toBe(false);
    const itemProps = {
      ref: null,
      value: 'query-tab', className: 'query-tab', layout: true,
      layoutId: 'query-tab', dragElastic: 0, onDrag: () => {},
      onDragEnd: () => {}, onDragStart: () => {},
      children: createElement('button', { type: 'button' }, 'GetCountry'),
    };
    const item = createElement(Reorder.Item, itemProps);
    const groupProps = {
      ref: null,
      values: ['query-tab'], onReorder: () => {}, axis: 'x',
      className: 'query-tabs', children: item,
    };
    const group = createElement(Reorder.Group, groupProps);
    expect(renderToStaticMarkup(group)).toBe(
      '<ul class="query-tabs"><li class="query-tab"><button type="button">GetCountry</button></li></ul>',
    );
  });
});
