/**
 * Pure window stack model (retro-shell design, "src/desktop/windowStack.ts").
 *
 * The window manager routes every z-order, focus and minimize change through `applyStackOp`, so
 * the rules live here where they can be property-tested without a DOM. Every stack this module
 * returns is frozen; an op that changes nothing returns the input stack itself.
 *
 * Invariants after every op: `order` has no duplicates, `opened` holds the same ids as `order`
 * in first-open order (Req 7.1), `minimized` is sorted, unique and a subset of `order`, and
 * `focused === topVisible(order, minimized)` (Req 6.3).
 */

export interface WindowStack {
  /** Open order, for Taskbar buttons (Req 7.1). */
  readonly opened: readonly string[];
  /** Z-order, bottom → top. */
  readonly order: readonly string[];
  /** Sorted, unique, subset of `order`. */
  readonly minimized: readonly string[];
  /** Topmost non-minimized id, or null. */
  readonly focused: string | null;
}

export type StackOp =
  | { readonly type: 'open'; readonly id: string }
  | { readonly type: 'close'; readonly id: string }
  | { readonly type: 'focus'; readonly id: string }
  | { readonly type: 'minimize'; readonly id: string }
  | { readonly type: 'taskbar'; readonly id: string };

const EMPTY_LIST: readonly string[] = Object.freeze([]);

export const EMPTY_STACK: WindowStack = Object.freeze({
  opened: EMPTY_LIST,
  order: EMPTY_LIST,
  minimized: EMPTY_LIST,
  focused: null,
});

/** The topmost id of `order` that is not in `minimized`, or null if there is none (Req 6.3). */
export function topVisible(order: readonly string[], minimized: readonly string[]): string | null {
  for (let i = order.length - 1; i >= 0; i--) {
    const id = order[i] as string;
    if (!minimized.includes(id)) return id;
  }
  return null;
}

/** Builds a frozen stack and derives `focused` from the other lists. */
function makeStack(
  opened: readonly string[],
  order: readonly string[],
  minimized: readonly string[],
): WindowStack {
  return Object.freeze({
    opened: Object.freeze(opened),
    order: Object.freeze(order),
    minimized: Object.freeze(minimized),
    focused: topVisible(order, minimized),
  });
}

/** Restore if minimized, move to the top of `order` and focus (Req 6.2, 7.3). */
function focusOp(stack: WindowStack, id: string): WindowStack {
  if (!stack.order.includes(id)) return stack;
  const isTop = stack.order[stack.order.length - 1] === id;
  const isMinimized = stack.minimized.includes(id);
  if (isTop && !isMinimized) return stack;
  const order = isTop ? stack.order : [...stack.order.filter((w) => w !== id), id];
  const minimized = isMinimized ? stack.minimized.filter((w) => w !== id) : stack.minimized;
  return makeStack(stack.opened, order, minimized);
}

/** Open on top and focus (Req 6.1); an already open id is focused instead. */
function openOp(stack: WindowStack, id: string): WindowStack {
  if (stack.order.includes(id)) return focusOp(stack, id);
  return makeStack([...stack.opened, id], [...stack.order, id], stack.minimized);
}

/** Remove from every list; the others keep their order (Req 6.4). */
function closeOp(stack: WindowStack, id: string): WindowStack {
  if (!stack.order.includes(id)) return stack;
  const without = (list: readonly string[]) => list.filter((w) => w !== id);
  return makeStack(without(stack.opened), without(stack.order), without(stack.minimized));
}

/** Hide but keep in `opened` and `order` (Req 6.5). */
function minimizeOp(stack: WindowStack, id: string): WindowStack {
  if (!stack.order.includes(id) || stack.minimized.includes(id)) return stack;
  return makeStack(stack.opened, stack.order, [...stack.minimized, id].sort());
}

/** Applies one op and returns the next stack. Never mutates `stack`. */
export function applyStackOp(stack: WindowStack, op: StackOp): WindowStack {
  switch (op.type) {
    case 'open':
      return openOp(stack, op.id);
    case 'focus':
      return focusOp(stack, op.id);
    case 'close':
      return closeOp(stack, op.id);
    case 'minimize':
      return minimizeOp(stack, op.id);
    case 'taskbar':
      // Focused window's button minimizes it (Req 7.2); any other restores and focuses (Req 7.3).
      return op.id === stack.focused ? minimizeOp(stack, op.id) : focusOp(stack, op.id);
  }
}
