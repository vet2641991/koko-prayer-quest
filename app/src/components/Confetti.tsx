// The PWA's confetti (app.js confetti()): 140 bits in five colours burst from a third of the way down the screen and
// fall for 120 frames (2 s). Each bit follows the same physics as the canvas version; its path is sampled every
// 10 frames and drawn on the native thread. Skipped when the phone asks for reduced motion.
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, useWindowDimensions, View } from 'react-native';

const COLS = ['#FFC629', '#1E6BFF', '#22C55E', '#FF5A5F', '#ffffff'];
const FRAMES = 120, EVERY = 10;
const input = Array.from({ length: FRAMES / EVERY + 1 }, (_, i) => i / (FRAMES / EVERY));

type Bit = { s: number; c: string; x: number[]; y: number[]; r: string[] };

function makeBits(): Bit[] {
  return Array.from({ length: 140 }, (_, i) => {
    let x = 0, y = 0, vx = (Math.random() - 0.5) * 14, vy = Math.random() * -12 - 4, r = Math.random() * 6;
    const b: Bit = { s: 6 + Math.random() * 7, c: COLS[i % 5]!, x: [x], y: [y], r: [`${r}rad`] };
    for (let f = 1; f <= FRAMES; f++) {
      vy += 0.35; x += vx; y += vy; r += 0.2;
      if (f % EVERY === 0) { b.x.push(x); b.y.push(y); b.r.push(`${r}rad`); }
    }
    return b;
  });
}

let fire: (() => void) | null = null;
/** Starts a burst over whatever screen is showing (the reward screen, or the map after a review). */
export function confetti() { fire?.(); }

export function ConfettiLayer() {
  const { width, height } = useWindowDimensions();
  const [bits, setBits] = useState<Bit[] | null>(null);
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    fire = () => {
      AccessibilityInfo.isReduceMotionEnabled().catch(() => false).then(reduce => {
        if (reduce) return;
        t.stopAnimation(); t.setValue(0); setBits(makeBits());
        Animated.timing(t, { toValue: 1, duration: FRAMES * 1000 / 60, easing: Easing.linear, useNativeDriver: true })
          .start(() => setBits(null));
      });
    };
    return () => { fire = null; };
  }, []);
  if (!bits) return null;
  return <View pointerEvents="none" style={StyleSheet.absoluteFill} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    {bits.map((b, i) => <Animated.View key={i} style={{
      position: 'absolute', left: width / 2 - b.s / 2, top: height / 3 - b.s / 4, width: b.s, height: b.s / 2, backgroundColor: b.c,
      transform: [
        { translateX: t.interpolate({ inputRange: input, outputRange: b.x }) },
        { translateY: t.interpolate({ inputRange: input, outputRange: b.y }) },
        { rotate: t.interpolate({ inputRange: input, outputRange: b.r }) },
      ],
    }} />)}
  </View>;
}
