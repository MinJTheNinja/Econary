import { shuffle } from '@tesat/core';
import * as Crypto from 'expo-crypto';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChoiceList, QuizResultCard, choiceTexts } from '../components/Quiz';
import { WordLesson } from '../components/WordLesson';
import {
  UnconfirmedError, getExplanations, getQuiz, getTodayAssignment, getWords, markViewed, recordReview, regrade, submitQuiz,
  type Explanation, type Quiz, type QuizResult, type Word,
} from '../lib/api';
import { useAuth } from '../lib/auth';
import { useLoad } from '../lib/useLoad';
import { radius, useTheme } from '../theme';
import { haptic } from '../ui/haptics';
import { Icon } from '../ui/Icon';
import { Banner, Button, EmptyState, Pressy, Spinner, Txt } from '../ui/kit';

/**
 * 오늘의 학습 세션: 배우기 → 섞어서 떠올리기 → 틀린 건 다시.
 *
 * 단어를 읽자마자 같은 단어 퀴즈를 풀면 방금 본 답을 고르는 것이라 떠올리는 노력이 거의 없다.
 * 그래서 단어를 CHUNK 개씩 묶어 먼저 모두 배우고, 묶음의 퀴즈를 배운 순서와 다르게 섞어 푼다
 * (다른 단어를 거친 뒤 꺼내 쓰는 인출 연습 + 인터리빙). 틀린 단어는 해설을 본 뒤 묶음 끝에서 다시 푼다.
 *
 * 서버 기록은 단어마다 첫 시도 한 번 (학습 완료 + 기억 모델 첫 일정). '다시' 문제는 이미 받은 정답으로 채점만 한다.
 */
const CHUNK = 5;
const MAX_RETRIES = 2;

interface Item { wordId: number; retry: number }
type Stage =
  | { t: 'learn'; chunk: number; i: number }
  | { t: 'recall'; chunk: number; queue: Item[] }
  | { t: 'done' };

