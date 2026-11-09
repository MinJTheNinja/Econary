import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';
import { Body, Button, Card, ErrorView, Loading, Screen, colors } from '../../components/ui';
import { getExplanation, getWords, markViewed } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useLoad } from '../../lib/useLoad';

const SOURCE: Record<string, string> = { ytn: 'YTN', hankyung: '한국경제', manual: '' };

/**
 * 단어 학습 화면: 뜻 + (있으면) 짧은 시사 설명 → 퀴즈로 이어간다 (PRD 3.2).
 * 기사 원문·링크는 보여주지 않는다 (PRD 2: 저작권). 화면을 열면 '콘텐츠 확인'으로 기록.
 */
export default function StudyScreen() {
  const { wordId } = useLocalSearchParams<{ wordId: string }>();
  const id = Number(wordId);
  const { session } = useAuth();
  const userId = session?.user.id;
  const { data, error, reload } = useLoad(async () => {
    const [words, explanation] = await Promise.all([getWords([id]), getExplanation(id)]);
    const word = words.get(id);
    if (!word) throw new Error('단어를 찾을 수 없습니다.');
    if (userId) await markViewed(userId, id).catch(() => {}); // 기록 실패해도 학습은 계속 (퀴즈 제출 시 서버가 함께 채움)
    return { word, explanation };
  }, [id, userId]);

  if (error) return <ErrorView message={error} onRetry={reload} />;
  if (!data) return <Loading />;
  const { word, explanation } = data;

  return (
    <Screen>
      <Stack.Screen options={{ title: word.term }} />
      <View style={{ gap: 2 }}>
        <Text style={{ fontSize: 30, fontWeight: '700', color: colors.text, letterSpacing: -0.5 }}>{word.term}</Text>
        {word.english_name && <Body muted>{word.english_name}</Body>}
      </View>

      <Card>
        <Body muted style={{ fontSize: 13, fontWeight: '600' }}>뜻</Body>
        <Body>{word.meaning}</Body>
      </Card>

      {explanation && (
        <Card>
          <Body muted style={{ fontSize: 13, fontWeight: '600' }}>
            요즘 뉴스에서{explanation.topic ? ` · ${explanation.topic}` : ''}
          </Body>
          <Body>{explanation.body}</Body>
          {SOURCE[explanation.source] && <Body muted style={{ fontSize: 12 }}>{SOURCE[explanation.source]} 보도 참고 · 자체 요약</Body>}
        </Card>
      )}

      <Button label="퀴즈 풀기" onPress={() => router.push(`/quiz/${id}`)} />
    </Screen>
  );
}
