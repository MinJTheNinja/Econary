/**
 * 임시 UI 기본 요소. 실제 디자인은 Claude Design 결과물로 교체한다 (Phase 8).
 * 화면 로직이 디자인과 분리되도록 화면들은 이 컴포넌트만 쓴다.
 */
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, type ViewStyle } from 'react-native';

export const colors = {
  bg: '#f7f7f8',
  card: '#ffffff',
  text: '#1c1c1e',
  muted: '#6b6b70',
  line: '#e4e4e7',
  accent: '#2f6fde',
  ok: '#1f8a4c',
  bad: '#c4302b',
  warn: '#b26b00',
};

export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  if (!scroll) return <View style={s.screen}>{children}</View>;
  return <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={s.screen}>{children}</ScrollView>;
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function Title({ children }: { children: ReactNode }) {
  return <Text style={s.title}>{children}</Text>;
}

export function Body({ children, muted, style }: { children: ReactNode; muted?: boolean; style?: object }) {
  return <Text style={[s.body, muted && { color: colors.muted }, style]}>{children}</Text>;
}

export function Button({
  label, onPress, kind = 'primary', disabled,
}: { label: string; onPress: () => void; kind?: 'primary' | 'secondary'; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        s.button,
        kind === 'primary' ? { backgroundColor: colors.accent } : { backgroundColor: colors.card, borderColor: colors.line, borderWidth: 1 },
        (pressed || disabled) && { opacity: 0.6 },
      ]}
    >
      <Text style={[s.buttonText, { color: kind === 'primary' ? '#fff' : colors.text }]}>{label}</Text>
    </Pressable>
  );
}

export function Loading() {
  return <View style={s.center}><ActivityIndicator /></View>;
}

export function ErrorView({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={s.center}>
      <Body style={{ color: colors.bad, textAlign: 'center' }}>{message}</Body>
      {onRetry && <View style={{ marginTop: 12 }}><Button label="다시 시도" onPress={onRetry} /></View>}
    </View>
  );
}

const s = StyleSheet.create({
  screen: { padding: 20, gap: 12, backgroundColor: colors.bg, flexGrow: 1 },
  card: { backgroundColor: colors.card, borderRadius: 14, padding: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line, gap: 6 },
  title: { fontSize: 24, fontWeight: '700', color: colors.text, letterSpacing: -0.3 },
  body: { fontSize: 16, lineHeight: 24, color: colors.text },
  button: { paddingVertical: 14, paddingHorizontal: 18, borderRadius: 12, alignItems: 'center' },
  buttonText: { fontSize: 16, fontWeight: '600' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.bg },
});
