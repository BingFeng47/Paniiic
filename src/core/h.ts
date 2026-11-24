/**
 * Tiny DOM builder. Strings and numbers always become `Text` nodes, so markup characters in game
 * or ad text show up literally (Req 14.3, 14.4). This module never touches `innerHTML`.
 */

export type Child = Node | string | number | null | undefined | false;

export type Listeners = {
  readonly [K in keyof HTMLElementEventMap]?: (e: HTMLElementEventMap[K]) => void;
};

export interface Props {
  readonly className?: string;
  /** Plain attributes. Names starting with "on" (any case) throw, so inline handlers can't be set from strings. */
  readonly attrs?: Readonly<Record<string, string>>;
  /** Listeners attached to the element itself; they go away with the element. */
  readonly on?: Listeners;
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: Props | null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);

  if (props) {
    if (props.className !== undefined) el.className = props.className;

    if (props.attrs) {
      for (const [name, value] of Object.entries(props.attrs)) {
        if (name.toLowerCase().startsWith('on')) {
          throw new Error(`h(): attribute "${name}" is not allowed; use props.on for listeners`);
        }
        el.setAttribute(name, value);
      }
    }

    if (props.on) {
      for (const [type, listener] of Object.entries(props.on)) {
        if (listener) el.addEventListener(type, listener as EventListener);
      }
    }
  }

  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    el.appendChild(
      typeof child === 'string' || typeof child === 'number'
        ? document.createTextNode(String(child))
        : child,
    );
  }

  return el;
}
