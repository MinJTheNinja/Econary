/**
 * 퀴즈 보기·결과 (복습 퀴즈 화면과 학습 세션이 같이 쓴다).
 * 결과는 정답 보기를 초록으로 표시하므로 "정답: …"을 다시 쓰지 않고, 대신
 * '내가 고른 보기가 무엇이었는지'와 '왜 그게 정답인지'를 설명한다.
 */
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';
import type { Quiz, QuizResult } from '../lib/api';
import { radius, size, spring, useTheme } from '../theme';
import { Icon } from '../ui/Icon';
import { Pressy, Reveal, Txt } from '../ui/kit';
import { ReportLink } from './ReportLink';

export type ChoiceState = 'idle' | 'selected' | 'dimmed' | 'correct' | 'wrong' | 'muted';

export const choiceTexts = (quiz: Quiz) => (quiz.kind === 'content' ? quiz.choices : quiz.choices.map((ch) => ch.text));

/** 보기 목록. result 가 있으면 채점 상태로 */
export function ChoiceList({
  texts, selected, result, submitting, onChoose,
}: {
  texts: string[];
  selected: number | null;
  result: Pick<QuizResult, 'answerIndex'> | null;
  submitting?: boolean;
  onChoose: (i: number) => void;
}) {
  const locked = !!submitting || !!result;
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="보기" style={{ gap: 10 }}>
      {texts.map((text, i) => {
        const picked = selected === i;
        const state: ChoiceState = result
          ? i === result.answerIndex ? 'correct' : picked ? 'wrong' : 'muted'
          : picked ? 'selected' : submitting ? 'dimmed' : 'idle';
        return <Choice key={`${i}-${text}`} index={i} text={text} state={state} disabled={locked} onPress={() => onChoose(i)} />;
      })}
    </View>
  );
}

const same = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && a.replace(/\s+/g, '').replace(/[.。]$/, '') === b.replace(/\s+/g, '').replace(/[.。]$/, '');

/**
 * 채점 결과 카드.
 * - 오답: 내가 고른 보기의 정체 (시사 퀴즈: 선지별 설명 / 뜻 퀴즈: 원래 어떤 단어의 뜻인지)
 * - 정답 근거: 정답 선지 설명·문제 해설, 뜻 퀴즈는 단어의 전체 뜻
 * - note: 복습 간격 안내 등 한 줄
 */
export function QuizResultCard({
  quiz, result, wordId, term, meaning, note,
}: {
  quiz: Quiz;
  result: QuizResult;
  wordId: number;
  term: string;
  /** 단어의 전체 뜻 (뜻 퀴즈 해설용) */
  meaning?: string;
  note?: string | null;
}) {
  const { c } = useTheme();
  const wrongLine = result.isCorrect
    ? null
    : quiz.kind === 'meaning'
      ? result.chosenTerm ? `고른 뜻은 ‘${result.chosenTerm}’의 뜻이에요.` : null
      : result.selectedNote;

  // 왜 정답인지: 겹치는 문장은 한 번만
  const why: string[] = [];
  if (quiz.kind === 'meaning') {
    if (meaning) why.push(`‘${term}’: ${meaning}`);
  } else {
    if (result.answerNote && !same(result.answerNote, result.answerText)) why.push(result.answerNote);
    if (result.explanation && !same(result.explanation, result.answerText) && !same(result.explanation, result.answerNote)) {
      why.push(result.explanation);
    }
  }

  return (
    <Reveal delay={80} style={{ marginTop: 6 }}>
      <View
        accessibilityLiveRegion="polite"
        style={{ backgroundColor: c.surface, borderRadius: radius.xl, paddingTop: 16, paddingHorizontal: 18, paddingBottom: 4, gap: 8 }}
      >
        <Txt variant="headline" weight="700" color={result.isCorrect ? c.success : c.danger}>
          {result.isCorrect ? '정답이에요' : '아쉬워요, 오답이에요'}
        </Txt>
        {wrongLine ? (
          <View style={{ gap: 2 }}>
            <Txt variant="footnote" weight="600" color={c.danger}>내가 고른 보기</Txt>
            <Txt variant="subhead">{wrongLine}</Txt>
          </View>
        ) : null}
        {why.length ? (
          <View style={{ gap: 2 }}>
            <Txt variant="footnote" weight="600" color={c.success}>{result.isCorrect ? '해설' : '정답인 이유'}</Txt>
            {why.map((t) => <Txt key={t} variant="subhead" color={c.text}>{t}</Txt>)}
          </View>
        ) : null}
        {note ? <Txt variant="subhead" color={c.text2}>{note}</Txt> : null}
        <View style={{ alignItems: 'flex-end' }}>
          <ReportLink
            wordId={wordId}
            term={term}
            target={quiz.kind === 'content' ? 'quiz' : 'meaning_quiz'}
            contentId={quiz.kind === 'content' ? quiz.contentId : undefined}
            label="퀴즈 오류 신고"
          />
        </View>
      </View>
    </Reveal>
  );
}

