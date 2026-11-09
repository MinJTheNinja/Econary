import { router, Stack, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ReportLink } from '../../components/ReportLink';
import { getExplanation, getTodayAssignment, getWords, markViewed } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useLoad } from '../../lib/useLoad';
import { categoryColor, onCategory, useTheme } from '../../theme';
import { Accordion, CategoryChip, ConceptDiagram, Rings } from '../../ui/deck';
import { Icon } from '../../ui/Icon';
import { Button, EmptyState, PushScreen, Spinner, Txt } from '../../ui/kit';

const SOURCE: Record<string, string> = { ytn: 'YTN', hankyung: '한국경제', manual: '' };
const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * 단어 학습 (PRD 3.2) — '최신 UI' 시안 '통합 학습' 보드.
 * 분야 색 헤더(용어) + 흰 시트(뜻 · 개념 그림 · 요즘 뉴스에서) → 퀴즈. 기사 원문·링크는 보여주지 않는다.
 * 화면을 열면 '콘텐츠 확인'으로 기록.
 */
export default function StudyScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
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
    return { word, explanation, position: pos >= 0 ? `${pad2(pos + 1)} / ${pad2(today.length)}` : null };
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
  const color = categoryColor(word.category);
  const concept = word.concept &&Array.isArray(word.concept.nodes) && word.concept.nodes.length >= 2 ? word.concept : null;
  const divider = <View style={{ height: 0.5, backgroundColor: c.separator, marginVertical: 4 }} />;

  return (
    <View style={{ flex: 1, backgroundColor: c.surface }}>
      <StatusBar style="light" />
      <Stack.Screen
        options={{
          headerStyle: { backgroundColor: color },
          headerTintColor: onCategory.text,
          headerRight: position
            ? () => <Txt variant="subhead" color={onCategory.text2} style={{ fontVariant: ['tabular-nums'], paddingHorizontal: 4 }}>{position}</Txt>
            : undefined,
        }}
      />
      {/* 위로 당겼을 때도 헤더 색이 이어지도록 */}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 320, backgroundColor: color }} />
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <View style={{ backgroundColor: color, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40, gap: 10, overflow: 'hidden' }}>
          <Rings size={260} style={{ top: -110, right: -90 }} />
          <CategoryChip label={word.category || '시사 어휘'} onColor />
          <View style={{ gap: 2 }}>
            <Txt variant="term" color={onCategory.text} accessibilityRole="header">{word.term}</Txt>
            {word.english_name ? <Txt variant="subhead" color={onCategory.text2}>{word.english_name}</Txt> : null}
          </View>
        </View>

        <View style={{ flexGrow: 1, backgroundColor: c.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, marginTop: -24, paddingHorizontal: 20, paddingTop: 22, paddingBottom: 16, gap: 10 }}>
          <Txt variant="footnote" color={c.accent}>뜻</Txt>
          <Txt variant="body">{word.meaning}</Txt>
          <View style={{ alignItems: 'flex-end', marginTop: -6 }}>
            <ReportLink wordId={word.id} term={word.term} target="word_meaning" label="뜻 오류 신고" />
          </View>

          {concept ? (
            <>
              {divider}
              <Txt variant="footnote" color={c.accent}>개념 그림{concept.title ? ` · ${concept.title}` : ''}</Txt>
              <ConceptDiagram nodes={concept.nodes} kind={concept.kind} term={word.term} />
            </>
          ) : null}

          {explanation ? (
            <>
              {divider}
              <Accordion
                label={`요즘 뉴스에서${explanation.topic ? `: ${explanation.topic}` : ''}. 펼치기`}
                header={
                  <View style={{ gap: 2 }}>
                    <Txt variant="footnote" color={c.accent}>요즘 뉴스에서</Txt>
                    {explanation.topic ? <Txt variant="headline">{explanation.topic}</Txt> : null}
                  </View>
                }
              >
                <Txt variant="callout">{explanation.body}</Txt>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Txt variant="caption" color={c.text2} style={{ flex: 1 }}>
                    {SOURCE[explanation.source] ? `${SOURCE[explanation.source]} 보도 참고 · 자체 요약` : '자체 요약'}
                  </Txt>
                  <ReportLink wordId={word.id} term={word.term} target="explanation" contentId={explanation.id} label="설명 오류 신고" />
                </View>
              </Accordion>
            </>
          ) : (
            <>
              {divider}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 }}>
                <Icon name="info" color={c.text2} size={16} />
                <Txt variant="subhead" color={c.text2} style={{ fontSize: 14 }}>뜻을 읽었다면 퀴즈로 확인해 보세요.</Txt>
              </View>
            </>
          )}
        </View>
      </ScrollView>
      <View style={{ backgroundColor: c.surface, paddingHorizontal: 16, paddingTop: 8, paddingBottom: Math.max(insets.bottom, 12) + 8 }}>
        <Button label="퀴즈 풀기" onPress={() => router.push(`/quiz/${id}`)} />
      </View>
    </View>
  );
}
