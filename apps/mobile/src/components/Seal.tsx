import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Platform, View } from "react-native";
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from "react-native-svg";
import { glow as glowTokens, motion } from "@inborn/ui";
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

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const OPEN_FRACTION = 0.16;

/** The seal ring: the only "AI is working" indicator and the only privacy state object in the app. */
export function Seal({ size, label, state, generating = false, color, glow, progress = 0, haptics = true, onSealed, testID = "seal" }: SealProps) {
  const { theme } = useTheme();
  const resolved: SealState = state ?? (generating ? "generating" : "sealed");
  const stroke = Math.max(2, Math.round(size / 14));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const cx = size / 2;
  const openGap = c * OPEN_FRACTION;

  const [reduceMotion, setReduceMotion] = useState(false);
  const breath = useRef(new Animated.Value(1)).current;
  const gap = useRef(new Animated.Value(resolved === "open" || resolved === "sealing" ? openGap : 0)).current;
  const bloom = useRef(new Animated.Value(0)).current;
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

  // SEALING: the last gap snaps shut (420 ms spring), one rigid haptic, a green bloom for 600 ms, then nothing.
  useEffect(() => {
    if (resolved === "open") {
      sealedOnce.current = false;
      gap.setValue(openGap);
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
      finish();
      return;
    }
    Animated.spring(gap, { toValue: 0, speed: 14, bounciness: 6, useNativeDriver: false }).start(() => {
      Animated.sequence([
        Animated.timing(bloom, { toValue: 1, duration: 120, useNativeDriver: false }),
        Animated.timing(bloom, { toValue: 0, duration: motion.bloom, easing: Easing.out(Easing.ease), useNativeDriver: false }),
      ]).start();
      finish();
    });
  }, [resolved, reduceMotion, gap, bloom, openGap, haptics, onSealed]);

  useEffect(() => {
    if (resolved === "unsealed") void haptic("warning", haptics);
  }, [resolved, haptics]);

  const ringColor =
    color ??
    (resolved === "unsealed" ? theme.danger : resolved === "lan" ? theme.accent : resolved === "loading" ? theme.text3 : resolved === "open" ? theme.text2 : theme.sealed);
  const glowColor = glow ?? glowTokens.filament;
  const glowing = resolved === "generating" && !reduceMotion;
  const rotation = -90 - (OPEN_FRACTION * 360) / 2;

  return (
    <View testID={testID} accessibilityLabel={label} accessibilityRole="image" style={{ width: size, height: size }}>
      <Animated.View style={{ width: size, height: size, opacity: breath }}>
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <Defs>
            {/* §9.2 puts the filament behind the seal, not inside it: a fill from the centre read as a brown disc (QA F251). */}
            <RadialGradient id="filament" cx="50%" cy="50%" r="50%">
              <Stop offset="55%" stopColor={glowColor} stopOpacity={0} />
              <Stop offset="86%" stopColor={glowColor} stopOpacity={0.45} />
              <Stop offset="100%" stopColor={glowColor} stopOpacity={0} />
            </RadialGradient>
            <RadialGradient id="bloom" cx="50%" cy="50%" r="50%">
              <Stop offset="60%" stopColor={glowTokens.sealed} stopOpacity={0.25} />
              <Stop offset="100%" stopColor={glowTokens.sealed} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          {glowing ? <Circle cx={cx} cy={cx} r={cx} fill="url(#filament)" /> : null}
          <AnimatedCircle cx={cx} cy={cx} r={cx} fill="url(#bloom)" opacity={bloom} />
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
          )}
        </Svg>
      </Animated.View>
    </View>
  );
}
