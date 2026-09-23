import { describe, expect, it, vi } from "vitest";
import { actionOf, currentRoot, dump, fiberOf, findAll, hostOf, isDisabled, pressTarget, routeOf, scrollerOf, subtree, textOf, typeTarget, type QaFiber } from "./tree";

/** A fiber as React builds it: first child, then siblings, every node pointing back at its parent. */
function fiber(props: Record<string, unknown> | string, children: QaFiber[] = [], extra: Partial<QaFiber> = {}): QaFiber {
  const node: QaFiber = { tag: typeof props === "string" ? 6 : 5, child: null, sibling: null, return: null, stateNode: null, memoizedProps: props, ...extra };
  let previous: QaFiber | null = null;
  for (const child of children) {
    child.return = node;
    if (previous) previous.sibling = child;
    else node.child = child;
    previous = child;
  }
  return node;
}

const text = (s: string): QaFiber => fiber(s);

describe("subtree", () => {
  it("yields the node, then its subtree, then its siblings' subtrees", () => {
    const tree = fiber({ testID: "root" }, [fiber({ testID: "a" }, [fiber({ testID: "a1" })]), fiber({ testID: "b" })]);
    expect([...subtree(tree)].map((f) => (f.memoizedProps as { testID: string }).testID)).toEqual(["root", "a", "a1", "b"]);
  });

  it("never walks past the start node into its own siblings", () => {
    const tree = fiber({ testID: "root" }, [fiber({ testID: "a" }), fiber({ testID: "b" })]);
    const a = tree.child as QaFiber;
    expect([...subtree(a)].map((f) => (f.memoizedProps as { testID: string }).testID)).toEqual(["a"]);
  });
});

describe("currentRoot", () => {
  it("returns the FiberRoot's committed tree, not the stale alternate the ref captured", () => {
    const committed = fiber({ testID: "committed" });
    const stale = fiber({ testID: "stale" }, [fiber({ testID: "deep" })], { stateNode: { current: committed } });
    const deep = stale.child as QaFiber;
    expect((currentRoot(deep).memoizedProps as { testID: string }).testID).toBe("committed");
  });

  it("falls back to the climbed root when there is no FiberRoot", () => {
    const root = fiber({ testID: "root" }, [fiber({ testID: "deep" })]);
    expect(currentRoot(root.child as QaFiber)).toBe(root);
  });
});

describe("textOf", () => {
  it("collects every rendered string in order and collapses whitespace", () => {
    const tree = fiber({ testID: "row" }, [fiber({}, [text("INSTANT ")]), fiber({}, [text("\n  Qwen3.5 0.8B")])]);
    expect(textOf(tree)).toBe("INSTANT Qwen3.5 0.8B");
  });

  it("ignores props that merely look like text", () => {
    expect(textOf(fiber({ testID: "x", title: "not rendered" }))).toBe("");
  });
});

