import Svg, { Line, Rect } from "react-native-svg";

/** §9.5 motif 2: rounded square, four pins per side, inner square. The trust icon instead of a shield. */
export function ChipGlyph({ size = 12, color }: { size?: number; color: string }) {
  const s = 24;
  const pins = [5, 9.5, 14, 18.5];
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${s} ${s}`}>
      <Rect x={5} y={5} width={14} height={14} rx={3} stroke={color} strokeWidth={1.6} fill="none" />
      <Rect x={9.5} y={9.5} width={5} height={5} rx={1} fill={color} />
      {pins.map((p) => (
        <Line key={`t${p}`} x1={p + 0.5} y1={1.5} x2={p + 0.5} y2={5} stroke={color} strokeWidth={1.2} strokeLinecap="round" />
      ))}
      {pins.map((p) => (
        <Line key={`b${p}`} x1={p + 0.5} y1={19} x2={p + 0.5} y2={22.5} stroke={color} strokeWidth={1.2} strokeLinecap="round" />
      ))}
      {pins.map((p) => (
        <Line key={`l${p}`} x1={1.5} y1={p + 0.5} x2={5} y2={p + 0.5} stroke={color} strokeWidth={1.2} strokeLinecap="round" />
      ))}
      {pins.map((p) => (
        <Line key={`r${p}`} x1={19} y1={p + 0.5} x2={22.5} y2={p + 0.5} stroke={color} strokeWidth={1.2} strokeLinecap="round" />
      ))}
    </Svg>
  );
}
