/**
 * The React tree as the QA bridge sees it: every `testID` already in the app is addressable without a native
 * module, an accessibility grant or Apple's UI-Automation passcode sheet. Only the fiber fields React has kept
 * stable since 16 are read (`tag`, `child`, `sibling`, `return`, `stateNode`, `memoizedProps`).
 */

export interface QaFiber {
  tag: number;
  child: QaFiber | null;
  sibling: QaFiber | null;
  return: QaFiber | null;
  stateNode: unknown;
  memoizedProps: unknown;
}

/** React's HostText tag: its `memoizedProps` is the rendered string itself. */
const HOST_TEXT = 6;

const isFiber = (v: unknown): v is QaFiber => !!v && typeof v === "object" && "memoizedProps" in v && "stateNode" in v && "return" in v;

/**
 * The fiber behind a host element. React Native has called this field `__internalInstanceHandle`,
 * `_internalInstanceHandle` and `_internalFiberInstanceHandleDEV` across architectures, and `ReactNativeElement`
 * also keeps it under a private Symbol, so the named fields are tried first and then anything fiber-shaped.
 */
export function fiberOf(node: unknown): QaFiber | null {
  if (!node || typeof node !== "object") return null;
  const host = node as Record<PropertyKey, unknown>;
  for (const key of ["__internalInstanceHandle", "_internalInstanceHandle", "_internalFiberInstanceHandleDEV"]) if (isFiber(host[key])) return host[key];
  for (const key of Object.keys(host)) if (isFiber(host[key])) return host[key];
  for (const key of Object.getOwnPropertySymbols(host)) if (isFiber(host[key])) return host[key];
  return null;
}

/** `inborn:///vault`, `inborn://vault` and `/vault` are the same route; the app navigates itself, the OS is not involved. */
export function routeOf(url: string): string {
  const path = url.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "/").replace(/\/{2,}/g, "/");
  return path.startsWith("/") ? path : `/${path}`;
}

/**
 * A closed `Sheet`/`Modal` keeps its whole subtree mounted — React renders the children and the Modal simply does
 * not present them. Walking into it would make `attach-sheet` addressable on the chat root and every `waitFor` on a
 * sheet pass before it opened, so a `visible={false}` node hides what is under it. Every `visible` prop in the app
 * belongs to a Sheet or a Modal.
 */
const hidden = (fiber: QaFiber): boolean => {
  const p = fiber.memoizedProps;
  return !!p && typeof p === "object" && (p as { visible?: unknown }).visible === false;
};

/** Every node of `from`'s subtree that is actually on screen, outermost first (siblings of `from` are not part of it). */
export function* subtree(from: QaFiber | null): Generator<QaFiber> {
  if (!from) return;
  yield from;
  const stack: QaFiber[] = from.child && !hidden(from) ? [from.child] : [];
  while (stack.length) {
    const node = stack.pop();
    if (!node) continue;
    yield node;
    if (node.sibling) stack.push(node.sibling);
    if (node.child && !hidden(node)) stack.push(node.child);
  }
}

/**
 * The committed tree. A handle captured in a ref belongs to whichever of the two alternates was current when the
 * ref ran, so the walk always restarts from the FiberRoot's `current` — otherwise a screen that re-rendered since
 * mount would be read at its old props.
 */
export function currentRoot(from: QaFiber): QaFiber {
  let node = from;
  while (node.return) node = node.return;
  const current = (node.stateNode as { current?: QaFiber } | null)?.current;
  return current ?? node;
}

export function propsOf(fiber: QaFiber): Record<string, unknown> {
  const p = fiber.memoizedProps;
  return p && typeof p === "object" ? (p as Record<string, unknown>) : {};
}

export function findAll(root: QaFiber, testID: string): QaFiber[] {
  const hits: QaFiber[] = [];
  for (const fiber of subtree(root)) if (propsOf(fiber).testID === testID) hits.push(fiber);
  return hits;
}

