// Building blocks shared by every screen.
import type { ReactNode } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F } from '../theme';

export const IMG = {
  wave: require('../../assets/koko-wave.png'),
  cheer: require('../../assets/koko-cheer.png'),
  pray: require('../../assets/koko-pray.png'),
  logo: require('../../assets/dhm-logo.png'),
};

/** Arabic text: right to left, Naskh, shown exactly as written (tashkeel included). */
export function Ar({ children, size = 26, style, color }: { children: string | undefined; size?: number; style?: StyleProp<TextStyle>; color?: string }) {
  if (!children) return null;
  return <Text accessibilityLanguage="ar" style={[s.ar, { fontSize: size, lineHeight: size * 1.75, color: color ?? C.ink }, style]}>{children}</Text>;
}

export function T({ children, style, size = 17, weight = 'bold', color, center }: {
  children: ReactNode; style?: StyleProp<TextStyle>; size?: number; weight?: 'medium' | 'bold' | 'heavy'; color?: string; center?: boolean;
}) {
  const fontFamily = weight === 'medium' ? F.enMedium : weight === 'heavy' ? F.enHeavy : F.en;
  return <Text style={[{ fontFamily, fontSize: size, color: color ?? C.ink, textAlign: center ? 'center' : undefined, lineHeight: size * 1.35 }, style]}>{children}</Text>;
}

export function Btn({ label, onPress, kind = 'yellow', disabled, style, accessibilityLabel }: {
  label: ReactNode; onPress: () => void; kind?: 'yellow' | 'blue' | 'soft' | 'ghost'; disabled?: boolean; style?: StyleProp<ViewStyle>; accessibilityLabel?: string;
}) {
  const bg = { yellow: C.yellow, blue: C.blueMid, soft: '#E8EEFC', ghost: 'transparent' }[kind];
  const fg = kind === 'blue' ? C.white : kind === 'ghost' ? C.white : C.ink;
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [s.btn, { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1, borderWidth: kind === 'ghost' ? 2 : 0 }, style]}>
    {typeof label === 'string' ? <T size={19} weight="heavy" color={fg} center>{label}</T> : label}
  </Pressable>;
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function KokoSays({ text, mood = 'wave', tone }: { text: string; mood?: 'wave' | 'cheer'; tone?: 'good' | 'bad' }) {
  return <View style={[s.koko, tone === 'good' && { backgroundColor: C.greenSoft }, tone === 'bad' && { backgroundColor: C.redSoft }]}>
    <Image source={mood === 'cheer' ? IMG.cheer : IMG.wave} style={s.kokoImg} accessibilityIgnoresInvertColors />
    <T size={16} style={{ flex: 1 }}>{text}</T>
  </View>;
}

export function Bar({ pct, onBlue }: { pct: number; onBlue?: boolean }) {
  return <View style={[s.bar, onBlue && { backgroundColor: 'rgba(255,255,255,.25)' }]}>
    <View style={[s.barFill, { width: `${Math.max(0, Math.min(100, Math.round(pct)))}%` }]} /></View>;
}

export function Stars({ n, size = 18 }: { n: number; size?: number }) {
  return <View accessible accessibilityRole="image" accessibilityLabel={`${n} of 3 stars`}>
    <T size={size} color={C.yellow}>{'★'.repeat(n)}<T size={size} color="rgba(255,255,255,.35)">{'★'.repeat(Math.max(0, 3 - n))}</T></T></View>;
}

/** A screen: safe-area padding, the blue (or light) background, scrollable. */
export function Screen({ children, light, scroll = true, footer }: { children: ReactNode; light?: boolean; scroll?: boolean; footer?: ReactNode }) {
  const insets = useSafeAreaInsets();
  const bg = light ? C.blueSoft : C.blue;
  const body = <View style={[s.inner, { paddingTop: insets.top + 8 }]}>{children}</View>;
  return <View style={{ flex: 1, backgroundColor: bg }}>
    {scroll ? <ScrollView contentContainerStyle={{ paddingBottom: (footer ? 8 : insets.bottom + 24) }}>{body}</ScrollView> : body}
    {footer ? <View style={{ paddingBottom: insets.bottom }}>{footer}</View> : null}
  </View>;
}

export const s = StyleSheet.create({
  ar: { fontFamily: F.ar, writingDirection: 'rtl', textAlign: 'center' },
  btn: { borderRadius: 18, paddingVertical: 14, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', borderColor: 'rgba(255,255,255,.6)', minHeight: 56 },
  card: { backgroundColor: C.white, borderRadius: 22, padding: 16, gap: 8 },
  koko: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.white, borderRadius: 18, padding: 10 },
  kokoImg: { width: 48, height: 48, borderRadius: 24 },
  bar: { height: 10, borderRadius: 6, backgroundColor: '#E3EAFB', overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: C.yellow, borderRadius: 6 },
  inner: { paddingHorizontal: 16, gap: 12, maxWidth: 640, width: '100%', alignSelf: 'center' },
});
