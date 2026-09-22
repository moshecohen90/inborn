/** The part of `window` the bridge touches; a plain object is what the tests pass. */
export interface ResizeScope {
  visualViewport?: { dispatchEvent(event: unknown): boolean } | null;
  dispatchEvent(event: unknown): boolean;
}

/**
 * Tell react-native-web's `Dimensions` that the viewport changed (spec §8.9).
 *
 * It subscribes to `visualViewport`'s resize event when that object exists and to `window`'s only when it does
 * not, so the signal has to follow the same branch — a resize event on `window` is ignored by a browser that
 * has a visual viewport, which every WebKit one does.
 */
export function dispatchViewportResize(scope: ResizeScope, event: unknown): void {
  if (scope.visualViewport) scope.visualViewport.dispatchEvent(event);
  else scope.dispatchEvent(event);
}