/** Every string rendered under `fiber`, in visual order, whitespace collapsed. */
export function textOf(fiber: QaFiber | null): string {
  const parts: string[] = [];
  for (const node of subtree(fiber)) {
    if (node.tag !== HOST_TEXT) continue;
    const value = node.memoizedProps;
    if (typeof value === "string" || typeof value === "number") parts.push(String(value));
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

export function isDisabled(fiber: QaFiber): boolean {
  const p = propsOf(fiber);
  if (p.disabled === true) return true;
  const state = p.accessibilityState as { disabled?: boolean } | undefined;
  return state?.disabled === true;
}

export interface Action {
  /** Which prop is being invoked, so a failing row names the handler it called. */
  kind: string;
  run: () => void;
}

/**
 * The handler a press should invoke. `Toggle`/`Row` carry the state in a prop and expect the flipped value, which
 * is why a press is not simply `onPress` — the Wi-Fi-only switch has no `onPress` at all.
 */
export function actionOf(fiber: QaFiber): Action | null {
  if (isDisabled(fiber)) return null;
  const p = propsOf(fiber);
  if (typeof p.onPress === "function") {
    const onPress = p.onPress as (event: unknown) => void;
    return { kind: "onPress", run: () => onPress({ nativeEvent: {} }) };
  }
  if (typeof p.onValueChange === "function") {
    const onValueChange = p.onValueChange as (v: boolean) => void;
    return { kind: "onValueChange", run: () => onValueChange(!p.value) };
  }
  if (typeof p.onChange === "function" && "value" in p) {
    const onChange = p.onChange as (v: boolean) => void;
    return { kind: "onChange", run: () => onChange(!p.value) };
  }
  if (typeof p.onToggle === "function") {
    const onToggle = p.onToggle as (v: boolean) => void;
    return { kind: "onToggle", run: () => onToggle(!p.toggle) };
  }
  return null;
}

/**
 * The innermost node carrying the testID that can actually be pressed. A `Toggle` renders a `Pressable` with the
 * same id, so both match; the inner one is the control the finger would hit.
 */
export function pressTarget(root: QaFiber, testID: string): { fiber: QaFiber; action: Action } | null {
  let found: { fiber: QaFiber; action: Action } | null = null;
  for (const fiber of findAll(root, testID)) {
    const action = actionOf(fiber);
    if (action) found = { fiber, action };
  }
  return found;
}

export function typeTarget(root: QaFiber, testID: string): ((text: string) => void) | null {
  let found: ((text: string) => void) | null = null;
  for (const fiber of findAll(root, testID)) {
    const onChangeText = propsOf(fiber).onChangeText;
    if (typeof onChangeText === "function") found = onChangeText as (text: string) => void;
  }
  return found;
}

export interface NodeReport {
  testID: string;
  text: string;
  role?: string;
  label?: string;
  value?: string;
  state?: Record<string, unknown>;
  disabled?: true;
  pressable?: true;
}

/** One row per testID on screen — the bridge's answer to `uiautomator dump` / the XCUITest accessibility tree. */
export function dump(root: QaFiber): NodeReport[] {
  const rows = new Map<string, NodeReport>();
  for (const fiber of subtree(root)) {
    const p = propsOf(fiber);
    const testID = p.testID;
    if (typeof testID !== "string" || rows.has(testID)) continue;
    const row: NodeReport = { testID, text: textOf(fiber) };
    if (typeof p.accessibilityRole === "string") row.role = p.accessibilityRole;
    if (typeof p.accessibilityLabel === "string") row.label = p.accessibilityLabel;
    if (typeof p.value === "string" || typeof p.value === "boolean" || typeof p.value === "number") row.value = String(p.value);
    if (p.accessibilityState && typeof p.accessibilityState === "object") row.state = p.accessibilityState as Record<string, unknown>;
    if (isDisabled(fiber)) row.disabled = true;
    rows.set(testID, row);
  }
  for (const fiber of subtree(root)) {
    const testID = propsOf(fiber).testID;
    if (typeof testID !== "string") continue;
    const row = rows.get(testID);
    if (row && !row.pressable && actionOf(fiber)) row.pressable = true;
  }
  return [...rows.values()];
}

/**
 * The measurable public instance of a host fiber. Under Fabric `stateNode` is the internal instance and the object
 * with `measureLayout` hangs off `canonical.publicInstance`; under the old renderer `stateNode` is that object.
 */
function publicInstance(stateNode: unknown): unknown {
  if (!stateNode || typeof stateNode !== "object") return null;
  const node = stateNode as { measureLayout?: unknown; publicInstance?: unknown; canonical?: { publicInstance?: unknown } };
  if (typeof node.measureLayout === "function") return node;
  const candidate = node.canonical?.publicInstance ?? node.publicInstance;
  return candidate && typeof (candidate as { measureLayout?: unknown }).measureLayout === "function" ? candidate : null;
}

/** The host instance behind a testID: the object a scroll or a measurement needs. */
export function hostOf(root: QaFiber, testID: string): unknown {
  for (const match of findAll(root, testID)) {
    for (const fiber of subtree(match)) {
      const instance = publicInstance(fiber.stateNode);
      if (instance) return instance;
    }
  }
  return null;
}

export interface Scrollable {
  scrollTo: (opts: { y: number; animated: boolean }) => void;
  getInnerViewRef?: () => unknown;
}

/** The nearest enclosing ScrollView instance of a testID, walking up the fibers. */
export function scrollerOf(root: QaFiber, testID: string): Scrollable | null {
  const matches = findAll(root, testID);
  const start = matches[matches.length - 1];
  for (let fiber: QaFiber | null = start ?? null; fiber; fiber = fiber.return) {
    const node = fiber.stateNode as Scrollable | null;
    if (node && typeof node.scrollTo === "function") return node;
  }
  return null;
}
