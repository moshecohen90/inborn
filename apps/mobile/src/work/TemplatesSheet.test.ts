import { createContext, createElement, useContext, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PACKS } from "@inborn/core";

/*
 * F338. The Work templates sheet greyed a locked row out with `disabled` and put the WORK chip inside that same row, so on
 * the web neither the row nor the chip reached the paywall; the banner chip reached it with no reason at all.
 * `react-native` is replaced by host stubs whose Pressable drops the tap when it, or any Pressable around it, is disabled,
 * which is what RN does; the real SheetItem, WorkTag and TemplatesSheet render on top of it.
 */
type Door = { onPress?: () => void; dead: boolean };
const doors = vi.hoisted(() => new Map<string, Door[]>());
const state = vi.hoisted(() => ({ locked: true, seed: [] as unknown[] }));
const openPaywall = vi.hoisted(() => vi.fn());

vi.mock("react-native", async () => {
  const Disabled = createContext(false);
  const host = (tag: string) => ({ children, testID }: { children?: ReactNode; testID?: string }) => createElement(tag, { "data-testid": testID }, children);
  function Pressable({ children, testID, disabled, onPress }: { children?: ReactNode; testID?: string; disabled?: boolean; onPress?: () => void }) {
    const dead = useContext(Disabled) || !!disabled;
    const id = testID ?? "(none)";
    doors.set(id, [...(doors.get(id) ?? []), { onPress, dead }]);
    return createElement(Disabled.Provider, { value: dead }, createElement("button", { "data-testid": testID, disabled: dead }, children));
  }
  const style = new Proxy({}, { get: () => ({}) });
  return {
    Pressable,
    View: host("div"),
    Text: host("span"),
    TextInput: host("input"),
    ScrollView: host("div"),
    Modal: ({ children, visible }: { children?: ReactNode; visible: boolean }) => (visible ? createElement("div", null, children) : null),
    StyleSheet: { create: <T>(s: T) => s, flatten: (s: unknown) => s, absoluteFillObject: {}, hairlineWidth: 1 },
    Platform: { OS: "web", select: (o: Record<string, unknown>) => o.web ?? o.default },
    useWindowDimensions: () => ({ width: 390, height: 844, scale: 1, fontScale: 1 }),
    Keyboard: { addListener: () => ({ remove() {} }) },
    LayoutAnimation: {},
    AccessibilityInfo: {},
    Animated: { View: host("div"), Value: class {} },
    style,
  };
});
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  /* The pack is picked by a tap the server renderer cannot replay, so the sheet's first state starts on it. */
  return { ...actual, useState: (init: unknown) => actual.useState(state.seed.length ? state.seed.shift() : init) };
});
vi.mock("react-native-svg", () => { const Svg = () => null; return { __esModule: true, default: Svg, Svg, Path: Svg, Circle: Svg, Rect: Svg, G: Svg, Line: Svg, Polyline: Svg, Polygon: Svg, Defs: Svg, LinearGradient: Svg, Stop: Svg, Ellipse: Svg, ClipPath: Svg }; });
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string) => k, i18n: { language: "en" } }) }));
vi.mock("expo-router", () => ({ router: { push: vi.fn() } }));
vi.mock("expo-glass-effect", () => ({ GlassView: () => null, isLiquidGlassAvailable: () => false }));
vi.mock("../licence/openPaywall", () => ({ openPaywall }));
vi.mock("../lib/theme", () => ({ useTheme: () => new Proxy({}, { get: () => "#000" }) }));
vi.mock("../services/theme", () => ({ useTheme: () => new Proxy({}, { get: () => "#000" }), useTextScale: () => 1 }));
vi.mock("../services/haptics", () => ({ haptic: () => {} }));
vi.mock("../services/type", () => ({ useType: () => new Proxy({}, { get: () => ({}) }), font: () => ({}) }));
vi.mock("../lib/keyboard", () => ({ useKeyboardLift: () => 0 }));
vi.mock("../lib/openSheets", () => ({ useOpenSheet: () => {} }));
vi.mock("../lib/useLayout", () => ({ useWide: () => false }));
vi.mock("../components/shell/NativeChrome", () => ({ GlassFill: () => null, panelColor: (c: string) => c, panelStyle: {} }));
vi.mock("../components/shell/primitives", () => ({ Button: () => null }));
vi.mock("./hooks", () => ({ useWorkGate: () => ({ templatesLocked: state.locked, price: "$69.99" }) }));

const { TemplatesSheet } = await import("./TemplatesSheet");
/* The app ships no react-dom types; the server renderer is only needed to run the hooks. */
const serverRenderer: string = "react-dom/server";
const { renderToStaticMarkup } = (await import(serverRenderer)) as { renderToStaticMarkup: (el: ReactElement) => string };

const pack = PACKS[0]!;
function render(opts: { locked: boolean; inPack: boolean }) {
  doors.clear();
  openPaywall.mockClear();
  state.locked = opts.locked;
  state.seed = opts.inPack ? [pack] : [];
  const onClose = vi.fn();
  const onInsert = vi.fn();
  renderToStaticMarkup(createElement(TemplatesSheet, { visible: true, onClose, onInsert }));
  return { onClose };
}
const tap = (id: string, i = 0) => {
  const door = doors.get(id)?.[i];
  expect(door, `${id} is rendered`).toBeDefined();
  if (!door!.dead) door!.onPress?.();
  return door!;
};

describe("F338 · a locked Work template opens the paywall saying why", () => {
  beforeEach(() => doors.clear());

  it("every locked template row is live and opens /paywall?reason=templates", () => {
    const { onClose } = render({ locked: true, inPack: true });
    for (const tp of pack.templates) {
      openPaywall.mockClear();
      const row = tap(`template-${tp.id}`);
      expect(row.dead, `template-${tp.id} must not be disabled`).toBe(false);
      expect(openPaywall).toHaveBeenCalledWith("templates");
    }
    expect(onClose).toHaveBeenCalled();
  });

  it("the WORK chip on each locked row reaches the paywall with the same reason", () => {
    render({ locked: true, inPack: true });
    const chips = doors.get("work-tag") ?? [];
    expect(chips).toHaveLength(pack.templates.length);
    chips.forEach((_, i) => {
      openPaywall.mockClear();
      const chip = tap("work-tag", i);
      expect(chip.dead, "the chip sits inside a disabled row").toBe(false);
      expect(openPaywall).toHaveBeenCalledWith("templates");
    });
  });

  it("the banner chip on the pack list names the reason too", () => {
    render({ locked: true, inPack: false });
    tap("work-tag");
    expect(openPaywall).toHaveBeenCalledTimes(1);
    expect(openPaywall).toHaveBeenCalledWith("templates");
  });

  it("with Work the row opens the template and the paywall stays shut", () => {
    render({ locked: false, inPack: true });
    expect(doors.get("work-tag")).toBeUndefined();
    tap(`template-${pack.templates[0]!.id}`);
    expect(openPaywall).not.toHaveBeenCalled();
  });
});
