import { isAssignmentComplete, studyDate } from '@tesat/core';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { onPlanSaved, type MyPlan } from '../../lib/api';
import { getPref } from '../../lib/prefs';
import { loadToday, takeToday } from '../../lib/today';
import { useLoad } from '../../lib/useLoad';
import { categoryColor, onCategory, radius, useTheme } from '../../theme';
import { WeekStrip, WordDeckCard } from '../../ui/deck';
import { Icon } from '../../ui/Icon';
import { Banner, DoneCard, EmptyState, LargeTitle, Pressy, Skeleton, TabScreen, Txt } from '../../ui/kit';


/** 'D-39 · 하루 12개' / '하루 10개' / 'D-5 · 복습 기간' */
function planLabel(p: MyPlan): string {
  const d = p.daysLeft !== null && p.daysLeft > 0 ? `D-${p.daysLeft} · ` : '';
  return p.phase === 'review' ? `${d}복습 기간` : `${d}하루 ${p.quota}개`;
}

function PlanAction({ label }: { label: string }) {
  const { c } = useTheme();
  return (
    <Pressy
      onPress={() => router.push('/study-plan')}
      accessibilityLabel={label}
      style={{ alignSelf: 'flex-start', marginLeft: 30, height: 40, paddingHorizontal: 14, borderRadius: radius.md, borderWidth: 1, borderColor: c.warning, justifyContent: 'center' }}
    >
      <Txt variant="subhead" weight="600" color={c.warning}>{label}</Txt>
    </Pressy>
  );
}

/** 오늘의 신규 학습 (PRD 3.2) — '최신 UI' 시안 '오늘' 보드: 단어 카드 덱 + 이번 주 + 복습 바로가기 */
export default function TodayScreen() {
  const { c } = useTheme();
  const { data, error, reload } = useLoad(() => takeToday() ?? loadToday(), []);
  const focusedOnce = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (focusedOnce.current) reload(); // 학습·퀴즈 후 돌아오면 완료 상태를 다시 읽는다
      focusedOnce.current = true;
    }, []), // eslint-disable-line react-hooks/exhaustive-deps
  );
  // 계획을 바꾸면 오늘 배정(서버가 새 계획에 맞춰 늘리거나 줄임)과 표시를 바로 다시 읽는다
  useEffect(() => onPlanSaved(reload), []); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) {
    return (
      <TabScreen>
        <EmptyState
          icon="alertCircle" tone="danger" title="오늘의 단어를 불러오지 못했어요."
          body="네트워크 연결을 확인한 뒤 다시 시도해 주세요." action={{ label: '다시 시도', onPress: reload }}
        />
      </TabScreen>
    );
  }
  if (!data) return <TodaySkeleton />;

  const today = studyDate();
  const total = data.items.length;
  const done = data.items.filter(({ a }) => isAssignmentComplete({
    assignDate: '', wordId: a.word_id, contentViewedAt: a.content_viewed_at, quizCompletedAt: a.quiz_completed_at,
  })).length;
  const nextIdx = data.items.findIndex(({ a }) => !a.quiz_completed_at);
  const next = nextIdx >= 0 ? data.items[nextIdx] : null;
  const plan = data.plan;

  return (
    <TabScreen>
      <View style={{ gap: 2, paddingHorizontal: 4 }}>
        <Txt variant="footnote" color={c.text2} weight="500">{today}</Txt>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <LargeTitle count={total ? `${done}/${total}` : undefined}>오늘의 단어</LargeTitle>
          </View>
          <Pressy
            onPress={() => router.push('/study-plan')}
            accessibilityLabel={`학습 계획 ${planLabel(plan)}. 변경`}
            style={{ minHeight: 44, justifyContent: 'flex-end', paddingBottom: 6 }}
          >
            <Txt variant="footnote" weight="500" color={c.accent}>{planLabel(plan)} (변경)</Txt>
          </Pressy>
        </View>
      </View>

      {plan.dailyMinutes === null ? (
        <Banner tone="warning" title="학습 계획을 세워 보세요" body="시험일과 하루 공부 시간을 고르면 매일 배울 단어 수를 맞춰 드려요.">
          <PlanAction label="계획 세우기" />
        </Banner>
      ) : plan.phase === 'open' && plan.daysLeft !== null ? (
        <Banner tone="warning" title="시험일이 지났어요" body="다음 회차를 고르면 남은 단어로 계획을 다시 세워요.">
          <PlanAction label="다음 회차 고르기" />
        </Banner>
      ) : null}

      {total === 0 && plan.phase === 'review' ? (
        <DoneCard
          title={`시험까지 ${plan.daysLeft}일, 마무리 복습 기간이에요`}
          body="새 단어 없이 지금까지 배운 단어를 복습해요. 복습 탭에서 오늘 볼 단어를 확인하세요."
        />
      ) : total === 0 ? (
        <EmptyState icon="bookCheck" tone="success" title="오늘 배정할 새 단어가 없습니다." body="모든 단어를 학습했어요!" />
      ) : next ? (
        <WordDeckCard
          color={categoryColor(next.w?.category)}
          behind={data.items.slice(nextIdx + 1, nextIdx + 3).map(({ w }) => categoryColor(w?.category))}
          chip={next.w?.category || '시사 어휘'}
          term={next.w?.term ?? ''}
          english={next.w?.english_name}
          action={done || next.a.content_viewed_at ? '이어서 학습' : '학습 시작'}
          onPress={() => router.push(`/study/${next.a.word_id}`)}
          accessibilityLabel={`${done || next.a.content_viewed_at ? '이어서 학습' : '학습 시작'}: ${next.w?.term ?? ''}, ${nextIdx + 1}번째 단어`}
        />
      ) : (
        <WordDeckCard
          color={onCategory.done}
          behind={[onCategory.done, onCategory.done]}
          chip="완료"
          term="오늘 신규 학습을 모두 마쳤어요."
          action="카드로 다시 보기"
          onPress={() => router.push('/cards')}
          accessibilityLabel="오늘 신규 학습을 모두 마쳤어요. 카드로 다시 보기"
        />
      )}

      {data.week ? <WeekStrip days={data.week.days} today={today} streak={data.week.streak} /> : null}

      {total > 0 ? <PracticeTiles total={total} /> : null}

      {data.reviewsPending > 0 && (
        <Pressy
          onPress={() => router.navigate('/review')}
          accessibilityLabel={`오늘 복습할 단어 ${data.reviewsPending}개. 복습하러 가기`}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.surface, borderRadius: radius.xl, paddingHorizontal: 16, minHeight: 56 }}
        >
          <View style={{ width: 22, height: 26 }}>
            <View style={{ position: 'absolute', left: 5, top: 0, width: 17, height: 22, borderRadius: 4, backgroundColor: c.heatPartial }} />
            <View style={{ position: 'absolute', left: 0, top: 4, width: 17, height: 22, borderRadius: 4, backgroundColor: c.accentFill }} />
          </View>
          <Txt variant="callout" weight="600" style={{ flex: 1 }}>오늘 복습할 단어 {data.reviewsPending}개</Txt>
          <Icon name="chevronRight" color={c.text2} size={16} />
        </Pressy>
      )}
    </TabScreen>
  );
}

