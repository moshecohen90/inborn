/**
 * Persisted file locations (documents, message photos) are kept RELATIVE to the app's document directory: iOS moves
 * the data container to a new UUID on every reinstall or update, so an absolute `file://` URI written today points at
 * nothing tomorrow. Pure helpers; the platform passes its current root URI.
 */

const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/** True for what is already a location the platform can open as is (a URI with a scheme, a blob, an absolute web path). */
export const isAbsoluteLocation = (value: string): boolean => SCHEME.test(value) || value.startsWith("/");

const withSlash = (root: string): string => (root.endsWith("/") ? root : `${root}/`);

/** Last path segment of the root directory ("Documents" on iOS, "files" on Android); used to recognise a stale container path. */
function rootSegment(root: string): string {
  const parts = withSlash(root).split("/").filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

/**
 * The stored form of a location: relative to `rootUri` when it lives under it (or under the same directory of a
 * previous container), unchanged otherwise (content://, blob:, a bundled or Play-delivered path).
 */
export function toStoredPath(uri: string, rootUri: string): string {
  if (!uri) return uri;
  const root = withSlash(rootUri);
  if (uri.startsWith(root)) return uri.slice(root.length);
  const tail = containerTail(uri, rootSegment(root));
  return tail ?? uri;
}

/** For a `file://` URI of an older container: everything after `/<rootSegment>/`, or null when the layout is unknown. */
function containerTail(uri: string, segment: string): string | null {
  if (!segment || !uri.startsWith("file:")) return null;
  const marker = `/${segment}/`;
  const at = uri.indexOf(marker);
  if (at < 0) return null;
  const tail = uri.slice(at + marker.length);
  return tail && !tail.startsWith("/") ? tail : null;
}

/** The location to open now: a relative stored path joined to the current root; a stale absolute path re-based onto it. */
export function resolveStoredPath(stored: string, rootUri: string): string {
  if (!stored) return stored;
  const root = withSlash(rootUri);
  if (!isAbsoluteLocation(stored)) return root + stored;
  if (stored.startsWith(root)) return stored;
  const tail = containerTail(stored, rootSegment(root));
  return tail ? root + tail : stored;
}
