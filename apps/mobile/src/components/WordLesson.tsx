/**
 * 단어 한 장 (분야 색 헤더 + 흰 시트: 뜻 · 개념 그림 · 요즘 뉴스에서).
 * 단어 상세 화면(study/[wordId])과 학습 세션의 '배우기' 단계가 같이 쓴다. 기사 원문·링크는 보여주지 않는다.
 */
import { ScrollView, View } from 'react-native';
import type { Explanation, Word } from '../lib/api';
import { isToss } from '../lib/target';
import { categoryColor, onCategory, useTheme } from '../theme';
import { Accordion, CategoryChip, ConceptDiagram, Rings } from '../ui/deck';
import { Icon } from '../ui/Icon';
import { Txt } from '../ui/kit';
import { ReportLink } from './ReportLink';

const SOURCE: Record<string, string> = { ytn: 'YTN', hankyung: '한국경제', manual: '' };

export function WordLesson({
  word, explanation, topRight, hint = '뜻을 읽었다면 퀴즈로 확인해 보세요.', topPad = 8, newsOpen = false,
}: {
  word: Word;
  explanation: Explanation | null;
  /** 헤더 오른쪽 위 (예: '03 / 10') */
  topRight?: React.ReactNode;
  hint?: string;
  topPad?: number;
  /** 뉴스 설명을 처음부터 펼쳐 둘지 */
  newsOpen?: boolean;
}) {
  const { c } = useTheme();
  const color = categoryColor(word.category);
  const concept = word.concept && Array.isArray(word.concept.nodes) && word.concept.nodes.length >= 2 ? word.concept : null;
  const divider = <View style={{ height: 0.5, backgroundColor: c.separator, marginVertical: 4 }} />;

  return (
    <View style={{ flex: 1, backgroundColor: c.surface }}>
      {/* 위로 당겼을 때도 헤더 색이 이어지도록 */}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 320, backgroundColor: color }} />
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <View style={{ backgroundColor: color, paddingHorizontal: 20, paddingTop: topPad, paddingBottom: 40, gap: 10, overflow: 'hidden' }}>
          <Rings size={260} style={{ top: -110, right: -90 }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <CategoryChip label={word.category || '시사 어휘'} onColor />
            {topRight}
          </View>
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
                initiallyOpen={newsOpen}
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
                    {/* 앱인토스 정책: 생성형 AI 결과물은 알린다 */}
                    {isToss ? ' · AI 초안을 운영자가 검토' : ''}
                  </Txt>
                  <ReportLink wordId={word.id} term={word.term} target="explanation" contentId={explanation.id} label="설명 오류 신고" />
                </View>
              </Accordion>
            </>
          ) : hint ? (
            <>
              {divider}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 }}>
                <Icon name="info" color={c.text2} size={16} />
                <Txt variant="subhead" color={c.text2} style={{ fontSize: 14 }}>{hint}</Txt>
              </View>
            </>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}
