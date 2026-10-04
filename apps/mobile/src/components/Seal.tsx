import { forwardRef, useEffect, useId, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, PixelRatio, Platform, View } from "react-native";
import Svg, { Circle, type CircleProps, Defs, Path, type PathProps, RadialGradient, Stop } from "react-native-svg";
import { glow as glowTokens, motion, sealMark } from "@inborn/ui";
import { useTheme } from "../services/theme";
import { haptic } from "../services/haptics";

/** §9.5 states plus "open" (the onboarding ring before it seals) and "lan" (S50: LAN mode shows orange). */
export type SealState = "open" | "loading" | "sealing" | "sealed" | "generating" | "unsealed" | "lan";

interface SealProps {
  size: number;
  label: string;
  state?: SealState;
  /** Legacy shape used by Chat.tsx: generating=true breathes, otherwise sealed. */
  generating?: boolean;
  color?: string;
  glow?: string;
  /** 0..1 while loading. */
  progress?: number;
  haptics?: boolean;
  onSealed?: () => void;
  testID?: string;
}

/* Animated stamps collapsable={false} on what it animates, and react-native-svg hands that straight to the DOM on web. */
const WebCircle = forwardRef<Circle, CircleProps & { collapsable?: boolean }>(function WebCircle({ collapsable: _collapsable, ...props }, ref) {
  return <Circle ref={ref} {...props} />;
});
const WebPath = forwardRef<Path, PathProps & { collapsable?: boolean }>(function WebPath({ collapsable: _collapsable, ...props }, ref) {
  return <Path ref={ref} {...props} />;
});
const AnimatedCircle = Animated.createAnimatedComponent(Platform.OS === "web" ? WebCircle : Circle);
const AnimatedPath = Animated.createAnimatedComponent(Platform.OS === "web" ? WebPath : Path);

/** The open ring's missing share of the circumference: wider than the clasp (28° plus two round caps), so the clasp lands inside the opening it closes. */
const OPEN_FRACTION = 0.2;
const CLASP_CENTRE = (sealMark.claspFrom + sealMark.claspTo) / 2;
const rad = (deg: number) => (deg * Math.PI) / 180;
const arc = (cx: number, r: number, from: number, to: number) =>
  `M ${cx + r * Math.cos(rad(from))} ${cx + r * Math.sin(rad(from))} A ${r} ${r} 0 0 1 ${cx + r * Math.cos(rad(to))} ${cx + r * Math.sin(rad(to))}`;

