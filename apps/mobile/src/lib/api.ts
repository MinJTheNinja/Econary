/**
 * 학습자 API. 모든 호출은 publishable 키 + 본인 세션으로 나가고 RLS·RPC 가 권한을 판단한다.
 * 정답·정오 판정은 서버 RPC 가 하며, 이 모듈은 정답을 미리 알지 못한다.
 */
import {
  NEW_REVIEW_STATE,
  buildTodayReviewList,
  computeOverallProgress,
  computeDayStatuses,
  computeStreak,
  computeTodayProgress,
  scheduleNextReview,
  studyDate,
  weekStart,
  addDays,
  type AssignmentRow,
  type AttemptRow,
  type DayCell,
  type OverallProgress,
  type ReviewState,
  type ScheduleRow,
  type TodayProgress,
} from '@tesat/core';
import { supabase } from './supabase';

export interface Level {
  level: string;
  label: string;
  daily_new_count: number;
}

export interface Word {
  id: number;
  term: string;
  english_name: string | null;
  meaning: string;
  importance: number;
  category: string | null;
  /** 개념 그림 (없으면 null) */
  concept: Concept | null;
}

export interface Concept {
  title?: string;
  kind: 'cycle' | 'flow';
  nodes: string[];
}

export interface Assignment {
  word_id: number;
  position: number;
  content_viewed_at: string | null;
  quiz_completed_at: string | null;
}

export interface Explanation {
  id: number;
  body: string;
  topic: string | null;
  source: string;
}

/** 검수 승인된 시사 퀴즈 (정답 없음) 또는 뜻 고르기 퀴즈 */
export type Quiz =
  | { kind: 'content'; contentId: number; question: string; choices: string[] }
  | { kind: 'meaning'; question: string; choices: { wordId: number; text: string }[] };

export interface QuizResult {
  isCorrect: boolean;
  answerText: string;
  explanation: string | null;
}

/** 네트워크/서버 오류: 결과가 확정되지 않았으니 같은 시도 id 로 재시도해야 한다 (PRD 4.1) */
export class UnconfirmedError extends Error {}

/** 오류면 throw, 데이터가 없으면 throw (빈 배열은 정상). null 이 정상인 조회(maybeSingle)는 checkMaybe. */
function check<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  if (res.data === null) throw new Error('응답이 비어 있습니다.');
  return res.data;
}

