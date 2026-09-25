import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { inertOutside, type InertNode } from "../src/lock/inertOutside";
import { opensActions } from "../src/lib/actionKeys";
import { emitShortcut, onShortcut, setShortcutsBlocked } from "../src/lib/shortcuts";

/** Round 95: keyboard and screen-reader access on the web build (F381-F384, web-full-pass F3, F10, F11, F12). */
const repo = join(__dirname, "../../..");
const read = (p: string) => readFileSync(join(repo, p), "utf8");

class Node implements InertNode {
  inert = false;
  parentElement: Node | null = null;
  children: Node[] = [];
  attrs = new Map<string, string>();
  constructor(public id: string, kids: Node[] = []) {
    for (const k of kids) {
      k.parentElement = this;
      this.children.push(k);
    }
  }
  getAttribute(k: string) {
    return this.attrs.get(k) ?? null;
  }
  setAttribute(k: string, v: string) {
    this.attrs.set(k, v);
  }
  removeAttribute(k: string) {
    this.attrs.delete(k);
  }
}

describe("F381 · the lock makes everything else inert and hidden", () => {
  const tree = () => {
    const lock = new Node("lock");
    const stack = new Node("stack");
    const icon = new Node("icon");
    icon.setAttribute("aria-hidden", "true");
    const banners = new Node("banners", [icon]);
    const shell = new Node("shell", [stack, banners, lock]);
    const strip = new Node("strip");
    const browser = new Node("browser", [strip, shell]);
    const root = new Node("root", [browser]);
    const portal = new Node("old-sheet", [new Node("open-sheet")]);
    const body = new Node("body", [root, portal]);
    return { lock, stack, banners, icon, shell, strip, browser, root, portal, body };
  };

  it("marks every sibling on the way up to the body, and nothing on the lock's own path", () => {
    const n = tree();
    inertOutside(n.lock, n.body);
    for (const x of [n.stack, n.banners, n.strip, n.portal]) {
      expect(x.inert, x.id).toBe(true);
      expect(x.getAttribute("aria-hidden"), x.id).toBe("true");
    }
    for (const x of [n.lock, n.shell, n.browser, n.root, n.body]) expect(x.inert, x.id).toBe(false);
  });

  it("puts back exactly what it found when the lock goes", () => {
    const n = tree();
    n.banners.setAttribute("aria-hidden", "false");
    n.strip.inert = true;
    const restore = inertOutside(n.lock, n.body);
    restore();
    expect(n.stack.inert).toBe(false);
    expect(n.stack.getAttribute("aria-hidden")).toBeNull();
    expect(n.banners.getAttribute("aria-hidden")).toBe("false");
    expect(n.strip.inert).toBe(true);
    expect(n.icon.getAttribute("aria-hidden")).toBe("true");
  });

  it("spares what `keep` names, such as the empty portal the lock's own passcode sheet opens into", () => {
    const n = tree();
    const empty = new Node("empty-portal");
    empty.parentElement = n.body;
    n.body.children.push(empty);
    inertOutside(n.lock, n.body, (x) => x.parentElement === n.body && x.children.length === 0);
    expect(empty.inert).toBe(false);
    expect(n.portal.inert).toBe(true);
  });

  it("is mounted by the lock screen on the web, and the shortcuts are held while locked", () => {
    const lock = read("apps/mobile/src/lock/LockScreen.tsx");
    expect(lock).toMatch(/useInertOutside\(/);
    const layout = read("apps/mobile/src/app/_layout.tsx");
    expect(layout).toMatch(/setShortcutsBlocked\(lock\.locked\)/);
  });

  it("drops every shortcut while blocked", () => {
    const got: string[] = [];
    const off = onShortcut((id) => got.push(id));
    setShortcutsBlocked(true);
    emitShortcut("palette");
    setShortcutsBlocked(false);
    emitShortcut("new-chat");
    off();
    expect(got).toEqual(["new-chat"]);
  });
});

describe("F382 · message actions open from the keyboard", () => {
  const on = { id: "answer" };
  const child = { id: "reasoning-toggle" };
  const ev = (key: string, shiftKey = false, target: object = on) => ({ key, shiftKey, target, currentTarget: on });
  it("Enter, Space, ContextMenu and Shift+F10 on the focused message", () => {
    for (const e of [ev("Enter"), ev(" "), ev("ContextMenu"), ev("F10", true)]) expect(opensActions(e), e.key).toBe(true);
  });
  it("not F10 alone, not other keys, not a key meant for a button inside the message", () => {
    for (const e of [ev("F10"), ev("a"), ev("Tab"), ev("Enter", false, child)]) expect(opensActions(e), e.key).toBe(false);
  });
  it("both message kinds bind the keys and the right-click to the long-press sheet", () => {
    for (const f of ["apps/mobile/src/components/chat/AssistantMessage.tsx", "apps/mobile/src/components/chat/UserMessage.tsx"]) {
      expect(read(f), f).toMatch(/\{\.\.\.actionsMenuProps\(onLongPress, Platform\.OS\)\}/);
    }
    const keys = read("apps/mobile/src/lib/actionKeys.ts");
    expect(keys).toMatch(/onKeyDown/);
    expect(keys).toMatch(/onContextMenu/);
  });
});

describe("F383 · chat row actions on the web", () => {
  it("the swipe buttons leave the tab order and the accessibility tree on the web", () => {
    const swipe = read("apps/mobile/src/screens/chat/SwipeRow.tsx");
    expect(swipe).toMatch(/tabIndex=\{web \? -1 : undefined\}/);
    expect(swipe).toMatch(/aria-hidden/);
  });
  it("every row has a visible More button that opens the row menu", () => {
    const chats = read("apps/mobile/src/screens/Chats.tsx");
    expect(chats).toMatch(/testID=\{`chat-more-\$\{item\.id\}`\}/);
  });
});