export default function SessionScreen() {
  const { c } = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id;
  // 퀴즈·첫 결과 기억은 이번 세션에서만
  useEffect(() => {
    quizCache.clear();
    firstCache.clear();
  }, []);

  const { data, error, reload } = useLoad(async () => {
    const todo = (await getTodayAssignment()).filter((a) => !a.quiz_completed_at).map((a) => a.word_id);
    const [words, explanations] = await Promise.all([getWords(todo), getExplanations(todo)]);
    const ids = todo.filter((id) => words.has(id));
    const chunks: number[][] = [];
    for (let i = 0; i < ids.length; i += CHUNK) chunks.push(ids.slice(i, i + CHUNK));
    return { chunks, words, explanations, total: ids.length };
  }, []);

  const [stage, setStage] = useState<Stage>({ t: 'learn', chunk: 0, i: 0 });
  const [firstResults, setFirstResults] = useState<Map<number, boolean>>(new Map());
  const [retried, setRetried] = useState<Set<number>>(new Set());

  if (error) {
    return (
      <Shell onClose={() => router.back()}>
        <EmptyState icon="alertCircle" tone="danger" title="오늘의 단어를 불러오지 못했어요."
          body="네트워크 연결을 확인한 뒤 다시 시도해 주세요." action={{ label: '다시 시도', onPress: reload }} />
      </Shell>
    );
  }
  if (!data) {
    return <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }}><Spinner color={c.text2} /></View>;
  }
  if (!data.total) {
    return (
      <Shell onClose={() => router.back()}>
        <EmptyState icon="bookCheck" tone="success" title="오늘 배울 단어를 모두 마쳤어요." body="복습 탭에서 오늘 볼 단어를 확인하세요."
          action={{ label: '오늘 탭으로', onPress: () => router.back() }} />
      </Shell>
    );
  }

  const { chunks, words, explanations, total } = data;
  const doneCount = firstResults.size;

  if (stage.t === 'done') {
    const correct = [...firstResults.values()].filter(Boolean).length;
    return (
      <Shell onClose={() => router.back()}>
        <View style={{ flex: 1, justifyContent: 'center', gap: 16, paddingHorizontal: 8 }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: c.successBg, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' }}>
            <Icon name="check" color={c.success} size={32} strokeWidth={3} />
          </View>
          <Txt variant="title" style={{ textAlign: 'center' }} accessibilityRole="header">오늘의 새 단어를 마쳤어요</Txt>
          <Txt variant="subhead" color={c.text2} style={{ textAlign: 'center' }}>
            {doneCount}개 중 {correct}개를 처음에 맞혔어요.
            {retried.size ? ` 헷갈린 ${retried.size}개는 다시 풀어 확인했어요.` : ''}
          </Txt>
          <Txt variant="subhead" color={c.text2} style={{ textAlign: 'center' }}>
            잊어 갈 때쯤 복습 탭에 다시 나와요. 그때 떠올려 보면 오래 기억에 남아요.
          </Txt>
        </View>
        <Button label="오늘 탭으로" onPress={() => router.back()} />
      </Shell>
    );
  }

  const chunkIds = chunks[stage.chunk];
  const progress = doneCount / total;
  const nextChunk = () => {
    if (stage.chunk + 1 < chunks.length) setStage({ t: 'learn', chunk: stage.chunk + 1, i: 0 });
    else setStage({ t: 'done' });
  };

  if (stage.t === 'learn') {
    const id = chunkIds[stage.i];
    const last = stage.i === chunkIds.length - 1;
    return (
      <Learn
        key={id}
        word={words.get(id)!}
        explanation={explanations.get(id) ?? null}
        userId={userId}
        step={`배우기 ${stage.i + 1} / ${chunkIds.length}`}
        progress={progress}
        nextLabel={last ? '섞어서 퀴즈로 떠올리기' : '다음 단어'}
        onNext={() => {
          haptic.select();
          if (!last) return setStage({ ...stage, i: stage.i + 1 });
          // 배운 순서와 다르게: 섞되, 방금 본 단어가 맨 앞에 오지 않게
          let order = shuffle(chunkIds);
          if (order.length > 1 && order[0] === id) order = [...order.slice(1), order[0]];
          setStage({ t: 'recall', chunk: stage.chunk, queue: order.map((w) => ({ wordId: w, retry: 0 })) });
        }}
        onBack={stage.i > 0 ? () => setStage({ ...stage, i: stage.i - 1 }) : undefined}
      />
    );
  }

  const item = stage.queue[0];
  return (
    <Recall
      key={`${item.wordId}-${item.retry}`}
      item={item}
      word={words.get(item.wordId)!}
      userId={userId}
      step={`떠올리기 · 남은 문제 ${stage.queue.length}`}
      progress={progress}
      onFirstResult={(ok) => setFirstResults((m) => new Map(m).set(item.wordId, ok))}
      onNext={(ok) => {
        const rest = stage.queue.slice(1);
        if (!ok && item.retry < MAX_RETRIES) {
          setRetried((s) => new Set(s).add(item.wordId));
          rest.push({ wordId: item.wordId, retry: item.retry + 1 });
        }
        if (rest.length) setStage({ ...stage, queue: rest });
        else nextChunk();
      }}
    />
  );
}

/** 세션 공통 틀: 위 닫기 + 진행 막대 */
function Shell({
  children, onClose, step, progress,
}: { children: React.ReactNode; onClose: () => void; step?: string; progress?: number }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top + 6, paddingBottom: Math.max(insets.bottom, 12) + 8, paddingHorizontal: 16, gap: 12 }}>
      <StatusBar style="auto" />
      <TopBar onClose={onClose} step={step} progress={progress} />
      {children}
    </View>
  );
}

