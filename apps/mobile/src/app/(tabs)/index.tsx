import { isAssignmentComplete, studyDate } from '@tesat/core';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { View } from 'react-native';
import { getMyPlan, getTodayAssignment, getTodayReviews, getWeek, getWords, onPlanSaved, type MyPlan } from '../../lib/api';
import { useLoad } from '../../lib/useLoad';
import { categoryColor, onCategory, radius, useTheme } from '../../theme';
import { WeekStrip, WordDeckCard } from '../../ui/deck';
import { Icon } from '../../ui/Icon';
import { Banner, DoneCard, EmptyState, LargeTitle, Pressy, Skeleton, TabScreen, Txt } from '../../ui/kit';

async function loadToday() {
  // 배정이 계획(get_my_plan)을 읽으므로 배정 먼저
  const assignments = await getTodayAssignment();
  const [plan, reviews, week] = await Promise.all([getMyPlan(), getTodayReviews(), getWeek().catch(() => null)]);
  const words = await getWords(assignments.map((a) => a.word_id));
  return {
    items: assignments.map((a) => ({ a, w: words.get(a.word_id) })),
    plan,
    reviewsPending: reviews.pending.length,
    week,
  };
}

const pad2 = (n: number) => String(n).padStart(2, '0');

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
  const { data, error, reload } = useLoad(loadToday, []);
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
  const openList = () => router.push('/words');

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
          position={`${pad2(nextIdx + 1)} / ${pad2(total)}`}
          term={next.w?.term ?? ''}
          english={next.w?.english_name}
          status={next.a.content_viewed_at ? '뜻은 봤어요 · 퀴즈 남음' : done ? `${done}개 완료` : '아직 시작 전'}
          action={done || next.a.content_viewed_at ? '이어서 학습' : '학습 시작'}
          onPress={() => router.push(`/study/${next.a.word_id}`)}
          onPositionPress={openList}
          accessibilityLabel={`${done || next.a.content_viewed_at ? '이어서 학습' : '학습 시작'}: ${next.w?.term ?? ''}, ${nextIdx + 1}번째 단어`}
        />
      ) : (
        <WordDeckCard
          color={onCategory.done}
          behind={[onCategory.done, onCategory.done]}
          chip="완료"
          position={`${pad2(total)} / ${pad2(total)}`}
          term="오늘 신규 학습을 모두 마쳤어요."
          status="복습 탭에서 예정된 단어를 확인하세요."
          onPositionPress={openList}
          accessibilityLabel="오늘 신규 학습을 모두 마쳤어요. 복습 탭에서 예정된 단어를 확인하세요."
        />
      )}

      {data.week ? <WeekStrip days={data.week.days} today={today} streak={data.week.streak} /> : null}

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
