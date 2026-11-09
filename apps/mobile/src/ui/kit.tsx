/**
 * Econary 컴포넌트 세트 — Claude Design '컴포넌트' 보드를 RN 으로 옮긴 것.
 * 모든 화면은 이 컴포넌트와 theme 토큰만으로 그린다.
 */
import { useBottomTabBarHeight } from 'expo-router/tabs';
import { useEffect, type ReactNode } from 'react';
import {
  Pressable, ScrollView, StyleSheet, Text, View,
  type AccessibilityRole, type AccessibilityState, type StyleProp, type TextProps, type TextStyle, type ViewStyle,
} from 'react-native';
import Animated, {
  Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSpring, withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ctaShadow, fontFamily, radius, size, spring, type, useTheme, type Palette, type TypeName } from '../theme';
import { Icon, type IconName } from './Icon';

const HAIRLINE = 0.5;

// ───────── 글자 ─────────

export function Txt({
  variant = 'body', color, weight, style, children, ...rest
}: TextProps & { variant?: TypeName; color?: string; weight?: TextStyle['fontWeight'] }) {
  const { c } = useTheme();
  return (
    <Text
      {...rest}
      style={[type[variant], { fontFamily, color: color ?? c.text }, weight ? { fontWeight: weight } : null, style]}
    >
      {children}
    </Text>
  );
}

// ───────── 누르기 (모션: scale 0.97 + opacity 0.92, spring.press · Reduce Motion 이면 opacity 만) ─────────

export function Pressy({
  onPress, disabled, style, children, accessibilityLabel, accessibilityRole = 'button', accessibilityState, hitSlop,
}: {
  onPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
  accessibilityLabel?: string;
  accessibilityRole?: AccessibilityRole;
  accessibilityState?: AccessibilityState;
  hitSlop?: number;
}) {
  const reduce = useReducedMotion();
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }], opacity: opacity.value }));
  const to = (pressed: boolean) => {
    opacity.set(withSpring(pressed ? 0.92 : 1, spring.press));
    if (!reduce) scale.set(withSpring(pressed ? 0.97 : 1, spring.press));
  };
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      onPressIn={() => to(true)}
      onPressOut={() => to(false)}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled, ...accessibilityState }}
      hitSlop={hitSlop}
    >
      <Animated.View style={[style, anim]}>{children}</Animated.View>
    </Pressable>
  );
}

// ───────── 등장 (결과 카드·배너: translateY 12→0 + opacity, spring.reveal · Reduce Motion 이면 페이드 200ms) ─────────

export function Reveal({ children, delay = 0, style }: { children: ReactNode; delay?: number; style?: StyleProp<ViewStyle> }) {
  const reduce = useReducedMotion();
  const y = useSharedValue(reduce ? 0 : 12);
  const o = useSharedValue(0);
  useEffect(() => {
    o.value = withDelay(delay, reduce ? withTiming(1, { duration: 200 }) : withSpring(1, spring.reveal));
    if (!reduce) y.value = withDelay(delay, withSpring(0, spring.reveal));
  }, [delay, reduce, o, y]);
  const anim = useAnimatedStyle(() => ({ opacity: o.value, transform: [{ translateY: y.value }] }));
  return <Animated.View style={[style, anim]}>{children}</Animated.View>;
}

export function Spinner({ color, size: s = 18 }: { color: string; size?: number }) {
  const r = useSharedValue(0);
  useEffect(() => {
    r.value = withRepeat(withTiming(360, { duration: 800, easing: Easing.linear }), -1);
  }, [r]);
  const anim = useAnimatedStyle(() => ({ transform: [{ rotate: `${r.value}deg` }] }));
  return <Animated.View style={anim}><Icon name="spinner" size={s} color={color} /></Animated.View>;
}

// ───────── 화면 틀 ─────────

/** 탭 화면: 상태바 아래부터, 탭 바 높이만큼 아래 여백 */
export function TabScreen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const tabBar = useBottomTabBarHeight();
  const pad = { paddingTop: insets.top + 12, paddingBottom: tabBar + 16 };
  if (!scroll) return <View style={[s.screen, pad, { backgroundColor: c.bg, flex: 1 }]}>{children}</View>;
  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={[s.screen, pad, { flexGrow: 1 }]}>
      {children}
    </ScrollView>
  );
}

/** 스택에 쌓이는 화면 (네이티브 헤더 아래): 본문 스크롤 + 아래 고정 버튼 영역 */
export function PushScreen({ children, footer, gap = 12 }: { children: ReactNode; footer?: ReactNode; gap?: number }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={[s.screen, { gap, paddingTop: 12, flexGrow: 1 }]}>{children}</ScrollView>
      {footer ? <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: Math.max(insets.bottom, 12) + 8 }}>{footer}</View> : null}
    </View>
  );
}

