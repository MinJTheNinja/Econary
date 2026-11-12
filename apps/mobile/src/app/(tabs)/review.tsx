import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';
import { View } from 'react-native';
import { getTodayReviews } from '../../lib/api';
import { useLoad } from '../../lib/useLoad';
import { useTheme } from '../../theme';
import {
  Badge, CtaCard, DoneCard, EmptyState, Group, LargeTitle, Row, SectionLabel, Spinner, TabScreen, Txt,
} from '../../ui/kit';

const openReview = (wordId: number) =>
  router.push({ pathname: '/quiz/[wordId]', params: { wordId: String(wordId), context: 'review' } });

/** 기억 유지율 표시: 지금 떠올릴 확률 (core/memory) */
const pct = (r: number | null | undefined) => (r === null || r === undefined ? null : Math.round(r * 100));

/**
 * 오늘의 복습 (PRD 5.1) — 디자인 '복습' 보드.
 * 망각 곡선으로 기억 유지율이 90% 아래로 내려온 단어가 나오고, 많이 잊었을 단어부터 보여 준다.
 */
export default function ReviewScreen() {
  const { c } = useTheme();
  const { data, error, reload } = useLoad(getTodayReviews, []);
  const focusedOnce = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (focusedOnce.current) reload();
      focusedOnce.current = true;
    }, []), // eslint-disable-line react-hooks/exhaustive-deps
  );

  if (error) {
    return (
      <TabScreen>
        <EmptyState icon="alertCircle" tone="danger" title="복습 목록을 불러오지 못했어요."
          body="네트워크 연결을 확인한 뒤 다시 시도해 주세요." action={{ label: '다시 시도', onPress: reload }} />
      </TabScreen>
    );
  }
  if (!data) {
    return (
      <TabScreen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Spinner color={c.text2} /></View>
      </TabScreen>
    );
  }

  if (data.isEmpty) {
    return (
      <TabScreen>
        <View style={{ paddingHorizontal: 4, paddingBottom: 8 }}><LargeTitle>오늘의 복습</LargeTitle></View>
        <EmptyState
          icon="refresh" tone="tint" title="오늘 복습할 단어가 없어요."
          body="퀴즈를 푼 단어는 기억이 흐려질 때쯤 여기에 다시 나타납니다."
          action={{ label: '오늘의 신규 학습으로', onPress: () => router.navigate('/') }}
        />
      </TabScreen>
    );
  }

  const total = data.pending.length + data.done.length;
  const first = data.pending[0];

  return (
    <TabScreen>
      <View style={{ gap: 6, paddingHorizontal: 4, paddingBottom: 8 }}>
        <LargeTitle count={`${data.done.length}/${total}`}>오늘의 복습</LargeTitle>
        <Txt variant="subhead" color={c.text2}>
          기억이 흐려질 때쯤 다시 떠올리면 오래 남아요. 많이 잊었을 단어부터 보여 드려요.
        </Txt>
      </View>

      {first ? (
        <CtaCard label={data.done.length === 0 ? '복습 시작' : '이어서 복습'} term={first.term} onPress={() => openReview(first.wordId)} />
      ) : (
        <DoneCard title="오늘 복습을 모두 마쳤어요" />
      )}

      {data.pending.length > 0 && (
        <>
          <SectionLabel>남은 복습 {data.pending.length}</SectionLabel>
          <Group>
            {data.pending.map((r, i) => {
              const p = pct(r.retention);
              return (
                <Row
                  key={r.wordId} last={i === data.pending.length - 1} onPress={() => openReview(r.wordId)}
                  accessibilityLabel={`${r.term}, 복습 전${p !== null ? `, 기억 유지율 ${p}퍼센트` : ''}`}
                >
                  <Txt style={{ flex: 1 }}>{r.term}</Txt>
                  <Badge label={p !== null ? `기억 ${p}%` : '복습 전'} tone={p !== null && p < 70 ? 'warning' : 'neutral'} />
                </Row>
              );
            })}
          </Group>
        </>
      )}

      {data.done.length > 0 && (
        <>
          <SectionLabel>완료 {data.done.length}</SectionLabel>
          <Group>
            {data.done.map((r, i) => {
              const next = r.dueDate.slice(5).replace('-', '/');
              return (
                <Row key={r.wordId} last={i === data.done.length - 1} accessibilityLabel={`${r.term}, 복습 완료, 다음 복습 ${next}`}>
                  <Txt style={{ flex: 1 }}>{r.term}</Txt>
                  <Badge label={`완료 · 다음 ${next}`} tone="success" />
                </Row>
              );
            })}
          </Group>
        </>
      )}
    </TabScreen>
  );
}