describe("actionOf", () => {
  it("calls onPress with a synthetic event", () => {
    const onPress = vi.fn();
    actionOf(fiber({ testID: "send", onPress }))?.run();
    expect(onPress).toHaveBeenCalledWith({ nativeEvent: {} });
  });

  it("flips a Toggle: onChange gets the opposite of value", () => {
    const onChange = vi.fn();
    actionOf(fiber({ testID: "wifi-only", value: true, onChange }))?.run();
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it("flips a settings Row: onToggle gets the opposite of toggle", () => {
    const onToggle = vi.fn();
    actionOf(fiber({ testID: "row-hide", toggle: false, onToggle }))?.run();
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it("refuses a disabled control, by prop and by accessibilityState", () => {
    expect(actionOf(fiber({ testID: "send", onPress: vi.fn(), disabled: true }))).toBeNull();
    expect(actionOf(fiber({ testID: "send", onPress: vi.fn(), accessibilityState: { disabled: true } }))).toBeNull();
    expect(isDisabled(fiber({ testID: "send", onPress: vi.fn() }))).toBe(false);
  });

  it("is null where there is nothing to call", () => {
    expect(actionOf(fiber({ testID: "assistant-text" }))).toBeNull();
  });
});

describe("pressTarget", () => {
  it("prefers the innermost node carrying the id — the control a finger would hit", () => {
    const inner = vi.fn();
    const outer = vi.fn();
    const tree = fiber({}, [fiber({ testID: "wifi-only", value: false, onChange: outer }, [fiber({ testID: "wifi-only", onPress: inner })])]);
    pressTarget(tree, "wifi-only")?.action.run();
    expect(inner).toHaveBeenCalledTimes(1);
    expect(outer).not.toHaveBeenCalled();
  });

  it("falls back to the outer node when the inner one is disabled", () => {
    const outer = vi.fn();
    const tree = fiber({}, [fiber({ testID: "t", value: false, onChange: outer }, [fiber({ testID: "t", onPress: vi.fn(), disabled: true })])]);
    expect(pressTarget(tree, "t")?.action.kind).toBe("onChange");
    pressTarget(tree, "t")?.action.run();
    expect(outer).toHaveBeenCalledWith(true);
  });

  it("is null for an id that is not mounted", () => {
    expect(pressTarget(fiber({}), "nope")).toBeNull();
  });
});

describe("typeTarget", () => {
  it("finds the field that takes text", () => {
    const onChangeText = vi.fn();
    const tree = fiber({}, [fiber({ testID: "composer-input", onChangeText, value: "" })]);
    typeTarget(tree, "composer-input")?.("שלום");
    expect(onChangeText).toHaveBeenCalledWith("שלום");
    expect(typeTarget(tree, "send")).toBeNull();
  });
});

describe("findAll / dump", () => {
  const tree = fiber({}, [
    fiber({ testID: "row-pro", onPress: vi.fn(), accessibilityRole: "button" }, [text("See what's in Pro"), text("FREE")]),
    fiber({ testID: "wifi-only", value: true, onChange: vi.fn(), accessibilityLabel: "Wi-Fi only" }, [fiber({ testID: "wifi-only", accessibilityState: { checked: true } })]),
    fiber({ testID: "assistant-text" }, [text("Arendal")]),
  ]);

  it("returns every node carrying the id, outermost first", () => {
    expect(findAll(tree, "wifi-only")).toHaveLength(2);
    expect(findAll(tree, "missing")).toEqual([]);
  });

  it("reports one row per testID with its text, role and pressability", () => {
    const rows = dump(tree);
    expect(rows.map((r) => r.testID)).toEqual(["row-pro", "wifi-only", "assistant-text"]);
    expect(rows[0]).toMatchObject({ text: "See what's in Pro FREE", role: "button", pressable: true });
    expect(rows[1]).toMatchObject({ value: "true", pressable: true });
    expect(rows[2]?.pressable).toBeUndefined();
  });
});

describe("hostOf / scrollerOf", () => {
  it("returns the first measurable host node under the id", () => {
    const host = { measureLayout: vi.fn() };
    const tree = fiber({}, [fiber({ testID: "wifi-only" }, [fiber({}, [], { stateNode: host })])]);
    expect(hostOf(tree, "wifi-only")).toBe(host);
    expect(hostOf(tree, "other")).toBeNull();
  });

  it("walks up to the enclosing scroll view", () => {
    const scroller = { scrollTo: vi.fn(), getInnerViewRef: vi.fn() };
    const tree = fiber({}, [fiber({}, [fiber({ testID: "wifi-only" })], { stateNode: scroller })]);
    expect(scrollerOf(tree, "wifi-only")).toBe(scroller);
    expect(scrollerOf(fiber({}, [fiber({ testID: "x" })]), "x")).toBeNull();
  });
});

describe("fiberOf", () => {
  const fiberLike = { memoizedProps: { testID: "root" }, stateNode: null, return: null };

  it("reads the handle under each name React Native has used", () => {
    expect(fiberOf({ __internalInstanceHandle: fiberLike })).toBe(fiberLike);
    expect(fiberOf({ _internalInstanceHandle: fiberLike })).toBe(fiberLike);
    expect(fiberOf({ _internalFiberInstanceHandleDEV: fiberLike })).toBe(fiberLike);
  });

  it("finds a Symbol-keyed handle, which is where ReactNativeElement keeps it", () => {
    expect(fiberOf({ [Symbol("internalInstanceHandle")]: fiberLike })).toBe(fiberLike);
  });

  it("is null for a node that carries nothing fiber-shaped", () => {
    expect(fiberOf({ nativeTag: 11, viewConfig: {} })).toBeNull();
    expect(fiberOf(null)).toBeNull();
  });
});

describe("routeOf", () => {
  it("turns every spelling of a deep link into the router path", () => {
    expect(routeOf("inborn:///vault")).toBe("/vault");
    expect(routeOf("inborn://vault")).toBe("/vault");
    expect(routeOf("inborn:///")).toBe("/");
    expect(routeOf("/settings")).toBe("/settings");
    expect(routeOf("settings/about")).toBe("/settings/about");
  });
});

describe("closed sheets are not on screen", () => {
  it("does not walk into a visible={false} subtree", () => {
    const tree = fiber({ testID: "chat" }, [
      fiber({ visible: false }, [fiber({ testID: "attach-sheet" }, [text("Answer only from my documents")])]),
      fiber({ visible: true }, [fiber({ testID: "model-sheet" }, [text("CHOOSE A MODEL")])]),
    ]);
    expect(findAll(tree, "attach-sheet")).toEqual([]);
    expect(findAll(tree, "model-sheet")).toHaveLength(1);
    expect(textOf(tree)).toBe("CHOOSE A MODEL");
    expect(dump(tree).map((r) => r.testID)).toEqual(["chat", "model-sheet"]);
  });

  it("a control inside a closed sheet cannot be pressed", () => {
    const onChange = vi.fn();
    const tree = fiber({}, [fiber({ visible: false }, [fiber({ testID: "attach-strict", value: false, onChange })])]);
    expect(pressTarget(tree, "attach-strict")).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("hostOf under Fabric", () => {
  it("unwraps canonical.publicInstance, which is where the measurable node lives", () => {
    const instance = { measureLayout: vi.fn() };
    const tree = fiber({}, [fiber({ testID: "wifi-only" }, [fiber({}, [], { stateNode: { canonical: { publicInstance: instance } } })])]);
    expect(hostOf(tree, "wifi-only")).toBe(instance);
  });

  it("ignores an internal instance that carries no measureLayout anywhere", () => {
    const tree = fiber({}, [fiber({ testID: "x" }, [fiber({}, [], { stateNode: { canonical: {} } })])]);
    expect(hostOf(tree, "x")).toBeNull();
  });
});
