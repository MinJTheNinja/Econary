import { router } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getTodayAssignment, getWords, type Assignment } from '../lib/api';
import { useLoad } from '../lib/useLoad';
import { useTheme } from '../theme';
import { Group, Pressy, Row, Spinner, Txt } from '../ui/kit';

type State = 'done' | 'quiz' | 'todo';
const stateOf = (a: Assignment): State => (a.quiz_completed_at ? 'done' : a.content_viewed_at ? 'quiz' : 'todo');
const STATE_LABEL: Record<State, string> = { done: '완료', quiz: '퀴즈 남음', todo: '시작 전' };

/** 상태 점 두 개: 뜻 확인 · 퀴즈 제출 */
function Dots({ state }: { state: State }) {
  const { c } = useTheme();
  const dot = (on: boolean) => (
    <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: on ? c.accentFill : 'transparent', borderWidth: on ? 0 : 1.5, borderColor: c.ring }} />
  );
  return <View style={{ flexDirection: 'row', gap: 3 }}>{dot(state !== 'todo')}{dot(state === 'done')}</View>;
}

/** 오늘의 단어 목록 시트 — 오늘 탭 카드의 '03 / 10' 칩에서 연다 */
export default function WordsSheet() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { data } = useLoad(async () => {
    const assignments = await getTodayAssignment();
    const words = await getWords(assignments.map((a) => a.word_id));
    return assignments.map((a) => ({ a, w: words.get(a.word_id), state: stateOf(a) }));
  }, []);

  const count = (s: State) => data?.filter((i) => i.state === s).length ?? 0;
  const currentId = data?.find((i) => i.state !== 'done')?.a.word_id;

  const open = (wordId: number) => {
    if (router.canGoBack()) router.back();
    router.push(`/study/${wordId}`);
  };

  return (
    <ScrollView style={{ backgroundColor: c.sheet }} contentContainerStyle={{ paddingTop: 20, paddingHorizontal: 16, paddingBottom: insets.bottom + 24, gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4 }}>
        <Txt variant="title" style={{ fontSize: 20, flex: 1 }} accessibilityRole="header">오늘의 단어</Txt>
        <Pressy onPress={() => router.back()} accessibilityLabel="완료" style={{ minHeight: 44, minWidth: 44, alignItems: 'flex-end', justifyContent: 'center' }}>
          <Txt variant="headline" color={c.accent}>완료</Txt>
        </Pressy>
      </View>
      <View style={{ flexDirection: 'row', gap: 14, paddingHorizontal: 4, marginTop: -6 }}>
        {(['done', 'quiz', 'todo'] as const).map((s) => (
          <View key={s} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Dots state={s} />
            <Txt variant="caption" color={c.text2}>{STATE_LABEL[s]} {count(s)}</Txt>
          </View>
        ))}
      </View>

      {!data ? (
        <View style={{ height: 240, alignItems: 'center', justifyContent: 'center' }}><Spinner color={c.text2} /></View>
      ) : (
        <Group onSheet>
          {data.map(({ a, w, state }, i) => {
            const current = a.word_id === currentId;
            return (
              <View key={a.word_id} style={{ backgroundColor: current ? c.tint : undefined }}>
                <Row
                  last={i === data.length - 1}
                  minHeight={56}
                  onPress={() => open(a.word_id)}
                  accessibilityLabel={`${i + 1}번 ${w?.term ?? ''}, ${STATE_LABEL[state]}${current ? ', 지금 학습할 단어' : ''}`}
                >
                  <Txt variant="footnote" weight="400" color={c.text2} style={{ width: 20, fontVariant: ['tabular-nums'] }}>
                    {String(i + 1).padStart(2, '0')}
                  </Txt>
                  <View style={{ flex: 1, paddingVertical: 8 }}>
                    <Txt variant="callout" weight={current ? '600' : '400'}>{w?.term ?? '…'}</Txt>
                    {w?.category ? <Txt variant="caption" color={c.text2}>{w.category}</Txt> : null}
                  </View>
                  <Dots state={state} />
                </Row>
              </View>
            );
          })}
        </Group>
      )}
    </ScrollView>
  );
}
