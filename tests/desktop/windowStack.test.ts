import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  EMPTY_STACK,
  applyStackOp,
  topVisible,
  type StackOp,
  type WindowStack,
} from '../../src/desktop/windowStack';

const run = (ops: readonly StackOp[], start: WindowStack = EMPTY_STACK): WindowStack =>
  ops.reduce(applyStackOp, start);

describe('windowStack examples', () => {
  it('open puts the window on top and focuses it; re-open focuses', () => {
    const s = run([
      { type: 'open', id: 'a' },
      { type: 'open', id: 'b' },
      { type: 'open', id: 'a' },
    ]);
    expect(s.opened).toEqual(['a', 'b']);
    expect(s.order).toEqual(['b', 'a']);
    expect(s.focused).toBe('a');
  });

  it('minimize hides, focus falls to the next visible window, taskbar restores', () => {
    const opened = run([
      { type: 'open', id: 'a' },
      { type: 'open', id: 'b' },
    ]);
    const min = applyStackOp(opened, { type: 'taskbar', id: 'b' });
    expect(min.minimized).toEqual(['b']);
    expect(min.opened).toEqual(['a', 'b']);
    expect(min.focused).toBe('a');
    const restored = applyStackOp(min, { type: 'taskbar', id: 'b' });
    expect(restored.minimized).toEqual([]);
    expect(restored.order).toEqual(['a', 'b']);
    expect(restored.focused).toBe('b');
  });

  it('close keeps the order of the rest; all minimized means no focus', () => {
    const s = run([
      { type: 'open', id: 'a' },
      { type: 'open', id: 'b' },
      { type: 'open', id: 'c' },
      { type: 'close', id: 'b' },
      { type: 'minimize', id: 'a' },
      { type: 'minimize', id: 'c' },
    ]);
    expect(s.order).toEqual(['a', 'c']);
    expect(s.opened).toEqual(['a', 'c']);
    expect(s.minimized).toEqual(['a', 'c']);
    expect(s.focused).toBeNull();
    expect(topVisible(s.order, s.minimized)).toBeNull();
  });

  it('unknown ids and no-op focus return the same frozen stack', () => {
    const s = run([{ type: 'open', id: 'a' }]);
    for (const type of ['close', 'focus', 'minimize', 'taskbar'] as const) {
      expect(applyStackOp(s, { type, id: 'zzz' })).toBe(s);
    }
    expect(applyStackOp(s, { type: 'focus', id: 'a' })).toBe(s);
    expect(Object.isFrozen(s)).toBe(true);
    expect(Object.isFrozen(s.order)).toBe(true);
    expect(EMPTY_STACK.order).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// Property tests
// ---------------------------------------------------------------------------------------------

const POOL = ['a', 'b', 'c', 'd'] as const;
const OP_TYPES = ['open', 'close', 'focus', 'minimize', 'taskbar'] as const;

const opArb: fc.Arbitrary<StackOp> = fc
  .record({ type: fc.constantFrom(...OP_TYPES), id: fc.constantFrom(...POOL) })
  .map((op): StackOp => op);
const opsArb = fc.array(opArb, { minLength: 0, maxLength: 40 });

const without = (list: readonly string[], id: string): string[] => list.filter((w) => w !== id);
const sorted = (list: readonly string[]): string[] => [...list].sort();
const isSortedUnique = (list: readonly string[]): boolean =>
  list.every((id, i) => i === 0 || (list[i - 1] as string) < id);

/** Plain deep copy, used to check that an op never changes its input stack. */
const snapshot = (s: WindowStack): WindowStack => ({
  opened: [...s.opened],
  order: [...s.order],
  minimized: [...s.minimized],
  focused: s.focused,
});

function expectInvariants(s: WindowStack, expectedOpened: readonly string[]): void {
  // Property: Req 6.3 / 7.1 order is unique and opened is the same id set in first-open order
  expect(new Set(s.order).size).toBe(s.order.length);
  expect(sorted(s.opened)).toEqual(sorted(s.order));
  expect(s.opened).toEqual(expectedOpened);
  // minimized is sorted, unique and a subset of order
  expect(isSortedUnique(s.minimized)).toBe(true);
  for (const id of s.minimized) expect(s.order).toContain(id);
  // Property: Req 6.3 focused is the topmost non-minimized window, or null
  expect(s.focused).toBe(topVisible(s.order, s.minimized));
  if (s.focused !== null) expect(s.minimized).not.toContain(s.focused);
  expect(s.focused === null).toBe(s.order.every((id) => s.minimized.includes(id)));
}

/** Reference model for `opened`: append on first open, remove on close. */
function nextOpened(opened: readonly string[], op: StackOp): readonly string[] {
  if (op.type === 'open' && !opened.includes(op.id)) return [...opened, op.id];
  if (op.type === 'close') return without(opened, op.id);
  return opened;
}

/** `open` / `focus` rule on a known id (Req 6.1, 6.2, 7.3). */
function expectFocusEffect(prev: WindowStack, next: WindowStack, id: string): void {
  expect(next.order[next.order.length - 1]).toBe(id);
  expect(next.focused).toBe(id);
  expect(next.minimized).not.toContain(id);
  expect(without(next.order, id)).toEqual(without(prev.order, id));
  expect(next.minimized).toEqual(without(prev.minimized, id));
  expect(next.opened).toEqual(prev.opened);
}

/** `minimize` rule on a known id (Req 6.5, 7.2). */
function expectMinimizeEffect(prev: WindowStack, next: WindowStack, id: string): void {
  if (prev.minimized.includes(id)) {
    expect(next).toEqual(prev);
    return;
  }
  expect(next.minimized).toEqual(sorted([...prev.minimized, id]));
  expect(next.opened).toEqual(prev.opened);
  expect(next.opened).toContain(id);
  expect(next.order).toEqual(prev.order);
  expect(next.focused).not.toBe(id);
}

function expectOpEffect(prev: WindowStack, next: WindowStack, op: StackOp): void {
  const known = prev.order.includes(op.id);
  if (!known && op.type !== 'open') {
    // Unknown ids leave the stack unchanged.
    expect(next).toEqual(prev);
    return;
  }
  switch (op.type) {
    case 'open':
      if (known) {
        expectFocusEffect(prev, next, op.id);
      } else {
        // Property: Req 6.1 a new window goes on top of everything and takes focus
        expect(next.opened).toEqual([...prev.opened, op.id]);
        expect(next.order).toEqual([...prev.order, op.id]);
        expect(next.minimized).toEqual(prev.minimized);
        expect(next.focused).toBe(op.id);
      }
      return;
    case 'focus':
      // Property: Req 6.2 focusing restores, raises to the top and focuses
      expectFocusEffect(prev, next, op.id);
      return;
    case 'close':
      // Property: Req 6.4 close removes the window and keeps the others' stacking order
      expect(next.order).toEqual(without(prev.order, op.id));
      expect(next.opened).toEqual(without(prev.opened, op.id));
      expect(next.minimized).toEqual(without(prev.minimized, op.id));
      return;
    case 'minimize':
      // Property: Req 6.5 minimize hides the window but keeps its Taskbar button
      expectMinimizeEffect(prev, next, op.id);
      return;
    case 'taskbar':
      // Property: Req 7.2 / 7.3 the focused button minimizes, any other restores and focuses
      if (prev.focused === op.id) expectMinimizeEffect(prev, next, op.id);
      else expectFocusEffect(prev, next, op.id);
      return;
  }
}

describe('windowStack properties', () => {
  it('Property 6: the window stack invariants hold after every operation', () => {
    // Feature: retro-shell, Property 6: The window stack invariants hold after every operation
    // Property: Req 6.3 focused is always the topmost non-minimized window
    // Property: Req 7.1 opened lists the open windows in first-open order
    fc.assert(
      fc.property(opsArb, (ops) => {
        let stack = EMPTY_STACK;
        let expectedOpened: readonly string[] = [];
        expectInvariants(stack, expectedOpened);
        for (const op of ops) {
          stack = applyStackOp(stack, op);
          expectedOpened = nextOpened(expectedOpened, op);
          expectInvariants(stack, expectedOpened);
          expect(Object.isFrozen(stack)).toBe(true);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('Property 7: window operations have their stated effects', () => {
    // Feature: retro-shell, Property 7: Window operations have their stated effects
    // Property: Req 6.1, 6.2, 6.4, 6.5, 7.2, 7.3 each op matches its rule in the op table
    fc.assert(
      fc.property(opsArb, opArb, (prefix, op) => {
        // Check every op along the prefix as well as the final one, each against its own
        // reachable previous stack.
        let prev = EMPTY_STACK;
        for (const current of [...prefix, op]) {
          const before = snapshot(prev);
          const next = applyStackOp(prev, current);
          expectOpEffect(prev, next, current);
          // The input stack is never mutated.
          expect(prev).toEqual(before);
          prev = next;
        }
      }),
      { numRuns: 200 },
    );
  });
});
