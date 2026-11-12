/**
 * '최신 UI' 시안의 시각 요소: 단어 카드 덱, 동심원 장식, 주간 스트립, 진도 잔디, 정답률 링, 개념 그림, 접힘 카드.
 * 색은 theme 토큰(분야 색 포함)만 쓴다.
 */
import type { DayCell } from '@tesat/core';
import { useEffect, useState, type ReactNode } from 'react';
import { Platform, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedProps, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { onCategory, radius, spring, useTheme } from '../theme';
import { Icon } from './Icon';
import { Pressy, Txt } from './kit';

const hidden = Platform.OS === 'web' ? {} : ({ accessible: false, importantForAccessibility: 'no-hide-descendants' } as const);

// ───────── 동심원 장식 (분야 색 카드·헤더 오른쪽 위) ─────────

export function Rings({ size = 220, style }: { size?: number; style?: StyleProp<ViewStyle> }) {
  const r = size / 2;
  return (
    <View pointerEvents="none" style={[{ position: 'absolute', width: size, height: size }, style]} {...hidden}>
      <Svg width={size} height={size}>
        {[0.28, 0.5, 0.72, 0.96].map((k) => (
          <Circle key={k} cx={r} cy={r} r={r * k - 1} stroke={onCategory.rings} strokeWidth={1.5} fill="none" />
        ))}
      </Svg>
    </View>
  );
}

/** 분야 칩 (색 위: 어두운 반투명 / 일반 바탕: tint) */
export function CategoryChip({ label, onColor }: { label: string; onColor?: boolean }) {
  const { c } = useTheme();
  return (
    <View
      style={{
        alignSelf: 'flex-start', backgroundColor: onColor ? onCategory.chipDarkBg : c.tint,
        borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 3,
      }}
    >
      <Txt variant="footnote" color={onColor ? onCategory.text : c.onTint} style={{ fontSize: 12 }}>{label}</Txt>
    </View>
  );
}

// ───────── 단어 카드 덱 (오늘 탭) ─────────

export function WordDeckCard({
  color, behind, chip, term, english, action, onPress, accessibilityLabel,
}: {
  color: string;
  /** 뒤에 겹쳐 보이는 다음 카드 색 (최대 2, 가까운 순) */
  behind: string[];
  chip: string;
  term: string;
  english?: string | null;
  action?: string;
  onPress?: () => void;
  accessibilityLabel: string;
}) {
  const layers = behind.slice(0, 2);
  return (
    <View style={{ paddingTop: layers.length * 8 }}>
      {[...layers].reverse().map((bg, i) => {
        const depth = layers.length - i; // 2 = 가장 뒤 (좁고 위)
        return (
          <View
            key={depth}
            {...hidden}
            style={{
              position: 'absolute', top: (layers.length - depth) * 8, left: depth * 10, right: depth * 10, height: 60,
              borderRadius: 18, backgroundColor: bg, opacity: 1 - depth * 0.22,
            }}
          />
        );
      })}
      <Pressy
        onPress={onPress}
        disabled={!onPress}
        accessibilityLabel={accessibilityLabel}
        style={{ backgroundColor: color, borderRadius: 18, padding: 18, minHeight: 196, overflow: 'hidden', justifyContent: 'space-between' }}
      >
        <Rings size={200} style={{ top: -70, right: -60 }} />
        <View style={{ minHeight: 28, justifyContent: 'center' }}>
          <CategoryChip label={chip} onColor />
        </View>
        <View style={{ gap: 2, paddingVertical: 18 }}>
          <Txt variant="term" color={onCategory.text} numberOfLines={2}>{term}</Txt>
          {english ? <Txt variant="subhead" color={onCategory.text2} numberOfLines={1}>{english}</Txt> : null}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', minHeight: 20 }}>
          {action ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Txt variant="subhead" color={onCategory.text} weight="600" style={{ fontSize: 14 }}>{action}</Txt>
              <Icon name="arrowRight" color={onCategory.text} size={16} />
            </View>
          ) : null}
        </View>
      </Pressy>
    </View>
  );
}

