import { router, Stack, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { ReportLink } from '../../components/ReportLink';
import { getExplanation, getTodayAssignment, getWords, markViewed } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useLoad } from '../../lib/useLoad';
import { useTheme } from '../../theme';
import { Icon } from '../../ui/Icon';
import { Button, Card, EmptyState, PushScreen, Spinner, Txt } from '../../ui/kit';

const SOURCE: Record<string, string> = { ytn: 'YTN', hankyung: '한국경제', manual: '' };

/**
 * 단어 학습 (PRD 3.2) — 디자인 '단어 학습' 보드.
 * 뜻 + (있으면) 짧은 시사 설명 → 퀴즈. 기사 원문·링크는 보여주지 않는다. 화면을 열면 '콘텐츠 확인'으로 기록.
 */
export default function StudyScreen() {
  const { c } = useTheme();
  const { wordId } = useLocalSearchParams<{ wordId: string }>();
  const id = Number(wordId);
  const { session } = useAuth();
  const userId = session?.user.id;
  const { data, error, reload } = useLoad(async () => {
    const [words, explanation, today] = await Promise.all([
      getWords([id]), getExplanation(id), getTodayAssignment().catch(() => []),
    ]);
    const word = words.get(id);
    if (!word) throw new Error('단어를 찾을 수 없습니다.');
    if (userId) await markViewed(userId, id).catch(() => {}); // 기록 실패해도 학습은 계속 (퀴즈 제출 시 서버가 함께 채움)
    const pos = today.findIndex((a) => a.word_id === id);
    return { word, explanation, position: pos >= 0 ? `${pos + 1} / ${today.length}` : null };
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
  const { word, explanation, position } = data;

  return (
    <PushScreen footer={<Button label="퀴즈 풀기" onPress={() => router.push(`/quiz/${id}`)} />}>
      <Stack.Screen
        options={{
          headerRight: position
            ? () => <Txt variant="subhead" color={c.text2} style={{ fontVariant: ['tabular-nums'], paddingHorizontal: 4 }}>{position}</Txt>
            : undefined,
        }}
      />
      <View style={{ gap: 4, paddingHorizontal: 4, paddingBottom: 12 }}>
        <Txt variant="term" accessibilityRole="header">{word.term}</Txt>
        {word.english_name ? <Txt color={c.text2}>{word.english_name}</Txt> : null}
      </View>

      <Card style={{ paddingBottom: 10 }}>
        <Txt variant="footnote" color={c.text2}>뜻</Txt>
        <Txt>{word.meaning}</Txt>
        <View style={{ alignItems: 'flex-end' }}>
          <ReportLink wordId={word.id} term={word.term} target="word_meaning" label="뜻 오류 신고" />
        </View>
      </Card>

      {explanation ? (
        <Card style={{ paddingBottom: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icon name="news" color={c.accent} size={14} />
            <Txt variant="footnote" color={c.accent}>요즘 뉴스에서</Txt>
          </View>
          {explanation.topic ? <Txt variant="headline">{explanation.topic}</Txt> : null}
          <Txt variant="callout">{explanation.body}</Txt>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 4 }}>
            <Txt variant="caption" color={c.text2} style={{ flex: 1 }}>
              {SOURCE[explanation.source] ? `${SOURCE[explanation.source]} 보도 참고 · 자체 요약` : '자체 요약'}
            </Txt>
            <ReportLink wordId={word.id} term={word.term} target="explanation" contentId={explanation.id} label="설명 오류 신고" />
          </View>
        </Card>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 6, paddingVertical: 4 }}>
          <Icon name="info" color={c.text2} size={16} />
          <Txt variant="subhead" color={c.text2} style={{ fontSize: 14 }}>뜻을 읽었다면 퀴즈로 확인해 보세요.</Txt>
        </View>
      )}
    </PushScreen>
  );
}
