import { router, Stack, useIsFocused, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WordLesson } from '../../components/WordLesson';
import { getExplanation, getTodayAssignment, getWords, markViewed } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { isToss } from '../../lib/target';
import { useLoad } from '../../lib/useLoad';
import { categoryColor, onCategory, useTheme } from '../../theme';
import { Button, EmptyState, PushScreen, Spinner, Txt } from '../../ui/kit';

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * 단어 상세 (PRD 3.2) — 진도 탭 오답 단어·단어 목록에서 연다. 오늘의 새 단어 학습은 학습 세션(/session).
 * 오늘 배정된 단어면 '콘텐츠 확인'으로 기록하고, 퀴즈는 오늘 학습(new)으로, 아니면 복습(review)으로 푼다.
 */
export default function StudyScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { wordId } = useLocalSearchParams<{ wordId: string }>();
  const id = Number(wordId);
  const { session } = useAuth();
  const userId = session?.user.id;
  // 퀴즈를 push 해도 이 화면은 아래에 남아 있으므로, 보일 때만 밝은 상태바를 건다
  const focused = useIsFocused();
  const { data, error, reload } = useLoad(async () => {
    const [words, explanation, today] = await Promise.all([
      getWords([id]), getExplanation(id), getTodayAssignment().catch(() => []),
    ]);
    const word = words.get(id);
    if (!word) throw new Error('단어를 찾을 수 없습니다.');
    const pos = today.findIndex((a) => a.word_id === id);
    if (userId && pos >= 0) await markViewed(userId, id).catch(() => {}); // 기록 실패해도 학습은 계속
    return {
      word, explanation,
      position: pos >= 0 ? `${pad2(pos + 1)} / ${pad2(today.length)}` : null,
      context: pos >= 0 && !today[pos].quiz_completed_at ? 'new' : 'review',
    };
  }, [id, userId]);

  if (error) {
    return (
      <PushScreen>
        <EmptyState icon="alertCircle" tone="danger" title="단어를 불러오지 못했어요."
          body="네트워크 연결을 확인한 뒤 다시 시도해 주세요." action={{ label: '다시 시도', onPress: reload }} />
      </PushScreen>
    );
  }
  if (!data) {
    return <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }}><Spinner color={c.text2} /></View>;
  }
  const { word, explanation, position, context } = data;
  const positionText = position
    ? <Txt variant="subhead" color={onCategory.text2} style={{ fontVariant: ['tabular-nums'], paddingHorizontal: 4 }}>{position}</Txt>
    : null;

  return (
    <View style={{ flex: 1, backgroundColor: c.surface }}>
      {focused ? <StatusBar style="light" /> : null}
      <Stack.Screen
        options={{
          headerStyle: { backgroundColor: categoryColor(word.category) },
          headerTintColor: onCategory.text,
          headerRight: positionText && !isToss ? () => positionText : undefined,
        }}
      />
      <WordLesson word={word} explanation={explanation} topRight={isToss ? positionText : undefined} topPad={isToss ? 16 : 8} />
      <View style={{ backgroundColor: c.surface, paddingHorizontal: 16, paddingTop: 8, paddingBottom: Math.max(insets.bottom, 12) + 8 }}>
        <Button label="퀴즈 풀기" onPress={() => router.push({ pathname: '/quiz/[wordId]', params: { wordId: String(id), context } })} />
      </View>
    </View>
  );
}
