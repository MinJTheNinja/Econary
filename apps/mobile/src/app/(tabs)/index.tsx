import { isAssignmentComplete, studyDate } from '@tesat/core';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';
import { View } from 'react-native';
import { getLevels, getMyLevel, getTodayAssignment, getTodayReviews, getWords } from '../../lib/api';
import { useLoad } from '../../lib/useLoad';
import { useTheme } from '../../theme';
import { Icon } from '../../ui/Icon';
import {
  Badge, CtaCard, DoneCard, EmptyState, Group, LargeTitle, Pressy, Row, SectionLabel, Skeleton, TabScreen, Txt, type BadgeTone,
} from '../../ui/kit';

async function loadToday() {
  const [assignments, levels, myLevel, reviews] = await Promise.all([
    getTodayAssignment(), getLevels(), getMyLevel(), getTodayReviews(),
  ]);
  const words = await getWords(assignments.map((a) => a.word_id));
  return {
    items: assignments.map((a) => ({ a, w: words.get(a.word_id) })),
    level: levels.find((l) => l.level === myLevel),
    reviewsPending: reviews.pending.length,
  };
}

/** 오늘의 신규 학습 (PRD 3.2) — 디자인 '오늘' 보드 */
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

  const total = data.items.length;
  const done = data.items.filter(({ a }) => isAssignmentComplete({
    assignDate: '', wordId: a.word_id, contentViewedAt: a.content_viewed_at, quizCompletedAt: a.quiz_completed_at,
  })).length;
  const next = data.items.find(({ a }) => !a.quiz_completed_at);
  const started = data.items.some(({ a }) => a.content_viewed_at || a.quiz_completed_at);
  const level = data.level;

  return (
    <TabScreen>
      <View style={{ gap: 4, paddingHorizontal: 4, paddingBottom: 8 }}>
        <Txt variant="footnote" color={c.text2} weight="500">{studyDate()}</Txt>
        <LargeTitle count={total ? `${done}/${total}` : undefined}>오늘의 단어</LargeTitle>
        <Pressy
          onPress={() => router.push('/level')}
          accessibilityLabel={`학습 수준 ${level?.label ?? ''}, 하루 ${level?.daily_new_count ?? ''}개. 변경`}
          style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start' }}
        >
          <Txt variant="subhead" color={c.accent}>수준: {level?.label ?? '-'} · 하루 {level?.daily_new_count ?? '-'}개 </Txt>
          <Txt variant="subhead" color={c.accent} weight="600">(변경)</Txt>
        </Pressy>
      </View>

      {data.reviewsPending > 0 && (
        <Pressy
          onPress={() => router.navigate('/review')}
          accessibilityLabel={`오늘 복습할 단어 ${data.reviewsPending}개. 복습하러 가기`}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.tint, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 16, minHeight: 56 }}
        >
          <Icon name="refresh" color={c.onTint} size={22} />
          <Txt variant="callout" color={c.onTint} weight="600" style={{ flex: 1 }}>오늘 복습할 단어 {data.reviewsPending}개</Txt>
          <Icon name="chevronRight" color={c.onTint} size={16} />
        </Pressy>
      )}

      {total === 0 ? (
        <EmptyState icon="bookCheck" tone="success" title="오늘 배정할 새 단어가 없습니다." body="모든 단어를 학습했어요!" />
      ) : done === total ? (
        <DoneCard title="오늘 신규 학습을 모두 마쳤어요." body="복습 탭에서 예정된 단어를 확인하세요." />
      ) : next ? (
        <CtaCard
          label={started ? '이어서 학습' : '오늘 학습 시작'}
          term={next.w?.term ?? ''}
          onPress={() => router.push(`/study/${next.a.word_id}`)}
        />
      ) : null}

      {total > 0 && (
        <>
          <SectionLabel>오늘의 단어</SectionLabel>
          <Group>
            {data.items.map(({ a, w }, i) => {
              const [label, tone]: [string, BadgeTone] = a.quiz_completed_at
                ? ['완료', 'success'] : a.content_viewed_at ? ['퀴즈 남음', 'warning'] : ['시작 전', 'neutral'];
              return (
                <Row
                  key={a.word_id}
                  last={i === total - 1}
                  onPress={() => router.push(`/study/${a.word_id}`)}
                  accessibilityLabel={`${w?.term ?? ''}, ${label}`}
                >
                  <Txt style={{ flex: 1 }}>{w?.term ?? '…'}</Txt>
                  <Badge label={label} tone={tone} />
                </Row>
              );
            })}
          </Group>
        </>
      )}
    </TabScreen>
  );
}

function TodaySkeleton() {
  const { c } = useTheme();
  const widths = [120, 90, 140, 100, 80];
  return (
    <TabScreen>
      <View style={{ gap: 10, paddingHorizontal: 4, paddingBottom: 8 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Skeleton width={88} height={14} />
        <Skeleton width={220} height={34} r={8} />
        <Skeleton width={170} height={16} />
      </View>
      <Skeleton width="100%" height={92} r={16} />
      <Group>
        {widths.map((w, i) => (
          <Row key={w} last={i === widths.length - 1}>
            <Skeleton width={w} height={14} />
            <View style={{ flex: 1 }} />
            <Skeleton width={48} height={20} r={6} />
          </Row>
        ))}
      </Group>
      <Txt variant="footnote" weight="400" color={c.text2} style={{ textAlign: 'center', paddingTop: 8 }} accessibilityRole="progressbar">
        오늘의 단어를 불러오는 중…
      </Txt>
    </TabScreen>
  );
}