function TopBar({ onClose, step, progress }: { onClose: () => void; step?: string; progress?: number }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Pressy onPress={onClose} accessibilityLabel="학습 닫기" style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="x" color={c.text2} size={20} />
      </Pressy>
      {progress !== undefined ? (
        <View style={{ flex: 1, gap: 4 }}>
          {step ? <Txt variant="footnote" color={c.text2} weight="500">{step}</Txt> : null}
          <View style={{ height: 6, borderRadius: 3, backgroundColor: c.separator, overflow: 'hidden' }}
            accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}>
            <View style={{ width: `${Math.round(progress * 100)}%`, height: 6, borderRadius: 3, backgroundColor: c.accent }} />
          </View>
        </View>
      ) : <View style={{ flex: 1 }} />}
    </View>
  );
}

function Learn({
  word, explanation, userId, step, progress, nextLabel, onNext, onBack,
}: {
  word: Word; explanation: Explanation | null; userId?: string; step: string; progress: number;
  nextLabel: string; onNext: () => void; onBack?: () => void;
}) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  useEffect(() => {
    if (userId) markViewed(userId, word.id).catch(() => {}); // 기록 실패해도 학습은 계속 (퀴즈 제출 때 서버가 함께 채움)
  }, [userId, word.id]);
  return (
    <View style={{ flex: 1, backgroundColor: c.surface }}>
      <StatusBar style="auto" />
      <View style={{ backgroundColor: c.bg, paddingTop: insets.top + 6, paddingHorizontal: 16, paddingBottom: 8 }}>
        <TopBar onClose={() => router.back()} step={step} progress={progress} />
      </View>
      <WordLesson word={word} explanation={explanation} hint="" topPad={14} newsOpen />
      <View style={{ backgroundColor: c.surface, paddingHorizontal: 16, paddingTop: 8, paddingBottom: Math.max(insets.bottom, 12) + 8, gap: 4 }}>
        <Button label={nextLabel} onPress={onNext} />
        {onBack ? (
          <Pressy onPress={onBack} accessibilityLabel="이전 단어" style={{ minHeight: 40, alignItems: 'center', justifyContent: 'center' }}>
            <Txt variant="subhead" color={c.text2} weight="500">이전 단어</Txt>
          </Pressy>
        ) : null}
      </View>
    </View>
  );
}

type Phase =
  | { t: 'answering' }
  | { t: 'submitting' }
  | { t: 'unconfirmed' }
  | { t: 'result'; result: QuizResult };

// 단어별 퀴즈와 첫 결과는 세션 동안 기억한다 (다시 풀 때 같은 문제, 보기 순서만 새로)
const quizCache = new Map<number, Promise<Quiz>>();
const firstCache = new Map<number, QuizResult>();

