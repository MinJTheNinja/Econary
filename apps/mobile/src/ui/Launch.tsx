import { useEffect, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing, interpolate, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming, type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { Button, Txt } from './kit';

/** 흩어진 자모: 화면 가운데 기준 시작 위치(390×844 기준)·회전 → 모일 글자 안의 위치 */
type Jamo = { ch: string; tone: 'accent' | 'text'; from: [number, number, number]; to: [number, number] };
const SIZE = 66; // 완성 글자 크기
const STEP = 62; // 글자 간격 (한 줄 네 글자: 이 코 너 리)
const X = [-1.5, -0.5, 0.5, 1.5].map((k) => k * STEP);
const JAMO: Jamo[] = [
  // 이 (Eco → accent)
  { ch: 'ㅇ', tone: 'accent', from: [-128, -237, -18], to: [X[0] - 10, 0] },
  { ch: 'ㅣ', tone: 'accent', from: [124, -188, 20], to: [X[0] + 16, 0] },
  // 코
  { ch: 'ㅋ', tone: 'accent', from: [-103, 200, -12], to: [X[1], -12] },
  { ch: 'ㅗ', tone: 'accent', from: [146, 114, -8], to: [X[1], 14] },
  // 너 (nary → text)
  { ch: 'ㄴ', tone: 'text', from: [-139, 19, -40], to: [X[2] - 10, 0] },
  { ch: 'ㅓ', tone: 'text', from: [72, 255, 35], to: [X[2] + 14, 0] },
  // 리
  { ch: 'ㄹ', tone: 'text', from: [-14, -270, 14], to: [X[3] - 10, 0] },
  { ch: 'ㅣ', tone: 'text', from: [-35, 319, 24], to: [X[3] + 16, 0] },
];

/**
 * 앱 실행 화면 (시안 '안1'): 흩어진 자모가 0.8초 동안 모여 '이코너리'(Econary)가 된다.
 * 익명 로그인·온보딩 확인이 끝날 때까지 보이고, 실패하면 다시 시도. Reduce Motion 이면 완성된 글자만.
 */
export function Launch({ error, onRetry, ready }: { error?: string | null; onRetry?: () => void; /** 오늘의 단어를 다 불러옴 → '준비했어요' */ ready?: boolean }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const reduce = useReducedMotion();
  const p = useSharedValue(reduce ? 1 : 0);
  useEffect(() => {
    if (!reduce) p.set(withDelay(250, withTiming(1, { duration: 800, easing: Easing.out(Easing.cubic) })));
  }, [reduce, p]);

  const scatter = Math.min(1, (height - 200) / 700); // 작은 화면에서는 덜 흩어 둔다
  const wordStyle = useAnimatedStyle(() => ({
    opacity: interpolate(p.value, [0.7, 1], [0, 1], 'clamp'),
    transform: [{ scale: interpolate(p.value, [0.7, 1], [0.94, 1], 'clamp') }],
  }));

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', paddingHorizontal: 32, paddingBottom: insets.bottom + 48 }}>
      <View
        style={{ flex: 1, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' }}
        accessible
        accessibilityRole="image"
        accessibilityLabel="이코너리"
      >
        {JAMO.map((j, i) => (
          <JamoPiece key={i} j={j} i={i} p={p} scatter={scatter} color={j.tone === 'accent' ? c.accent : c.text} />
        ))}
        <Animated.View style={[{ flexDirection: 'row' }, wordStyle]}>
          {['이', '코', '너', '리'].map((s, i) => (
            <Txt key={s} variant="display" color={i < 2 ? c.accent : c.text} style={{ width: STEP, textAlign: 'center', fontSize: SIZE, lineHeight: SIZE + 10 }}>
              {s}
            </Txt>
          ))}
        </Animated.View>
        {error ? (
          <View accessibilityRole="alert" style={{ position: 'absolute', bottom: 24, left: 0, right: 0, alignItems: 'center', gap: 8 }}>
            <Txt variant="headline">로그인하지 못했습니다.</Txt>
            <Txt variant="subhead" color={c.text2} style={{ textAlign: 'center' }}>{error}</Txt>
          </View>
        ) : null}
      </View>
      {error ? (
        <View style={{ alignSelf: 'stretch' }}><Button label="다시 시도" onPress={() => onRetry?.()} /></View>
      ) : (
        <Loading ready={!!ready} />
      )}
    </View>
  );
}

function JamoPiece({ j, i, p, scatter, color }: { j: Jamo; i: number; p: SharedValue<number>; scatter: number; color: string }) {
  const [fx, fy, fr] = j.from;
  const [tx, ty] = j.to;
  // 조각마다 조금씩 늦게 출발해 '모이는' 느낌
  const start = (i % 4) * 0.04;
  const style = useAnimatedStyle(() => {
    const t = interpolate(p.value, [start, 0.85], [0, 1], 'clamp');
    return {
      opacity: interpolate(p.value, [0, 0.1, 0.75, 0.95], [0.55, 0.85, 0.85, 0], 'clamp'),
      transform: [
        { translateX: fx * scatter + (tx - fx * scatter) * t },
        { translateY: fy * scatter + (ty - fy * scatter) * t },
        { rotate: `${fr * (1 - t)}deg` },
        { scale: 0.8 + 0.25 * t },
      ],
    };
  });
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', width: 60, height: 60, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Txt variant="display" color={color} style={{ fontSize: 40, lineHeight: 48 }}>{j.ch}</Txt>
    </Animated.View>
  );
}

/** '오늘의 단어를 모으는 중…' + 차례로 채워지는 점 세 개. 다 불러오면 '준비했어요' + 점 셋 모두 */
function Loading({ ready }: { ready: boolean }) {
  const { c } = useTheme();
  const [step, setStep] = useState(1);
  useEffect(() => {
    if (ready) return;
    const t = setInterval(() => setStep((k) => (k % 3) + 1), 450);
    return () => clearInterval(t);
  }, [ready]);
  const n = ready ? 3 : step;
  const label = ready ? '오늘의 단어를 준비했어요' : '오늘의 단어를 모으는 중…';
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={label} style={{ alignItems: 'center', gap: 10 }}>
      <Txt variant="footnote" weight="400" color={c.text2}>{label}</Txt>
      <View style={{ flexDirection: 'row', gap: 5 }}>
        {[1, 2, 3].map((k) => (
          <View key={k} style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: k <= n ? c.accent : c.separator }} />
        ))}
      </View>
    </View>
  );
}