/** 큰 제목 + 옆 숫자 (예: 오늘의 단어 2/10) */
export function LargeTitle({ children, count }: { children: string; count?: string }) {
  const { c } = useTheme();
  return (
    <Txt variant="largeTitle" accessibilityRole="header">
      {children}
      {count ? <Txt variant="largeTitle" color={c.text2} weight="600">{` ${count}`}</Txt> : null}
    </Txt>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  const { c } = useTheme();
  return <Txt variant="footnote" color={c.text2} style={{ paddingTop: 12, paddingHorizontal: 4 }}>{children}</Txt>;
}

// ───────── 카드 · 묶음 리스트 ─────────

export function Card({ children, style, onSheet }: { children: ReactNode; style?: StyleProp<ViewStyle>; onSheet?: boolean }) {
  const { c } = useTheme();
  return <View style={[s.card, { backgroundColor: onSheet ? c.sheetSurface : c.surface }, style]}>{children}</View>;
}

export function Group({ children, onSheet }: { children: ReactNode; onSheet?: boolean }) {
  const { c } = useTheme();
  return <View style={{ backgroundColor: onSheet ? c.sheetSurface : c.surface, borderRadius: radius.lg, overflow: 'hidden' }}>{children}</View>;
}

/** 리스트 행 (min 48). onPress 가 있으면 누를 수 있다. last 면 구분선 없음 */
export function Row({
  children, onPress, last, minHeight = size.row, accessibilityLabel, accessibilityRole, accessibilityState, separatorColor,
}: {
  children: ReactNode; onPress?: () => void; last?: boolean; minHeight?: number;
  accessibilityLabel?: string; accessibilityRole?: AccessibilityRole; accessibilityState?: AccessibilityState; separatorColor?: string;
}) {
  const { c } = useTheme();
  const style: ViewStyle = {
    minHeight, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12,
    borderBottomWidth: last ? 0 : HAIRLINE, borderBottomColor: separatorColor ?? c.separator,
  };
  if (!onPress) return <View style={style} accessible={!!accessibilityLabel} accessibilityLabel={accessibilityLabel}>{children}</View>;
  return (
    <Pressy onPress={onPress} style={style} accessibilityLabel={accessibilityLabel} accessibilityRole={accessibilityRole} accessibilityState={accessibilityState}>
      {children}
    </Pressy>
  );
}

export type BadgeTone = 'success' | 'warning' | 'neutral';
export function Badge({ label, tone }: { label: string; tone: BadgeTone }) {
  const { c } = useTheme();
  const [fg, bg] = tone === 'success' ? [c.success, c.successBg] : tone === 'warning' ? [c.warning, c.warningBg] : [c.badgeNeutralText, c.badgeNeutral];
  return (
    <View style={{ backgroundColor: bg, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 3 }}>
      <Txt variant="footnote" color={fg} style={{ fontVariant: ['tabular-nums'] }}>{label}</Txt>
    </View>
  );
}

// ───────── 버튼 ─────────

export type ButtonKind = 'primary' | 'tint' | 'surface';
export function Button({
  label, onPress, kind = 'primary', disabled, loading, color, height = size.button, accessibilityLabel,
}: {
  label: string; onPress: () => void; kind?: ButtonKind; disabled?: boolean; loading?: boolean;
  /** 글자색 덮어쓰기 (예: 로그아웃 = danger) */
  color?: string; height?: number; accessibilityLabel?: string;
}) {
  const { c } = useTheme();
  const off = disabled || loading;
  const bg = off ? c.disabledBg : kind === 'primary' ? c.accentFill : kind === 'tint' ? c.tint : c.surface;
  const fg = loading ? c.text2 : off ? c.textDisabled : color ?? (kind === 'primary' ? c.onAccent : kind === 'tint' ? c.onTint : c.text);
  return (
    <Pressy
      onPress={onPress}
      disabled={off}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ busy: loading }}
      style={{ height, borderRadius: radius.lg, backgroundColor: bg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 24 }}
    >
      {loading ? <Spinner color={fg} /> : null}
      <Txt variant="headline" color={fg} style={{ fontSize: height < size.button ? 16 : 17 }}>{label}</Txt>
    </Pressy>
  );
}

/** 학습 시작 카드 (accent.fill, 큰 단어 + 화살표 원) */
export function CtaCard({ label, term, onPress }: { label: string; term: string; onPress: () => void }) {
  const { c, isDark } = useTheme();
  return (
    <Pressy
      onPress={onPress}
      accessibilityLabel={`${label}: ${term}`}
      style={[{ backgroundColor: c.accentFill, borderRadius: radius.xl, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 12 }, ctaShadow(isDark)]}
    >
      <View style={{ flex: 1, gap: 4 }}>
        <Txt variant="subhead" color={c.onAccent} weight="500" style={{ fontSize: 14, opacity: 0.92 }}>{label}</Txt>
        <Txt variant="title" color={c.onAccent}>{term}</Txt>
      </View>
      <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="arrowRight" color="#FFFFFF" size={20} />
      </View>
    </Pressy>
  );
}

