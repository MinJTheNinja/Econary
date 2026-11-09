/**
 * 학습 계획 고르기 (첫 실행 온보딩 · 오늘 탭의 계획 시트에서 같이 쓴다):
 * TESAT 회차 → 하루 공부 시간 → 계획 요약.
 */
import { PLAN, diffDays, planCapacity, studyDate } from '@tesat/core';
import { View } from 'react-native';
import type { ExamRound, MyPlan } from '../lib/api';
import { useTheme } from '../theme';
import { Icon } from '../ui/Icon';
import { Card, Group, Row, Txt } from '../ui/kit';

const DOW = ['일', '월', '화', '수', '목', '금', '토'];

/** '2026-12-19' → '12월 19일(토)' */
export function fmtDate(d: string): string {
  const [, m, day] = d.split('-').map(Number);
  return `${m}월 ${day}일(${DOW[new Date(`${d}T00:00:00Z`).getUTCDay()]})`;
}

/** 회차 선택. value: 회차 id, null = 아직 미정, undefined = 아직 안 고름 */
export function ExamRoundPicker({
  rounds, value, onChange, onSheet,
}: { rounds: ExamRound[]; value: number | null | undefined; onChange: (id: number | null) => void; onSheet?: boolean }) {
  const { c } = useTheme();
  const today = studyDate();
  const options: { id: number | null; title: string; sub: string }[] = [
    ...rounds.map((r) => ({ id: r.id, title: `제${r.round}회 TESAT`, sub: `${fmtDate(r.exam_date)} · D-${diffDays(today, r.exam_date)}` })),
    { id: null, title: '아직 정하지 않았어요', sub: '공부 시간에 맞춰 꾸준히 배워요' },
  ];
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="시험 회차">
      <Group onSheet={onSheet}>
        {options.map((o, i) => {
          const on = value === o.id;
          return (
            <Row
              key={o.id ?? 'none'}
              last={i === options.length - 1}
              minHeight={64}
              onPress={() => onChange(o.id)}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={`${o.title}, ${o.sub}`}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Txt variant="headline">{o.title}</Txt>
                <Txt variant="subhead" color={c.text2} style={{ fontSize: 14 }}>{o.sub}</Txt>
              </View>
              {on ? <Icon name="check" color={c.accent} size={20} /> : null}
            </Row>
          );
        })}
      </Group>
    </View>
  );
}

/** 하루 공부 시간 (10/20/30/60분) */
export function MinutesPicker({
  value, onChange, onSheet,
}: { value: number | undefined; onChange: (m: number) => void; onSheet?: boolean }) {
  const { c } = useTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="하루 공부 시간">
      <Group onSheet={onSheet}>
        {PLAN.minuteOptions.map((m, i) => {
          const on = value === m;
          const sub = `새 단어 최대 ${planCapacity(m)}개 + 복습`;
          return (
            <Row
              key={m}
              last={i === PLAN.minuteOptions.length - 1}
              minHeight={60}
              onPress={() => onChange(m)}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={`하루 ${m}분, ${sub}`}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Txt variant="headline">하루 {m}분</Txt>
                <Txt variant="subhead" color={c.text2} style={{ fontSize: 14 }}>{sub}</Txt>
              </View>
              {on ? <Icon name="check" color={c.accent} size={20} /> : null}
            </Row>
          );
        })}
      </Group>
    </View>
  );
}

/** 계획을 한두 문장으로 */
export function planSentences(p: MyPlan): string[] {
  if (p.phase === 'review') {
    return [`시험까지 ${p.daysLeft}일, 마무리 복습 기간이에요.`, '새 단어 없이 지금까지 배운 단어를 복습해요.'];
  }
  if (p.remaining === 0) return ['모든 단어를 학습했어요. 복습으로 기억을 다져요.'];
  if (p.phase === 'open') {
    return [
      p.daysLeft !== null ? '시험일이 지났어요. 다음 회차를 고르면 계획을 다시 세워요.' : '시험일이 정해지면 언제든 계획을 바꿀 수 있어요.',
      p.finishDate ? `하루 ${p.quota}단어씩이면 ${fmtDate(p.finishDate)}에 ${p.remaining.toLocaleString()}단어를 모두 마쳐요.` : '',
    ].filter(Boolean);
  }
  const review = p.reviewStart ? ` ${fmtDate(p.reviewStart)}부터 시험 전 ${PLAN.reviewDays}일은 복습에 집중해요.` : '';
  if (p.coverage >= 1) {
    return [`${fmtDate(p.finishDate!)}까지 ${p.remaining.toLocaleString()}단어를 모두 배워요.${review}`];
  }
  return [
    `하루 ${p.quota}단어로 시험 전까지 중요한 단어 ${p.coveredWords.toLocaleString()}개(전체의 ${Math.round(p.coverage * 100)}%)를 배울 수 있어요.${review}`,
    p.quota < PLAN.maxDaily ? '공부 시간을 늘리면 더 많은 단어를 볼 수 있어요.' : '',
  ].filter(Boolean);
}

/** 계획 요약 카드: D-day · 하루 n단어 + 설명 */
export function PlanSummary({ plan, onSheet }: { plan: MyPlan; onSheet?: boolean }) {
  const { c } = useTheme();
  const lines = planSentences(plan);
  return (
    <Card onSheet={onSheet} style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Stat label="시험까지" value={plan.daysLeft !== null && plan.daysLeft > 0 ? `D-${plan.daysLeft}` : '미정'} />
        <Stat label="하루 새 단어" value={`${plan.quota}개`} accent />
        <Stat label="남은 단어" value={plan.remaining.toLocaleString()} />
      </View>
      <View style={{ gap: 6 }}>
        {lines.map((l) => <Txt key={l} variant="subhead" color={c.text2}>{l}</Txt>)}
      </View>
    </Card>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  const { c } = useTheme();
  return (
    <View style={{ flex: 1, gap: 2 }} accessible accessibilityLabel={`${label} ${value}`}>
      <Txt variant="footnote" color={c.text2} weight="500">{label}</Txt>
      <Txt variant="title" color={accent ? c.accent : c.text} style={{ fontSize: 22, fontVariant: ['tabular-nums'] }}>{value}</Txt>
    </View>
  );
}