// ───────── 주간 스트립 (오늘 탭) ─────────

const DOW = ['월', '화', '수', '목', '금', '토', '일'];
const statusLabel = (s: DayCell['status']) =>
  s === 'complete' ? '완료' : s === 'partial' ? '일부 학습' : s === 'future' ? '예정' : '쉼';

export function WeekStrip({ days, today, streak }: { days: DayCell[]; today: string; streak: number }) {
  const { c } = useTheme();
  return (
    <View style={{ backgroundColor: c.surface, borderRadius: radius.xl, padding: 16, gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Txt variant="subhead" weight="600" style={{ flex: 1 }}>이번 주</Txt>
        <Txt variant="footnote" weight="400" color={c.text2}>{streak}일 연속 학습</Txt>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {days.map((d, i) => {
          const isToday = d.date === today;
          const done = d.status === 'complete';
          return (
            <View
              key={d.date}
              style={{ alignItems: 'center', gap: 6 }}
              accessible
              accessibilityLabel={`${isToday ? '오늘' : `${DOW[i]}요일`}, ${statusLabel(d.status)}`}
            >
              <View
                style={{
                  width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: done ? c.accentFill : isToday ? 'transparent' : d.status === 'partial' ? c.heatPartial : c.fill,
                  borderWidth: isToday && !done ? 2 : 0, borderColor: c.accent,
                }}
              >
                {done ? <Icon name="check" color={c.onAccent} size={16} /> : null}
              </View>
              <Txt variant="caption" color={isToday ? c.accent : c.text2} weight={isToday ? '600' : '400'}>{isToday ? '오늘' : DOW[i]}</Txt>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ───────── 진도 잔디 (최근 5주) ─────────

export function Heatmap({ cells, today }: { cells: DayCell[]; today: string }) {
  const { c } = useTheme();
  const weeks: DayCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  const color = (s: DayCell['status']) =>
    s === 'complete' ? c.heatFull : s === 'partial' ? c.heatPartial : s === 'rest' ? c.heatRest : 'transparent';
  const full = cells.filter((d) => d.status === 'complete').length;
  const legend: [string, string][] = [['신규 모두 완료', c.heatFull], ['일부 학습', c.heatPartial], ['쉼', c.heatRest]];
  return (
    <View style={{ gap: 6 }} accessible accessibilityLabel={`최근 5주 중 신규 학습을 모두 마친 날 ${full}일`}>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {DOW.map((d) => <Txt key={d} variant="caption" color={c.text2} style={{ flex: 1, textAlign: 'center' }}>{d}</Txt>)}
      </View>
      {weeks.map((w) => (
        <View key={w[0].date} style={{ flexDirection: 'row', gap: 6 }}>
          {w.map((d) => (
            <View
              key={d.date}
              style={{
                flex: 1, height: 18, borderRadius: 4, backgroundColor: color(d.status),
                borderWidth: d.status === 'future' || d.date === today ? 1.5 : 0,
                borderColor: d.date === today ? c.accent : c.separator,
              }}
            />
          ))}
        </View>
      ))}
      <View style={{ flexDirection: 'row', gap: 14, paddingTop: 4 }}>
        {legend.map(([l, col]) => (
          <View key={l} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: col }} />
            <Txt variant="caption" color={c.text2}>{l}</Txt>
          </View>
        ))}
      </View>
    </View>
  );
}

// ───────── 정답률 링 (처음 그려질 때 0→값, Reduce Motion 이면 즉시) ─────────

const ACircle = Animated.createAnimatedComponent(Circle);

export function RingStat({ ratio, size = 64 }: { ratio: number | null; size?: number }) {
  const { c } = useTheme();
  const reduce = useReducedMotion();
  const stroke = 7;
  const r = (size - stroke) / 2;
  const len = 2 * Math.PI * r;
  const v = useSharedValue(reduce ? ratio ?? 0 : 0);
  useEffect(() => {
    v.value = reduce ? ratio ?? 0 : withSpring(ratio ?? 0, spring.sheet);
  }, [ratio, reduce, v]);
  const props = useAnimatedProps(() => ({ strokeDashoffset: len * (1 - v.value) }));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }} {...hidden}>
        <Svg width={size} height={size}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={c.track} strokeWidth={stroke} fill="none" />
          <ACircle
            cx={size / 2} cy={size / 2} r={r} stroke={c.success} strokeWidth={stroke} fill="none"
            strokeLinecap="round" strokeDasharray={`${len} ${len}`} animatedProps={props}
          />
        </Svg>
      </View>
      <Txt variant="subhead" weight="700" style={{ fontVariant: ['tabular-nums'] }}>
        {ratio === null ? '-' : `${Math.round(ratio * 100)}%`}
      </Txt>
    </View>
  );
}

// ───────── 개념 그림 ─────────

function Node({ label, strong }: { label: string; strong: boolean }) {
  const { c } = useTheme();
  return (
    <View
      style={{
        flex: 1, minHeight: 40, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 8,
        alignItems: 'center', justifyContent: 'center', backgroundColor: strong ? c.accentFill : c.tint,
      }}
    >
      <Txt variant="subhead" weight="600" color={strong ? c.onAccent : c.onTint} style={{ fontSize: 14, textAlign: 'center' }}>{label}</Txt>
    </View>
  );
}

function Arrow({ dir }: { dir: 'right' | 'left' | 'down' | 'up' }) {
  const { c } = useTheme();
  const deg = { right: '0deg', down: '90deg', left: '180deg', up: '270deg' }[dir];
  return <View style={{ transform: [{ rotate: deg }] }}><Icon name="arrowRight" color={c.text2} size={16} strokeWidth={2} /></View>;
}

/** 순환 4개는 2×2 고리(→ ↓ ← ↑), 그 밖은 위→아래 흐름. 학습 중인 단어와 같은 노드를 강조한다. */
export function ConceptDiagram({ nodes, kind, term }: { nodes: string[]; kind: 'cycle' | 'flow'; term: string }) {
  const { c } = useTheme();
  const strong = (n: string) => n.replace(/\s/g, '') === term.replace(/\s/g, '');
  const a11y = `${kind === 'cycle' ? '순환' : '흐름'}: ${nodes.join(', ')}${kind === 'cycle' ? ', 다시 처음으로' : ''}`;
  if (kind === 'cycle' && nodes.length === 4) {
    const [a, b, d, e] = nodes;
    return (
      <View style={{ gap: 6 }} accessible accessibilityLabel={a11y}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Node label={a} strong={strong(a)} /><Arrow dir="right" /><Node label={b} strong={strong(b)} />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: '22%' }}>
          <Arrow dir="up" /><Arrow dir="down" />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Node label={e} strong={strong(e)} /><Arrow dir="left" /><Node label={d} strong={strong(d)} />
        </View>
      </View>
    );
  }
  return (
    <View style={{ gap: 6 }} accessible accessibilityLabel={a11y}>
      {nodes.map((n, i) => (
        <View key={`${i}-${n}`} style={{ gap: 6, alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignSelf: 'stretch' }}><Node label={n} strong={strong(n)} /></View>
          {i < nodes.length - 1 ? <Arrow dir="down" /> : null}
        </View>
      ))}
      {kind === 'cycle' ? <Txt variant="caption" color={c.text2} style={{ textAlign: 'center' }}>↻ 다시 처음으로</Txt> : null}
    </View>
  );
}

// ───────── 접힘 ('요즘 뉴스에서') ─────────

export function Accordion({
  header, children, label, initiallyOpen = false,
}: { header: ReactNode; children: ReactNode; label: string; initiallyOpen?: boolean }) {
  const { c } = useTheme();
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <View style={{ gap: 8 }}>
      <Pressy
        onPress={() => setOpen((o) => !o)}
        accessibilityLabel={label}
        accessibilityState={{ expanded: open }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 }}
      >
        <View style={{ flex: 1 }}>{header}</View>
        <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}><Icon name="chevronDown" color={c.text2} size={18} /></View>
      </Pressy>
      {open ? children : null}
    </View>
  );
}