// ───────── 상태 표시 ─────────

export type Tone = 'success' | 'warning' | 'danger' | 'tint' | 'fill';
const toneColors = (c: Palette, tone: Tone) =>
  ({
    success: [c.success, c.successBg],
    warning: [c.warning, c.warningBg],
    danger: [c.danger, c.dangerBg],
    tint: [c.accent, c.tint],
    fill: [c.text2, c.fill],
  })[tone];

/** 둥근 아이콘 배지 (빈 상태·완료 카드) */
export function IconBubble({ name, tone, size: d = 56 }: { name: IconName; tone: Tone; size?: number }) {
  const { c } = useTheme();
  const [fg, bg] = toneColors(c, tone);
  return (
    <View style={{ width: d, height: d, borderRadius: d / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={name} color={fg} size={Math.round(d * 0.46)} />
    </View>
  );
}

/** 화면 가운데 빈 상태 / 오류 상태 */
export function EmptyState({
  icon, tone, title, body, action,
}: { icon: IconName; tone: Tone; title: string; body?: string; action?: { label: string; onPress: () => void; kind?: ButtonKind } }) {
  const { c } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 24, paddingBottom: 80 }}>
      <IconBubble name={icon} tone={tone} />
      <Txt variant="headline" style={{ textAlign: 'center' }}>{title}</Txt>
      {body ? <Txt variant="subhead" color={c.text2} style={{ textAlign: 'center' }}>{body}</Txt> : null}
      {action ? (
        <View style={{ marginTop: 8 }}>
          <Button label={action.label} onPress={action.onPress} kind={action.kind ?? 'tint'} height={48} />
        </View>
      ) : null}
    </View>
  );
}

/** 완료 카드 (아이콘 + 제목 + 설명) */
export function DoneCard({ title, body }: { title: string; body?: string }) {
  const { c } = useTheme();
  return (
    <Card style={{ flexDirection: 'row', alignItems: body ? 'flex-start' : 'center', gap: 14 }}>
      <IconBubble name="check" tone="success" size={36} />
      <View style={{ flex: 1, gap: 4 }}>
        <Txt variant="headline">{title}</Txt>
        {body ? <Txt variant="subhead" color={c.text2}>{body}</Txt> : null}
      </View>
    </Card>
  );
}

/** 배너 (경고·오류·성공). 나타날 때 spring.reveal */
export function Banner({
  tone, title, body, children, live = 'polite',
}: { tone: 'success' | 'warning' | 'danger'; title: string; body?: string; children?: ReactNode; live?: 'polite' | 'assertive' }) {
  const { c } = useTheme();
  const [fg, bg] = toneColors(c, tone);
  const icon: IconName = tone === 'success' ? 'check' : tone === 'warning' ? 'warning' : 'alertCircle';
  return (
    <Reveal>
      <View
        accessibilityRole={tone === 'success' ? undefined : 'alert'}
        accessibilityLiveRegion={live}
        style={{ backgroundColor: bg, borderRadius: radius.lg, paddingVertical: 14, paddingHorizontal: 16, gap: 10 }}
      >
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
          <View style={{ paddingTop: 1 }}><Icon name={icon} color={fg} size={20} /></View>
          <View style={{ flex: 1, gap: 4 }}>
            <Txt variant="subhead" color={fg} weight="700">{title}</Txt>
            {body ? <Txt variant="subhead" color={c.text} style={{ fontSize: 14 }}>{body}</Txt> : null}
          </View>
        </View>
        {children}
      </View>
    </Reveal>
  );
}

/** 작은 인라인 오류 줄 (시트 안 저장 실패 등) */
export function InlineError({ children }: { children: string }) {
  const { c } = useTheme();
  return (
    <View accessibilityRole="alert" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 }}>
      <Icon name="alertCircle" color={c.danger} size={16} />
      <Txt variant="subhead" color={c.danger} style={{ fontSize: 14, flex: 1 }}>{children}</Txt>
    </View>
  );
}

export function Skeleton({ width, height, r = 4 }: { width: number | `${number}%`; height: number; r?: number }) {
  const { c } = useTheme();
  return <View style={{ width, height, borderRadius: r, backgroundColor: c.fill }} />;
}

/** 오른쪽 아래 작은 텍스트 링크 (오류 신고 등) */
export function SmallLink({ label, onPress }: { label: string; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressy onPress={onPress} accessibilityLabel={label} style={{ minHeight: size.touch, justifyContent: 'center', paddingHorizontal: 2 }}>
      <Txt variant="footnote" color={c.text2} weight="400">{label}</Txt>
    </Pressy>
  );
}

const s = StyleSheet.create({
  screen: { paddingHorizontal: 16, gap: 12 },
  card: { borderRadius: radius.xl, padding: 18, gap: 8 },
});
