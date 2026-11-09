import * as Crypto from 'expo-crypto';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';
import { ReportLink } from '../../components/ReportLink';
import {
  UnconfirmedError, getQuiz, getTodayAssignment, getTodayReviews, getWords, recordReview, submitQuiz,
  type QuizResult,
} from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useLoad } from '../../lib/useLoad';
import { radius, size, spring, useTheme } from '../../theme';
import { haptic } from '../../ui/haptics';
import { Icon } from '../../ui/Icon';
import { Banner, Button, EmptyState, Pressy, PushScreen, Reveal, Spinner, Txt } from '../../ui/kit';

type Phase =
  | { t: 'answering' }
  | { t: 'submitting' }
  | { t: 'unconfirmed' }
  | { t: 'result'; result: QuizResult };

/**
 * 단어별 퀴즈 (PRD 4.1) — 디자인 '퀴즈' 보드.
 * 서버가 정오를 판정하고, 제출 중 네트워크 오류가 나면 결과를 확정하지 않은 채 같은 시도 id 로 재시도한다.
 * 확정되면 다음 복습일을 계산해 저장한다. 햅틱: 선택 selection, 제출 light, 정답 success, 오답·미확정 warning.
 */
export default function QuizScreen() {
  const { c } = useTheme();
  const { wordId, context = 'new' } = useLocalSearchParams<{ wordId: string; context?: 'new' | 'review' }>();
  const id = Number(wordId);
  const review = context === 'review';
  const { session } = useAuth();
  const { data, error: loadError, reload } = useLoad(async () => {
    const w = (await getWords([id])).get(id);
    if (!w) throw new Error('단어를 찾을 수 없습니다.');
    return { term: w.term, quiz: await getQuiz(id, w.term) };
  }, [id]);
  const [selected, setSelected] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase>({ t: 'answering' });
  const attemptId = useRef<string>(Crypto.randomUUID()); // 이 퀴즈 화면의 시도 하나 = id 하나
  const reviewSaved = useRef<Promise<void> | null>(null); // 이 시도의 복습 일정 저장 (한 번만)
  const quiz = data?.quiz;

  const choose = (i: number) => {
    if (selected !== i) haptic.select();
    setSelected(i);
    if (phase.t === 'unconfirmed') setPhase({ t: 'answering' });
  };

  const submit = async () => {
    if (!quiz || selected === null || !session) return;
    haptic.submit();
    setPhase({ t: 'submitting' });
    try {
      const result = await submitQuiz(quiz, id, selected, attemptId.current, context);
      setPhase({ t: 'result', result });
      if (result.isCorrect) haptic.success();
      else haptic.warning();
      if (!reviewSaved.current) {
        reviewSaved.current = recordReview(session.user.id, id, result.isCorrect, context).catch(() => {
          reviewSaved.current = null; // 일정 저장만 실패: 퀴즈 결과는 서버에 확정돼 있으니 다음 화면 이동은 막지 않는다
        });
      }
    } catch (e) {
      if (!(e instanceof UnconfirmedError)) console.warn('[quiz]', e);
      haptic.warning();
      setPhase({ t: 'unconfirmed' });
    }
  };

  const goNext = async () => {
    await reviewSaved.current; // 다음 목록이 방금 저장한 복습 일정을 반영하도록
    try {
      if (review) {
        const next = (await getTodayReviews()).pending.find((r) => r.wordId !== id);
        router.dismissTo('/review');
        if (next) router.push({ pathname: '/quiz/[wordId]', params: { wordId: String(next.wordId), context: 'review' } });
        return;
      }
      const next = (await getTodayAssignment()).find((a) => !a.quiz_completed_at && a.word_id !== id);
      // 학습·퀴즈 화면이 쌓이지 않도록 목록으로 돌아간 뒤 다음 단어를 연다 (뒤로 = 오늘 목록)
      router.dismissTo('/');
      if (next) router.push(`/study/${next.word_id}`);
    } catch {
      router.dismissTo(review ? '/review' : '/');
    }
  };

  const header = <Stack.Screen options={{ headerBackTitle: review ? '복습' : data?.term ?? '학습' }} />;

  if (loadError) {
    return (
      <PushScreen>
        {header}
        <EmptyState icon="alertCircle" tone="danger" title="퀴즈를 불러오지 못했어요."
          body="네트워크 연결을 확인한 뒤 다시 시도해 주세요." action={{ label: '다시 시도', onPress: reload }} />
      </PushScreen>
    );
  }
  if (!quiz) {
    return <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }}>{header}<Spinner color={c.text2} /></View>;
  }

  const texts = quiz.kind === 'content' ? quiz.choices : quiz.choices.map((ch) => ch.text);
  const result = phase.t === 'result' ? phase.result : null;
  const submitting = phase.t === 'submitting';
  const locked = submitting || !!result;
  const correctIdx = result ? texts.indexOf(result.answerText) : -1;
  const kindLabel = `${review ? '복습 · ' : ''}${quiz.kind === 'content' ? '시사 퀴즈' : '뜻 고르기'}`;
  const resultNote = result?.explanation ?? (review ? (result?.isCorrect ? '다음 복습까지 간격이 늘어났어요.' : '내일 다시 복습해요.') : null);

  const footer = result ? (
    <Button label={review ? '다음 복습' : '다음 단어'} onPress={goNext} />
  ) : (
    <Button
      label={submitting ? '채점 중…' : phase.t === 'unconfirmed' ? '다시 제출' : '제출'}
      onPress={submit}
      loading={submitting}
      disabled={selected === null}
    />
  );

  return (
    <PushScreen footer={footer} gap={10}>
      {header}
      <View style={{ alignSelf: 'flex-start', backgroundColor: c.tint, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 4 }}>
        <Txt variant="footnote" color={c.onTint}>{kindLabel}</Txt>
      </View>
      <Txt variant="question" accessibilityRole="header" style={{ marginHorizontal: 4, marginTop: 4, marginBottom: 8 }}>{quiz.question}</Txt>

      <View accessibilityRole="radiogroup" accessibilityLabel="보기" style={{ gap: 10 }}>
        {texts.map((text, i) => {
          const picked = selected === i;
          const state: ChoiceState = result
            ? i === correctIdx ? 'correct' : picked ? 'wrong' : 'muted'
            : picked ? 'selected' : submitting ? 'dimmed' : 'idle';
          return <Choice key={i} index={i} text={text} state={state} disabled={locked} onPress={() => choose(i)} />;
        })}
      </View>

      {phase.t === 'unconfirmed' && (
        <View style={{ marginTop: 6 }}>
          <Banner
            tone="warning" live="assertive"
            title="제출 결과가 확정되지 않았어요"
            body="네트워크 연결을 확인한 뒤 다시 제출해 주세요. 같은 답으로 다시 보내도 한 번만 기록됩니다."
          />
        </View>
      )}

      {result && (
        <Reveal delay={80} style={{ marginTop: 6 }}>
          <View
            accessibilityLiveRegion="polite"
            style={{ backgroundColor: c.surface, borderRadius: radius.xl, paddingTop: 16, paddingHorizontal: 18, paddingBottom: 4, gap: 6 }}
          >
            <Txt variant="headline" weight="700" color={result.isCorrect ? c.success : c.danger}>
              {result.isCorrect ? '정답이에요' : '아쉬워요, 오답이에요'}
            </Txt>
            {!result.isCorrect && (
              <Txt variant="subhead"><Txt variant="subhead" weight="600">정답:</Txt> {result.answerText}</Txt>
            )}
            {resultNote ? <Txt variant="subhead" color={c.text2}>{resultNote}</Txt> : null}
            <View style={{ alignItems: 'flex-end' }}>
              <ReportLink
                wordId={id}
                term={data?.term}
                target={quiz.kind === 'content' ? 'quiz' : 'meaning_quiz'}
                contentId={quiz.kind === 'content' ? quiz.contentId : undefined}
                label="퀴즈 오류 신고"
              />
            </View>
          </View>
        </Reveal>
      )}
    </PushScreen>
  );
}

type ChoiceState = 'idle' | 'selected' | 'dimmed' | 'correct' | 'wrong' | 'muted';

/** 보기 (min 56): 빈 링 → 선택 점 (spring.snappy) → 채점 후 체크/엑스 */
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
      <Txt variant="callout" color={fg} style={{ flex: 1, lineHeight: 24 }}>{text}</Txt>
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
