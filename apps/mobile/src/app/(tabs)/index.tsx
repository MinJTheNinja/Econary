import { isAssignmentComplete, studyDate } from '@tesat/core';
import { Link, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Body, Card, ErrorView, Loading, Screen, Title, colors } from '../../components/ui';
import { getLevels, getMyLevel, getTodayAssignment, getWords, type Assignment, type Level, type Word } from '../../lib/api';

interface TodayData {
  items: { a: Assignment; w: Word | undefined }[];
  level: Level | undefined;
}

/** 오늘의 신규 학습 (PRD 3.2): 수준별 배정 단어 목록 → 단어 학습 → 퀴즈 */
export default function TodayScreen() {
  const [data, setData] = useState<TodayData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    (async () => {
      const [assignments, levels, myLevel] = await Promise.all([getTodayAssignment(), getLevels(), getMyLevel()]);
      const words = await getWords(assignments.map((a) => a.word_id));
      setData({
        items: assignments.map((a) => ({ a, w: words.get(a.word_id) })),
        level: levels.find((l) => l.level === myLevel),
      });
    })().catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  useFocusEffect(load); // 학습·퀴즈 후 돌아오면 완료 상태를 다시 읽는다

  if (error) return <ErrorView message={`오늘의 학습을 불러오지 못했습니다.\n${error}`} onRetry={load} />;
  if (!data) return <Loading />;

  const done = data.items.filter(({ a }) => isAssignmentComplete({
    assignDate: '', wordId: a.word_id, contentViewedAt: a.content_viewed_at, quizCompletedAt: a.quiz_completed_at,
  })).length;
  const total = data.items.length;
  const next = data.items.find(({ a }) => !a.quiz_completed_at);

  return (
    <Screen>
      <View style={{ gap: 4 }}>
        <Body muted>{studyDate()}</Body>
        <Title>오늘의 단어 {done}/{total}</Title>
        <Link href="/level" asChild>
          <Pressable accessibilityRole="button" accessibilityLabel={`학습 수준 ${data.level?.label ?? ''}, 하루 ${data.level?.daily_new_count ?? ''}개. 변경`}>
            <Body style={{ color: colors.accent }}>
              수준: {data.level?.label ?? '-'} · 하루 {data.level?.daily_new_count ?? '-'}개  (변경)
            </Body>
          </Pressable>
        </Link>
      </View>

      {total === 0 ? (
        <Card><Body>오늘 배정할 새 단어가 없습니다. 모든 단어를 학습했어요!</Body></Card>
      ) : done === total ? (
        <Card><Body>오늘 신규 학습을 모두 마쳤어요. 복습 탭에서 예정된 단어를 확인하세요.</Body></Card>
      ) : next ? (
        <Pressable onPress={() => router.push(`/study/${next.a.word_id}`)} accessibilityRole="button" accessibilityLabel={`${done === 0 ? '오늘 학습 시작' : '이어서 학습'}: ${next.w?.term ?? ''}`}>
          <Card style={{ backgroundColor: colors.accent, borderColor: colors.accent }}>
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>
              {done === 0 ? '오늘 학습 시작' : '이어서 학습'} → {next.w?.term}
            </Text>
          </Card>
        </Pressable>
      ) : null}

      {data.items.map(({ a, w }) => {
        const status = a.quiz_completed_at ? '완료' : a.content_viewed_at ? '퀴즈 남음' : '시작 전';
        const tone = a.quiz_completed_at ? colors.ok : a.content_viewed_at ? colors.warn : colors.muted;
        return (
          <Pressable key={a.word_id} onPress={() => router.push(`/study/${a.word_id}`)} accessibilityRole="button" accessibilityLabel={`${w?.term ?? ''}, ${status}`}>
            <Card style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 17, fontWeight: '600', color: colors.text, flexShrink: 1 }}>{w?.term ?? '…'}</Text>
              <Text style={{ color: tone, fontSize: 13, fontWeight: '600' }}>{status}</Text>
            </Card>
          </Pressable>
        );
      })}
    </Screen>
  );
}
