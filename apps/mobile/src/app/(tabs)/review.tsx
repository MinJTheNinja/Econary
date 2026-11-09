import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Body, Button, Card, ErrorView, Loading, Screen, Title, colors } from '../../components/ui';
import { getTodayReviews } from '../../lib/api';
import { useLoad } from '../../lib/useLoad';

/**
 * 오늘의 복습 (PRD 5.1): 간격 반복으로 오늘까지 예정된 단어를 퀴즈로 다시 확인한다.
 * 신규 학습과 분리된 흐름이며, 완료/미완료를 구분해 보여준다. 예정 단어가 없으면 신규 학습으로 안내.
 */
export default function ReviewScreen() {
  const { data, error, reload } = useLoad(getTodayReviews, []);
  // 복습을 풀고 돌아오면 다시 읽는다 (첫 진입은 useLoad 가 이미 불러오므로 건너뜀)
  const focusedOnce = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (focusedOnce.current) reload();
      focusedOnce.current = true;
    }, []), // eslint-disable-line react-hooks/exhaustive-deps -- reload 는 매 렌더 새로 만들어지지만 동작은 같다
  );

  if (error) return <ErrorView message={`복습 목록을 불러오지 못했습니다.\n${error}`} onRetry={reload} />;
  if (!data) return <Loading />;

  if (data.isEmpty) {
    return (
      <Screen>
        <Title>오늘의 복습</Title>
        <Card>
          <Body>오늘 복습할 단어가 없어요.</Body>
          <Body muted>퀴즈를 푼 단어는 기억이 흐려질 때쯤 여기에 다시 나타납니다.</Body>
        </Card>
        <Button label="오늘의 신규 학습으로" onPress={() => router.navigate('/')} />
      </Screen>
    );
  }

  const total = data.pending.length + data.done.length;
  const first = data.pending[0];

  return (
    <Screen>
      <View style={{ gap: 4 }}>
        <Title>오늘의 복습 {data.done.length}/{total}</Title>
        <Body muted>정답이면 다음 복습까지 간격이 늘고, 틀리면 내일 다시 나와요.</Body>
      </View>

      {first ? (
        <Button
          label={`${data.done.length === 0 ? '복습 시작' : '이어서 복습'} → ${first.term}`}
          onPress={() => router.push({ pathname: '/quiz/[wordId]', params: { wordId: String(first.wordId), context: 'review' } })}
        />
      ) : (
        <Card><Body>오늘 복습을 모두 마쳤어요.</Body></Card>
      )}

      {data.pending.length > 0 && <Body muted style={{ fontSize: 13, fontWeight: '600' }}>남은 복습 {data.pending.length}</Body>}
      {data.pending.map((r) => (
        <Pressable
          key={r.wordId}
          accessibilityRole="button"
          accessibilityLabel={`${r.term}, 복습 전`}
          onPress={() => router.push({ pathname: '/quiz/[wordId]', params: { wordId: String(r.wordId), context: 'review' } })}
        >
          <Row term={r.term} status="복습 전" tone={colors.muted} />
        </Pressable>
      ))}

      {data.done.length > 0 && <Body muted style={{ fontSize: 13, fontWeight: '600' }}>완료 {data.done.length}</Body>}
      {data.done.map((r) => (
        <View key={r.wordId} accessible accessibilityLabel={`${r.term}, 복습 완료, 다음 복습 ${r.dueDate}`}>
          <Row term={r.term} status={`완료 · 다음 ${r.dueDate.slice(5).replace('-', '/')}`} tone={colors.ok} />
        </View>
      ))}
    </Screen>
  );
}

function Row({ term, status, tone }: { term: string; status: string; tone: string }) {
  return (
    <Card style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <Text style={{ fontSize: 17, fontWeight: '600', color: colors.text, flexShrink: 1 }}>{term}</Text>
      <Text style={{ color: tone, fontSize: 13, fontWeight: '600' }}>{status}</Text>
    </Card>
  );
}