/** 짝 맞추기는 최대 6쌍, 3개 미만이면 못 한다 (MatchGame 과 같은 규칙) */
const matchPairs = (total: number) => Math.min(6, total);

/** 오늘 단어로 연습: 카드 넘기기 · 짝 맞추기 (시안 '오늘' 보드) */
function PracticeTiles({ total }: { total: number }) {
  const { c } = useTheme();
  const pairs = matchPairs(total);
  const [best, setBest] = useState<number | null>(null);
  useFocusEffect(
    useCallback(() => {
      if (pairs < 3) return;
      void getPref<number | null>(`match-best:${pairs}`, null).then(setBest); // 짝 맞추기 후 돌아오면 기록 갱신
    }, [pairs]),
  );
  const canMatch = pairs >= 3;
  const matchSub = !canMatch ? '단어 3개부터' : best !== null ? `내 기록 ${(best / 1000).toFixed(1)}초` : '아직 기록 없음';

  return (
    <View style={{ flexDirection: 'row', gap: 12 }}>
      <View style={{ flex: 1 }}>
        <PracticeTile
          title="카드 넘기기" sub={`오늘 단어 ${total}장`}
          onPress={() => router.push({ pathname: '/cards', params: { mode: 'flip' } })}
          icon={
            <View style={{ width: 28, height: 24 }}>
              <View style={{ position: 'absolute', left: 8, top: 0, width: 20, height: 16, borderRadius: 4, backgroundColor: c.heatPartial, transform: [{ rotate: '8deg' }] }} />
              <View style={{ position: 'absolute', left: 0, top: 6, width: 20, height: 16, borderRadius: 4, backgroundColor: c.accentFill, transform: [{ rotate: '-6deg' }] }} />
            </View>
          }
        />
      </View>
      <View style={{ flex: 1 }}>
        <PracticeTile
          title="짝 맞추기" sub={matchSub} disabled={!canMatch}
          onPress={() => router.push({ pathname: '/cards', params: { mode: 'match' } })}
          icon={
            <View style={{ width: 24, height: 24, flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
              {[c.accentFill, c.heatPartial, c.heatPartial, c.accentFill].map((bg, i) => (
                <View key={i} style={{ width: 10, height: 10, borderRadius: 2.5, backgroundColor: bg }} />
              ))}
            </View>
          }
        />
      </View>
    </View>
  );
}

function PracticeTile({ title, sub, icon, onPress, disabled }: { title: string; sub: string; icon: ReactNode; onPress: () => void; disabled?: boolean }) {
  const { c } = useTheme();
  return (
    <Pressy
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={`${title}, ${sub}`}
      style={{ backgroundColor: c.surface, borderRadius: radius.xl, padding: 16, gap: 10, minHeight: 104, opacity: disabled ? 0.5 : 1 }}
    >
      {icon}
      <View style={{ gap: 2 }}>
        <Txt variant="subhead" weight="600">{title}</Txt>
        <Txt variant="caption" color={c.text2}>{sub}</Txt>
      </View>
    </Pressy>
  );
}

function TodaySkeleton() {
  const { c } = useTheme();
  return (
    <TabScreen>
      <View style={{ gap: 10, paddingHorizontal: 4, paddingBottom: 8 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Skeleton width={88} height={14} />
        <Skeleton width={220} height={34} r={8} />
      </View>
      <Skeleton width="100%" height={212} r={18} />
      <Skeleton width="100%" height={96} r={16} />
      <Txt variant="footnote" weight="400" color={c.text2} style={{ textAlign: 'center', paddingTop: 8 }} accessibilityRole="progressbar">
        오늘의 단어를 불러오는 중…
      </Txt>
    </TabScreen>
  );
}
