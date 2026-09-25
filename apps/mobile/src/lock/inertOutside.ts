/** The slice of a DOM element this needs; a plain tree stands in for it in the tests. */
export interface InertNode {
  inert: boolean;
  parentElement: InertNode | null;
  children: ArrayLike<InertNode>;
  getAttribute(k: string): string | null;
  setAttribute(k: string, v: string): void;
  removeAttribute(k: string): void;
}

/**
 * Makes every sibling of `target` and of each of its ancestors up to `stop` inert and aria-hidden, so the keyboard
 * and a screen reader reach only `target`. `keep` spares siblings that must stay live. Returns the undo, which
 * touches only what this call changed.
 */
export function inertOutside(target: InertNode, stop: InertNode, keep: (n: InertNode) => boolean = () => false): () => void {
  const changed: InertNode[] = [];
  const hidden: InertNode[] = [];
  for (let node: InertNode = target; node !== stop && node.parentElement; node = node.parentElement) {
    for (const sibling of Array.from(node.parentElement.children)) {
      if (sibling === node || sibling.inert || keep(sibling)) continue;
      sibling.inert = true;
      changed.push(sibling);
      if (sibling.getAttribute("aria-hidden") === null) {
        sibling.setAttribute("aria-hidden", "true");
        hidden.push(sibling);
      }
    }
  }
  return () => {
    for (const n of changed) n.inert = false;
    for (const n of hidden) n.removeAttribute("aria-hidden");
  };
}