function Recall({
  item, word, userId, step, progress, onFirstResult, onNext,
}: {
  item: Item; word: Word; userId?: string; step: string; progress: number;
  onFirstResult: (correct: boolean) => void; onNext: (correct: boolean) => void;
}) {
  const { c } = useTheme();
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase>({ t: 'answering' });
  const attemptId = useRef(Crypto.randomUUID());
  // 다시 푸는 문제는 보기 순서를 새로 섞는다 (위치로 외우지 않게): perm[화면] = 원래 화면 위치
  const perm = useMemo(() => {
    const first = firstCache.get(item.wordId);
    return item.retry > 0 && first && quiz ? shuffle(choiceTexts(quiz).map((_, i) => i)) : null;
  }, [item, quiz]);

  useEffect(() => {
    let p = quizCache.get(item.wordId);
    if (!p) {
      p = getQuiz(item.wordId, word.term);
      quizCache.set(item.wordId, p);
      p.catch(() => quizCache.delete(item.wordId));
    }
    p.then(setQuiz, () => setLoadError(true));
  }, [item.wordId, word.term]);

  if (loadError) {
    return (
      <Shell onClose={() => router.back()} step={step} progress={progress}>
        <EmptyState icon="alertCircle" tone="danger" title="퀴즈를 불러오지 못했어요."
          body="네트워크 연결을 확인한 뒤 다시 시도해 주세요." action={{ label: '건너뛰기', onPress: () => onNext(true) }} />
      </Shell>
    );
  }
  if (!quiz) {
    return <Shell onClose={() => router.back()} step={step} progress={progress}><View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Spinner color={c.text2} /></View></Shell>;
  }

  const baseTexts = choiceTexts(quiz);
  const texts = perm ? perm.map((i) => baseTexts[i]) : baseTexts;
  const toBase = (shown: number) => (perm ? perm[shown] : shown);
  const fromBase = (r: QuizResult): QuizResult =>
    perm ? { ...r, answerIndex: perm.indexOf(r.answerIndex), notes: perm.map((i) => r.notes[i] ?? null) } : r;
  const result = phase.t === 'result' ? phase.result : null;
  const submitting = phase.t === 'submitting';

  const choose = (i: number) => {
    if (selected !== i) haptic.select();
    setSelected(i);
    if (phase.t === 'unconfirmed') setPhase({ t: 'answering' });
  };

  const submit = async () => {
    if (selected === null || !userId) return;
    haptic.submit();
    const first = firstCache.get(item.wordId);
    if (first) {
      // 이미 서버에 기록한 단어: 받은 정답으로 채점만
      const r = fromBase(regrade(first, toBase(selected)));
      setPhase({ t: 'result', result: r });
      if (r.isCorrect) haptic.success();
      else haptic.warning();
      return;
    }
    setPhase({ t: 'submitting' });
    try {
      const r = await submitQuiz(quiz, item.wordId, selected, attemptId.current, 'new');
      firstCache.set(item.wordId, r);
      setPhase({ t: 'result', result: r });
      onFirstResult(r.isCorrect);
      if (r.isCorrect) haptic.success();
      else haptic.warning();
      recordReview(userId, item.wordId, r.isCorrect, 'new').catch(() => {}); // 일정 저장 실패는 학습을 막지 않는다
    } catch (e) {
      if (!(e instanceof UnconfirmedError)) console.warn('[session]', e);
      haptic.warning();
      setPhase({ t: 'unconfirmed' });
    }
  };

  const retryNote = result && !result.isCorrect && item.retry < MAX_RETRIES ? '해설을 읽어 두세요. 이 묶음 끝에서 한 번 더 나와요.' : null;

  return (
    <Shell onClose={() => router.back()} step={item.retry ? `다시 풀기 · ${step.split(' · ')[1] ?? ''}` : step} progress={progress}>
      <ScrollView contentContainerStyle={{ gap: 10, paddingBottom: 8 }} style={{ flex: 1 }}>
        <View style={{ alignSelf: 'flex-start', backgroundColor: c.tint, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 4 }}>
          <Txt variant="footnote" color={c.onTint}>{item.retry ? '다시 확인' : quiz.kind === 'content' ? '시사 퀴즈' : '뜻 고르기'}</Txt>
        </View>
        <Txt variant="question" accessibilityRole="header" style={{ marginHorizontal: 4, marginTop: 4, marginBottom: 8 }}>{quiz.question}</Txt>
        <ChoiceList texts={texts} selected={selected} result={result} submitting={submitting} onChoose={choose} />
        {phase.t === 'unconfirmed' && (
          <Banner tone="warning" live="assertive" title="제출 결과가 확정되지 않았어요"
            body="네트워크 연결을 확인한 뒤 다시 제출해 주세요. 같은 답으로 다시 보내도 한 번만 기록됩니다." />
        )}
        {result ? (
          <QuizResultCard quiz={quiz} result={result} wordId={item.wordId} term={word.term} meaning={word.meaning} note={retryNote} />
        ) : null}
      </ScrollView>
      {result ? (
        <Button label="다음" onPress={() => onNext(result.isCorrect)} />
      ) : (
        <Button
          label={submitting ? '채점 중…' : phase.t === 'unconfirmed' ? '다시 제출' : '확인'}
          onPress={submit}
          loading={submitting}
          disabled={selected === null}
        />
      )}
    </Shell>
  );
}