/** 보기 (min 56): 빈 링 → 선택 점 (spring.snappy) → 채점 후 체크/엑스. 긴 보기는 줄바꿈 (자르지 않음) */
function Choice({
  index, text, state, disabled, onPress,
}: { index: number; text: string; state: ChoiceState; disabled: boolean; onPress: () => void }) {
  const { c } = useTheme();
  const [bg, border, fg] =
    state === 'selected' ? [c.tint, c.accent, c.text]
    : state === 'correct' ? [c.successBg, c.success, c.text]
    : state === 'wrong' ? [c.dangerBg, c.danger, c.text]
    : state === 'muted' ? [c.surface, c.surface, c.text2]
    : [c.surface, c.surface, c.text];
  const a11yState = state === 'correct' ? ', 정답' : state === 'wrong' ? ', 내가 고른 오답' : '';
  return (
    <Pressy
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityLabel={`${index + 1}번. ${text}${a11yState}`}
      accessibilityState={{ checked: state === 'selected' || state === 'wrong' }}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: size.choice, paddingVertical: 14, paddingHorizontal: 16,
        borderRadius: radius.lg, backgroundColor: bg, borderWidth: 1.5, borderColor: border, opacity: state === 'dimmed' ? 0.55 : 1,
      }}
    >
      <Mark state={state} />
      <Txt variant="callout" color={fg} style={{ flex: 1, flexShrink: 1, lineHeight: 24 }}>{text}</Txt>
    </Pressy>
  );
}

function Mark({ state }: { state: ChoiceState }) {
  const { c } = useTheme();
  if (state === 'selected') {
    return (
      <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: c.accent, alignItems: 'center', justifyContent: 'center' }}>
        <Pop><View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.accent }} /></Pop>
      </View>
    );
  }
  if (state === 'correct' || state === 'wrong') {
    const ok = state === 'correct';
    return (
      <Pop from={0.6}>
        <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: ok ? c.success : c.danger, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={ok ? 'check' : 'x'} color={ok ? c.onSuccess : c.onDanger} size={ok ? 14 : 12} strokeWidth={ok ? 3.2 : 3.6} />
        </View>
      </Pop>
    );
  }
  return <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: c.ring }} />;
}

/** 나타날 때 scale from→1 (spring.snappy, 오버슈트 없음). Reduce Motion 이면 즉시 */
function Pop({ children, from = 0 }: { children: React.ReactNode; from?: number }) {
  const reduce = useReducedMotion();
  const s = useSharedValue(reduce ? 1 : from);
  useEffect(() => {
    if (!reduce) s.value = withSpring(1, { ...spring.snappy, overshootClamping: true });
  }, [reduce, s]);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return <Animated.View style={anim}>{children}</Animated.View>;
}

/** 복습 결과 아래 한 줄: 다음 복습까지 */
export function nextReviewNote(days: number | null | undefined, correct: boolean): string | null {
  if (days === null || days === undefined) return null;
  if (!correct) return '잊기 쉬운 단어예요. 내일 다시 복습해요.';
  return days <= 1 ? '내일 한 번 더 복습해요.' : `기억이 단단해졌어요. ${days}일 뒤에 다시 복습해요.`;
}
