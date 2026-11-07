// Stub: framer-motion is used only for tab drag-reorder in @graphiql/react.
// This renders tabs as static list elements without animation or drag.
import { createElement, forwardRef } from 'react';

const Item = forwardRef(function ReorderItem(
  { value, dragElastic, onDrag, onDragEnd, onDragStart, layout, layoutId, ...props },
  ref,
) {
  return createElement('li', { ref, ...props });
});
Item.displayName = 'Reorder.Item';

const Group = forwardRef(function ReorderGroup(
  { values, onReorder, axis, ...props },
  ref,
) {
  return createElement('ul', { ref, ...props });
});
Group.displayName = 'Reorder.Group';

export const Reorder = { Item, Group };