function checkMaybe<T>(res: { data: T | null; error: { message: string } | null }): T | null {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

// ───────── 수준 (PRD 3.1) ─────────

export async function getLevels(): Promise<Level[]> {
  return check(await supabase.from('level_settings').select('level, label, daily_new_count').order('sort_order'));
}

export async function getMyLevel(): Promise<string> {
  const row = check<{ level: string }>(await supabase.from('profiles').select('level').single());
  return row.level;
}

export async function setMyLevel(level: string, userId: string): Promise<void> {
  checkMaybe(await supabase.from('profiles').update({ level }).eq('user_id', userId));
}

// ───────── 오늘의 신규 학습 (PRD 3.2) ─────────

export async function getTodayAssignment(): Promise<Assignment[]> {
  return check(await supabase.rpc('get_or_create_today_assignment')) as Assignment[];
}

export async function getWords(ids: number[]): Promise<Map<number, Word>> {
  if (!ids.length) return new Map();
  const rows = check(await supabase.from('words').select('id, term, english_name, meaning, importance, category, concept').in('id', ids));
  return new Map((rows as Word[]).map((w) => [w.id, w]));
}

export async function getExplanation(wordId: number): Promise<Explanation | null> {
  const rows = check(
    await supabase
      .from('word_contents')
      .select('id, body, topic, source')
      .eq('word_id', wordId)
      .eq('kind', 'explanation')
      .order('source_date', { ascending: false, nullsFirst: false })
      .limit(1),
  );
  return (rows as Explanation[])[0] ?? null;
}

/** 오늘 학습일의 배정 항목에 '콘텐츠 확인' 기록 (학습 완료 조건의 절반) */
export async function markViewed(userId: string, wordId: number): Promise<void> {
  checkMaybe(
    await supabase
      .from('daily_assignments')
      .update({ content_viewed_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('assign_date', studyDate())
      .eq('word_id', wordId)
      .is('content_viewed_at', null),
  );
}

// ───────── 퀴즈 (PRD 4.1) ─────────

export async function getQuiz(wordId: number, term: string): Promise<Quiz> {
  const rows = check(
    await supabase
      .from('word_contents')
      .select('id, body, choices')
      .eq('word_id', wordId)
      .eq('kind', 'quiz')
      .order('source_date', { ascending: false, nullsFirst: false })
      .limit(1),
  ) as { id: number; body: string; choices: string[] }[];
  if (rows[0]) return { kind: 'content', contentId: rows[0].id, question: rows[0].body, choices: rows[0].choices };

  const choices = check(await supabase.rpc('get_meaning_quiz', { p_word_id: wordId })) as { choice_word_id: number; text: string }[];
  return {
    kind: 'meaning',
    question: `'${term}'의 뜻으로 알맞은 것은?`,
    choices: choices.map((c) => ({ wordId: c.choice_word_id, text: c.text })),
  };
}

/**
 * 답 제출. clientAttemptId 는 퀴즈를 열 때 한 번 만들고 재시도에도 그대로 써야 한다
 * (서버가 같은 id 의 두 번째 제출을 새 시도로 세지 않는다). 실패하면 UnconfirmedError.
 */
export async function submitQuiz(
  quiz: Quiz,
  wordId: number,
  selected: number,
  clientAttemptId: string,
  context: 'new' | 'review',
): Promise<QuizResult> {
  try {
    if (quiz.kind === 'content') {
      const { data, error } = await supabase.rpc('submit_quiz_attempt', {
        p_client_attempt_id: clientAttemptId,
        p_content_id: quiz.contentId,
        p_selected_index: selected,
        p_context: context,
      });
      if (error) throw error;
      const r = (data as { is_correct: boolean; answer_index: number; answer_explanation: string }[])[0];
      return { isCorrect: r.is_correct, answerText: quiz.choices[r.answer_index], explanation: r.answer_explanation };
    }
    const { data, error } = await supabase.rpc('submit_meaning_quiz', {
      p_client_attempt_id: clientAttemptId,
      p_word_id: wordId,
      p_selected_word_id: quiz.choices[selected].wordId,
      p_context: context,
    });
    if (error) throw error;
    const r = (data as { is_correct: boolean; answer_text: string }[])[0];
    return { isCorrect: r.is_correct, answerText: r.answer_text, explanation: null };
  } catch (e) {
    throw new UnconfirmedError(e instanceof Error ? e.message : String(e));
  }
}

// ───────── 복습 일정 (PRD 5: 퀴즈 결과 → 다음 복습일) ─────────

export interface ReviewItem extends ScheduleRow {
  term: string;
}

/**
 * 오늘의 복습 목록 (PRD 5.1): 예정일이 오늘 이전인 미졸업 단어(미완료) + 오늘 복습 흐름에서 푼 단어(완료).
 * 신규 학습 퀴즈로 정해진 첫 일정은 '오늘 복습'이 아니므로 완료로 세지 않는다.
 */
/**
 * 복습 일정 행 → core ScheduleRow. lastReviewedDate 는 '복습 흐름'에서 푼 경우만 채운다
 * (신규 학습 퀴즈로 정해진 첫 일정은 복습 완료가 아님). today 가 있으면 오늘 목록에 필요한 행만 가져온다.
 */
async function fetchSchedule(today?: string): Promise<{ rows: ScheduleRow[]; terms: Map<number, string> }> {
  let query = supabase.from('review_schedule').select('word_id, due_date, graduated, last_reviewed_at, last_context, words(term)');
  if (today) query = query.or(`due_date.lte.${today},last_reviewed_at.gte.${new Date(Date.now() - 2 * 86_400_000).toISOString()}`);
  const raw = check(await query) as unknown as {
    word_id: number; due_date: string; graduated: boolean; last_reviewed_at: string | null;
    last_context: 'new' | 'review'; words: { term: string } | null;
  }[];
  return {
    terms: new Map(raw.map((r) => [r.word_id, r.words?.term ?? ''])),
    rows: raw.map((r) => ({
      wordId: r.word_id,
      dueDate: r.due_date,
      graduated: r.graduated,
      lastReviewedDate:
        r.last_context === 'review' && r.last_reviewed_at ? studyDate(new Date(r.last_reviewed_at)) : null,
    })),
  };
}

export async function getTodayReviews(): Promise<{ pending: ReviewItem[]; done: ReviewItem[]; isEmpty: boolean }> {
  const today = studyDate();
  const { rows, terms } = await fetchSchedule(today);
  const list = buildTodayReviewList(rows, today);
  const withTerm = (s: ScheduleRow): ReviewItem => ({ ...s, term: terms.get(s.wordId) ?? '' });
  return { pending: list.pending.map(withTerm), done: list.done.map(withTerm), isEmpty: list.isEmpty };
}

// ───────── 학습 진도·연속 학습 (PRD 6.1) ─────────

export interface Progress {
  today: TodayProgress;
  streak: number;
  /** 최근 5주 (월요일 시작, 35칸) */
  heatmap: DayCell[];
  overall: OverallProgress;
  wrongWords: { id: number; term: string }[];
}

/** 본인의 학습 이력으로 진도를 계산한다. 앱 실행·화면 열람만으로는 완료되지 않는다 (core/progress 규칙). */
export async function getProgress(): Promise<Progress> {
  const today = studyDate();
  const [assignRaw, schedule, attemptRaw, activeCount] = await Promise.all([
    supabase.from('daily_assignments').select('assign_date, word_id, content_viewed_at, quiz_completed_at'),
    fetchSchedule(),
    supabase.from('quiz_attempts').select('word_id, is_correct, submitted_at'),
    supabase.from('words').select('id', { count: 'exact', head: true }).eq('is_active', true),
  ]);
  if (activeCount.error) throw new Error(activeCount.error.message);

  const assignments: AssignmentRow[] = (check(assignRaw) as {
    assign_date: string; word_id: number; content_viewed_at: string | null; quiz_completed_at: string | null;
  }[]).map((a) => ({
    assignDate: a.assign_date, wordId: a.word_id, contentViewedAt: a.content_viewed_at, quizCompletedAt: a.quiz_completed_at,
  }));
  const attempts: AttemptRow[] = (check(attemptRaw) as { word_id: number; is_correct: boolean; submitted_at: string }[])
    .map((a) => ({ wordId: a.word_id, isCorrect: a.is_correct, submittedAt: a.submitted_at }));

  const overall = computeOverallProgress(activeCount.count ?? 0, assignments, attempts);
  const words = await getWords(overall.wrongWordIds.slice(0, 50));
  return {
    today: computeTodayProgress(assignments, schedule.rows, today),
    streak: computeStreak(assignments, today),
    heatmap: computeDayStatuses(assignments, addDays(weekStart(today), -28), addDays(weekStart(today), 6), today),
    overall,
    wrongWords: overall.wrongWordIds.slice(0, 50).map((id) => ({ id, term: words.get(id)?.term ?? '' })),
  };
}

/** 이번 주(월~일) 학습 상태와 연속 학습 일수 — 오늘 탭 주간 스트립 */
export async function getWeek(): Promise<{ days: DayCell[]; streak: number }> {
  const today = studyDate();
  const rows = check(
    await supabase.from('daily_assignments').select('assign_date, word_id, content_viewed_at, quiz_completed_at'),
  ) as { assign_date: string; word_id: number; content_viewed_at: string | null; quiz_completed_at: string | null }[];
  const assignments: AssignmentRow[] = rows.map((a) => ({
    assignDate: a.assign_date, wordId: a.word_id, contentViewedAt: a.content_viewed_at, quizCompletedAt: a.quiz_completed_at,
  }));
  const mon = weekStart(today);
  return { days: computeDayStatuses(assignments, mon, addDays(mon, 6), today), streak: computeStreak(assignments, today) };
}

/** 확정된 퀴즈 결과로 다음 복습일을 계산해 저장. 실패해도 퀴즈 결과 자체는 이미 서버에 기록돼 있다. */
export async function recordReview(
  userId: string,
  wordId: number,
  isCorrect: boolean,
  context: 'new' | 'review',
): Promise<void> {
  const prev = checkMaybe(
    await supabase
      .from('review_schedule')
      .select('interval_days, ease, reps, lapses, graduated')
      .eq('word_id', wordId)
      .maybeSingle(),
  ) as { interval_days: number; ease: number; reps: number; lapses: number; graduated: boolean } | null;

  // 신규 학습 퀴즈를 같은 날 다시 풀어도 일정이 또 늘어나지 않도록, 'new' 는 첫 일정만 만든다
  if (context === 'new' && prev) return;

  const state: ReviewState = prev
    ? { intervalDays: prev.interval_days, ease: Number(prev.ease), reps: prev.reps, lapses: prev.lapses, graduated: prev.graduated }
    : NEW_REVIEW_STATE;
  const next = scheduleNextReview(state, isCorrect, studyDate());

  checkMaybe(
    await supabase.from('review_schedule').upsert({
      user_id: userId,
      word_id: wordId,
      due_date: next.dueDate,
      interval_days: next.intervalDays,
      ease: next.ease,
      reps: next.reps,
      lapses: next.lapses,
      graduated: next.graduated,
      last_reviewed_at: new Date().toISOString(),
      last_context: context, // 신규 학습 퀴즈는 '오늘 복습 완료'로 세지 않는다
    }),
  );
}

// ───────── 오류 신고 (PRD 7.1) ─────────

export type ReportTarget = 'word_meaning' | 'explanation' | 'quiz' | 'meaning_quiz';
export type ReportReason = 'wrong_meaning' | 'wrong_answer' | 'outdated' | 'typo' | 'other';

/** 신고 접수. 시사 설명·시사 퀴즈는 contentId 가 필요하고, 뜻·뜻 고르기 퀴즈는 단어만으로 식별한다. */
export async function submitReport(r: {
  userId: string;
  wordId: number;
  target: ReportTarget;
  contentId?: number | null;
  reason: ReportReason;
  note?: string;
}): Promise<void> {
  checkMaybe(
    await supabase.from('content_reports').insert({
      user_id: r.userId,
      word_id: r.wordId,
      target: r.target,
      content_id: r.target === 'explanation' || r.target === 'quiz' ? r.contentId : null,
      reason: r.reason,
      note: r.note?.trim() ? r.note.trim().slice(0, 500) : null,
    }),
  );
}
