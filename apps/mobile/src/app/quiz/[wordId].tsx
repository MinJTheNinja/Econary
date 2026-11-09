import * as Crypto from 'expo-crypto';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Body, Button, Card, ErrorView, Loading, Screen, colors } from '../../components/ui';
import {
  UnconfirmedError, getQuiz, getTodayAssignment, getTodayReviews, getWords, recordReview, submitQuiz,
  type Quiz, type QuizResult,
} from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useLoad } from '../../lib/useLoad';

type Phase =
  | { t: 'answering' }
  | { t: 'submitting' }
  | { t: 'unconfirmed'; message: string }
  | { t: 'result'; result: QuizResult };

/**
 * 단어별 퀴즈 (PRD 4.1). 서버가 정오를 판정하고, 제출 중 네트워크 오류가 나면 결과를 확정하지 않은 채
 * 같은 시도 id 로 재시도한다 (중복 이력 방지, PRD 5). 확정되면 다음 복습일을 계산해 저장한다.
 */
export default function QuizScreen() {
  const { wordId, context = 'new' } = useLocalSearchParams<{ wordId: string; context?: 'new' | 'review' }>();
  const id = Number(wordId);
  const { session } = useAuth();
  const { data: quiz, error: loadError, reload } = useLoad<Quiz>(async () => {
    const w = (await getWords([id])).get(id);
    if (!w) throw new Error('단어를 찾을 수 없습니다.');
    return getQuiz(id, w.term);
  }, [id]);
  const [selected, setSelected] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase>({ t: 'answering' });
  const attemptId = useRef<string>(Crypto.randomUUID()); // 이 퀴즈 화면의 시도 하나 = id 하나
  const reviewSaved = useRef<Promise<void> | null>(null); // 이 시도의 복습 일정 저장 (한 번만)

  const submit = async () => {
    if (!quiz || selected === null || !session) return;
    setPhase({ t: 'submitting' });
    try {
      const result = await submitQuiz(quiz, id, selected, attemptId.current, context);
      setPhase({ t: 'result', result });
      if (!reviewSaved.current) {
        reviewSaved.current = recordReview(session.user.id, id, result.isCorrect, context).catch(() => {
          reviewSaved.current = null; // 일정 저장만 실패: 퀴즈 결과는 서버에 확정돼 있으니 다음 화면 이동은 막지 않는다
        });
      }
    } catch (e) {
      setPhase({ t: 'unconfirmed', message: e instanceof UnconfirmedError ? e.message : String(e) });
    }
  };

  const goNext = async () => {
    await reviewSaved.current; // 다음 목록이 방금 저장한 복습 일정을 반영하도록
    try {
      if (context === 'review') {
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
      router.dismissTo(context === 'review' ? '/review' : '/');
    }
  };

  if (loadError) return <ErrorView message={loadError} onRetry={reload} />;
  if (!quiz) return <Loading />;

  const texts = quiz.kind === 'content' ? quiz.choices : quiz.choices.map((c) => c.text);
  const locked = phase.t === 'submitting' || phase.t === 'result';
  const result = phase.t === 'result' ? phase.result : null;

  return (
    <Screen>
      <Body muted style={{ fontSize: 13, fontWeight: '600' }}>{context === 'review' ? '복습 · ' : ''}{quiz.kind === 'content' ? '시사 퀴즈' : '뜻 고르기'}</Body>
      <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text, lineHeight: 28 }}>{quiz.question}</Text>

      {texts.map((text, i) => {
        const isSelected = selected === i;
        const isAnswer = result && text === result.answerText;
        const border = isAnswer ? colors.ok : result && isSelected ? colors.bad : isSelected ? colors.accent : colors.line;
        return (
          <Pressable
            key={i}
            disabled={locked}
            onPress={() => { setSelected(i); if (phase.t === 'unconfirmed') setPhase({ t: 'answering' }); }}
            accessibilityRole="radio"
            accessibilityLabel={`${i + 1}번. ${text}`}
            accessibilityState={{ selected: isSelected, disabled: locked }}
          >
            <Card style={{ borderColor: border, borderWidth: isSelected || isAnswer ? 2 : 1, flexDirection: 'row', gap: 10 }}>
              <Text style={{ color: colors.muted, fontWeight: '700' }}>{i + 1}</Text>
              <Text style={{ color: colors.text, fontSize: 15, lineHeight: 22, flex: 1 }}>{text}</Text>
            </Card>
          </Pressable>
        );
      })}

      {phase.t === 'unconfirmed' && (
        <Card style={{ borderColor: colors.warn }}>
          <Body style={{ color: colors.warn, fontWeight: '600' }}>제출 결과가 확정되지 않았어요</Body>
          <Body muted>네트워크 연결을 확인한 뒤 다시 제출해 주세요. 같은 답으로 다시 보내도 한 번만 기록됩니다.</Body>
        </Card>
      )}

      {result ? (
        <View style={{ gap: 12 }}>
          <Card style={{ borderColor: result.isCorrect ? colors.ok : colors.bad }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: result.isCorrect ? colors.ok : colors.bad }}>
              {result.isCorrect ? '정답이에요' : '아쉬워요, 오답이에요'}
            </Text>
            {!result.isCorrect && <Body>정답: {result.answerText}</Body>}
            {result.explanation && <Body muted>{result.explanation}</Body>}
          </Card>
          <Button label={context === 'new' ? '다음 단어' : '다음 복습'} onPress={goNext} />
        </View>
      ) : (
        <Button
          label={phase.t === 'submitting' ? '채점 중…' : phase.t === 'unconfirmed' ? '다시 제출' : '제출'}
          onPress={submit}
          disabled={selected === null || phase.t === 'submitting'}
        />
      )}
    </Screen>
  );
}
