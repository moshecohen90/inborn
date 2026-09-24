import { I18nManager, Platform, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import { hiddenFromScreenReaders } from "../a11y";
import { ICONS, type IconName } from "./paths";

export interface IconProps {
  name: IconName;
  size?: number;
  color: string;
  strokeWidth?: number;
  /** Stroke-only glyphs by default; `fill` paints the shape (the stop square). */
  fill?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** One-line vector icon (§9.5, §9.8). Directional glyphs mirror when the layout is RTL. */
export function Icon({ name, size = 20, color, strokeWidth = 2, fill = false, style, testID }: IconProps) {
  const def = ICONS[name];
  const mirrored = "mirror" in def && def.mirror && I18nManager.isRTL;
  return (
    <Svg
      testID={testID}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill ? color : "none"}
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...hiddenFromScreenReaders(Platform.OS)}
      style={[mirrored ? { transform: [{ scaleX: -1 }] } : null, style]}
    >
      {def.paths.map((d) => (
        <Path key={d} d={d} />
      ))}
      {"rects" in def ? def.rects.map((r) => <Rect key={`${r.x}-${r.y}`} x={r.x} y={r.y} width={r.width} height={r.height} rx={r.rx} />) : null}
    </Svg>
  );
}
