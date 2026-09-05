import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Platform } from "react-native";

interface SealProps {
  size: number;
  color: string;
  glow: string;
  generating: boolean;
  label: string;
}

/** The seal ring (spec §9.5): the only "AI is working" indicator. Breathes while generating; static under reduced motion. */
export function Seal({ size, color, glow, generating, label }: SealProps) {
  const opacity = useRef(new Animated.Value(1)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => setReduceMotion(!!v))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!generating || reduceMotion) {
      opacity.setValue(1);
      return;
    }
    const useNativeDriver = Platform.OS !== "web";
    const breathe = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.6, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver }),
        Animated.timing(opacity, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver }),
      ]),
    );
    breathe.start();
    return () => {
      breathe.stop();
      opacity.setValue(1);
    };
  }, [generating, reduceMotion, opacity]);

  const glowing = generating && !reduceMotion;
  return (
    <Animated.View
      testID="seal"
      accessibilityLabel={label}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: Math.max(2, Math.round(size / 14)),
        borderColor: color,
        opacity,
        ...(glowing ? { shadowColor: glow, shadowOpacity: 0.35, shadowRadius: size / 3, shadowOffset: { width: 0, height: 0 } } : {}),
      }}
    />
  );
}
