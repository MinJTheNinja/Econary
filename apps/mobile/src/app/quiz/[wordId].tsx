import * as Crypto from 'expo-crypto';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import { ChoiceList, QuizResultCard, choiceTexts, nextReviewNote } from '../../components/Quiz';
import {
  UnconfirmedError, getQuiz, getTodayReviews, getWords, recordReview, submitQuiz,
  type QuizResult,
} from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { isToss } from '../../lib/target';
import { useLoad } from '../../lib/useLoad';
import { radius, useTheme } from '../../theme';
import { haptic } from '../../ui/haptics';
import { Banner, Button, EmptyState, PushScreen, Spinner, Txt } from '../../ui/kit';

type Phase =
  | { t: 'answering' }
  | { t: 'submitting' }
  | { t: 'unconfirmed' }
  | { t: 'result'; result: QuizResult };

/**
 * 단어별 퀴즈 (PRD 4.1) — 복습 탭에서 연다 (새 단어 학습은 학습 세션 /session).
 * 서버가 정오를 판정하고, 제출 중 네트워크 오류가 나면 결과를 확정하지 않은 채 같은 시도 id 로 재시도한다.
 * 확정되면 기억 모델(core/memory)로 다음 복습일을 계산해 저장한다.
 */
export default function QuizScreen() {
  const { c } = useTheme();
  const { wordId, context = 'review' } = useLocalSearchParams<{ wordId: string; context?: 'new' | 'review' }>();
  const id = Number(wordId);
  const review = context === 'review';
  const { session } = useAuth();
  const { data, error: loadError, reload } = useLoad(async () => {
    const w = (await getWords([id])).get(id);
    if (!w) throw new Error('단어를 찾을 수 없습니다.');
    return { term: w.term, meaning: w.meaning, quiz: await getQuiz(id, w.term) };
  }, [id]);
  const [selected, setSelected] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase>({ t: 'answering' });
  const [nextDays, setNextDays] = useState<number | null>(null);
  const attemptId = useRef<string>(Crypto.randomUUID()); // 이 퀴즈 화면의 시도 하나 = id 하나
  const reviewSaved = useRef<Promise<unknown> | null>(null); // 이 시도의 복습 일정 저장 (한 번만)
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
        reviewSaved.current = recordReview(session.user.id, id, result.isCorrect, context)
          .then((s) => setNextDays(s?.intervalDays ?? null))
          .catch(() => {
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
    if (!review) return router.back();
    try {
      const next = (await getTodayReviews()).pending.find((r) => r.wordId !== id);
      router.dismissTo('/review');
      if (next) router.push({ pathname: '/quiz/[wordId]', params: { wordId: String(next.wordId), context: 'review' } });
    } catch {
      router.dismissTo('/review');
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
  if (!quiz || !data) {
    return <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }}>{header}<Spinner color={c.text2} /></View>;
  }

  const result = phase.t === 'result' ? phase.result : null;
  const submitting = phase.t === 'submitting';
  const kindLabel = `${review ? '복습 · ' : ''}${quiz.kind === 'content' ? '시사 퀴즈' : '뜻 고르기'}${isToss && quiz.kind === 'content' ? ' · AI 초안을 운영자가 검토' : ''}`; // 앱인토스: 생성형 AI 결과물 고지

  const footer = result ? (
    <Button label={review ? '다음 복습' : '확인'} onPress={goNext} />
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

      <ChoiceList texts={choiceTexts(quiz)} selected={selected} result={result} submitting={submitting} onChoose={choose} />

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
        <QuizResultCard
          quiz={quiz} result={result} wordId={id} term={data.term} meaning={data.meaning}
          note={review ? nextReviewNote(nextDays, result.isCorrect) : null}
        />
      )}
    </PushScreen>
  );
}