/** The seal ring: the app icon drawn live (sealMark), the only "AI is working" indicator and the only privacy state object in the app. */
export function Seal({ size, label, state, generating = false, color, glow, progress = 0, haptics = true, onSealed, testID = "seal" }: SealProps) {
  const { theme } = useTheme();
  const resolved: SealState = state ?? (generating ? "generating" : "sealed");
  const stroke = Math.max(2, Math.round(size * sealMark.stroke * 2) / 2);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const cx = size / 2;
  const openGap = c * OPEN_FRACTION;
  const highlightStroke = stroke * sealMark.highlightStroke;
  /* Under two device pixels the highlight is a blur, so the clasp stays a plain amber arc (28 px on a 1× screen). */
  const highlightVisible = highlightStroke * PixelRatio.get() >= 2;
  const glowR = r * sealMark.glowRadius;
  const claspX = cx + r * Math.cos(rad(CLASP_CENTRE));
  const claspY = cx + r * Math.sin(rad(CLASP_CENTRE));
  /* The glow reaches past the ring, as on the icon; the canvas bleeds that far while the laid-out box stays `size`. */
  const pad = Math.ceil(Math.max(0, glowR - stroke / 2));
  const canvas = size + 2 * pad;
  const brand = resolved === "open" || resolved === "sealing" || resolved === "sealed" || resolved === "generating";
  /* Per-instance gradient ids: on web `url(#id)` takes the first id in the document, and a hidden stacked screen's defs paint nothing. */
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const filament = `filament-${uid}`;
  const bloomId = `bloom-${uid}`;
  const claspGlow = `claspGlow-${uid}`;

  const [reduceMotion, setReduceMotion] = useState(false);
  const breath = useRef(new Animated.Value(1)).current;
  const gap = useRef(new Animated.Value(resolved === "open" || resolved === "sealing" ? openGap : 0)).current;
  const bloom = useRef(new Animated.Value(0)).current;
  const clasp = useRef(new Animated.Value(resolved === "sealed" || resolved === "generating" ? 1 : 0)).current;
  const sealedOnce = useRef(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => setReduceMotion(!!v))
      .catch(() => undefined);
  }, []);

  // Breathing only while generating (0.6 → 1.0, 1.6 s); static ring under reduced motion.
  useEffect(() => {
    if (resolved !== "generating" || reduceMotion) {
      breath.setValue(1);
      return;
    }
    const useNativeDriver = Platform.OS !== "web";
    const half = motion.breathe / 2;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, { toValue: 0.6, duration: half, easing: Easing.inOut(Easing.ease), useNativeDriver }),
        Animated.timing(breath, { toValue: 1, duration: half, easing: Easing.inOut(Easing.ease), useNativeDriver }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
      breath.setValue(1);
    };
  }, [resolved, reduceMotion, breath]);

  // SEALING: the last gap snaps shut (420 ms spring), one rigid haptic, the clasp sets under a green bloom for 600 ms, then nothing.
  useEffect(() => {
    if (resolved === "open") {
      sealedOnce.current = false;
      gap.setValue(openGap);
      clasp.setValue(0);
      return;
    }
    if (resolved === "sealed" || resolved === "generating") {
      gap.setValue(0);
      clasp.setValue(1);
      return;
    }
    if (resolved !== "sealing" || sealedOnce.current) return;
    sealedOnce.current = true;
    void haptic("seal", haptics);
    const finish = () => {
      onSealed?.();
    };
    if (reduceMotion) {
      gap.setValue(0);
      clasp.setValue(1);
      finish();
      return;
    }
    Animated.spring(gap, { toValue: 0, speed: 14, bounciness: 6, useNativeDriver: false }).start(() => {
      Animated.parallel([
        Animated.timing(clasp, { toValue: 1, duration: 120, useNativeDriver: false }),
        Animated.sequence([
          Animated.timing(bloom, { toValue: 1, duration: 120, useNativeDriver: false }),
          Animated.timing(bloom, { toValue: 0, duration: motion.bloom, easing: Easing.out(Easing.ease), useNativeDriver: false }),
        ]),
      ]).start();
      finish();
    });
  }, [resolved, reduceMotion, gap, bloom, clasp, openGap, haptics, onSealed]);

  useEffect(() => {
    if (resolved === "unsealed") void haptic("warning", haptics);
  }, [resolved, haptics]);

  const ringColor =
    color ??
    (resolved === "unsealed" ? theme.danger : resolved === "lan" ? theme.accent : resolved === "loading" ? theme.text3 : theme.sealed);
  const glowColor = glow ?? glowTokens.filament;
  const glowing = resolved === "generating" && !reduceMotion;
  /* The dash starts just past the opening, so the gap sits where the clasp will be and closes clockwise into it. */
  const rotation = CLASP_CENTRE + OPEN_FRACTION * 180;
  const claspArc = arc(cx, r, sealMark.claspFrom, sealMark.claspTo);

  return (
    <View testID={testID} accessibilityLabel={label} accessibilityRole="image" style={{ width: size, height: size }}>
      <Animated.View style={{ width: size, height: size, opacity: breath }}>
        <Svg width={canvas} height={canvas} viewBox={`${-pad} ${-pad} ${canvas} ${canvas}`} style={{ position: "absolute", left: -pad, top: -pad }}>
          <Defs>
            {/* §9.2 puts the filament behind the seal, not inside it: a fill from the centre read as a brown disc (QA F251). */}
            <RadialGradient id={filament} cx="50%" cy="50%" r="50%">
              <Stop offset="55%" stopColor={glowColor} stopOpacity={0} />
              <Stop offset="86%" stopColor={glowColor} stopOpacity={0.45} />
              <Stop offset="100%" stopColor={glowColor} stopOpacity={0} />
            </RadialGradient>
            <RadialGradient id={bloomId} cx="50%" cy="50%" r="50%">
              <Stop offset="60%" stopColor={glowTokens.sealed} stopOpacity={0.25} />
              <Stop offset="100%" stopColor={glowTokens.sealed} stopOpacity={0} />
            </RadialGradient>
            <RadialGradient id={claspGlow} cx="50%" cy="50%" r="50%">
              {sealMark.glowStops.map(([offset, opacity]) => (
                <Stop key={offset} offset={`${offset * 100}%`} stopColor={sealMark.clasp} stopOpacity={opacity} />
              ))}
            </RadialGradient>
          </Defs>
          {glowing ? <Circle cx={cx} cy={cx} r={cx} fill={`url(#${filament})`} /> : null}
          <AnimatedCircle cx={cx} cy={cx} r={cx} fill={`url(#${bloomId})`} opacity={bloom} />
          {resolved === "loading" ? (
            <>
              <Circle cx={cx} cy={cx} r={r} stroke={theme.text3} strokeWidth={stroke} strokeDasharray={`${stroke} ${stroke * 2}`} fill="none" strokeLinecap="round" />
              <Circle
                cx={cx}
                cy={cx}
                r={r}
                stroke={theme.accent}
                strokeWidth={stroke}
                strokeDasharray={`${c} ${c}`}
                strokeDashoffset={c * (1 - Math.min(1, Math.max(0, progress)))}
                fill="none"
                strokeLinecap="round"
                transform={`rotate(-90 ${cx} ${cx})`}
              />
            </>
          ) : resolved === "unsealed" ? (
            <>
              <Circle cx={cx} cy={cx} r={r} stroke={ringColor} strokeWidth={stroke} strokeDasharray={`${c * 0.92} ${c}`} fill="none" transform={`rotate(-70 ${cx} ${cx})`} />
              <Path
                d={`M ${cx + r * 0.94} ${cx - r * 0.36} l ${-stroke * 1.2} ${stroke * 1.1} l ${stroke * 1.4} ${stroke * 1.0} l ${-stroke * 1.2} ${stroke * 1.1}`}
                stroke={ringColor}
                strokeWidth={Math.max(1.5, stroke / 2)}
                fill="none"
                strokeLinecap="round"
              />
            </>
          ) : (
            <>
              {brand ? <AnimatedCircle cx={claspX} cy={claspY} r={glowR} fill={`url(#${claspGlow})`} opacity={clasp} /> : null}
              <AnimatedCircle
                cx={cx}
                cy={cx}
                r={r}
                stroke={ringColor}
                strokeWidth={stroke}
                strokeDasharray={`${c} ${c}`}
                strokeDashoffset={gap}
                fill="none"
                strokeLinecap="round"
                transform={`rotate(${rotation} ${cx} ${cx})`}
              />
              {brand ? <AnimatedPath d={claspArc} stroke={sealMark.clasp} strokeWidth={stroke} strokeLinecap="round" fill="none" opacity={clasp} /> : null}
              {brand && highlightVisible ? <AnimatedPath d={claspArc} stroke={sealMark.highlight} strokeWidth={highlightStroke} strokeLinecap="round" fill="none" opacity={clasp} /> : null}
            </>
          )}
        </Svg>
      </Animated.View>
    </View>
  );
}
