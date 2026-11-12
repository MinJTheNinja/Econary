/**
 * 망각 곡선 기반 복습 일정 (FSRS-5).
 *
 * 사람의 기억은 시간이 지나면 거듭제곱 곡선을 따라 흐려진다:
 *   기억 유지율 R(t) = (1 + F·t/S)^C   (F = 19/81, C = -0.5, t = 지난 일수, S = 안정도)
 * S 는 '기억 유지율이 90% 로 떨어지기까지 걸리는 일수'다. R(S) = 0.9.
 *
 * - 복습은 유지율이 목표(MEMORY.targetRetention, 90%)로 떨어지는 날에 한다 → 간격 = S (목표 90% 일 때).
 * - 맞히면 S 가 커진다. 많이 잊었을 때(R 낮을 때) 떠올리는 데 성공할수록 더 크게 커진다 (바람직한 어려움).
 *   쉬운 단어(난이도 낮음)일수록, 이미 오래 기억한 단어일수록 증가 폭은 줄어든다.
 * - 틀리면 S 가 크게 줄고 내일 다시 본다. 난이도는 올라간다.
 * - 시험일이 있으면 다음 복습이 시험 뒤로 밀리지 않게 시험 전날로 당긴다.
 *
 * 결과는 클라이언트가 review_schedule 에 저장한다 (supabase/migrations/*_learning_v2.sql).
 */
import { MEMORY } from './config';
import { addDays, diffDays, type DateStr } from './date';

const F = 19 / 81;
const C = -0.5;
const w = MEMORY.w;

/** review_schedule 한 행의 기억 상태 */
export interface ReviewState {
  /** 안정도(일). 아직 한 번도 퀴즈를 안 푼 단어는 null */
  stability: number | null;
  /** 난이도 1(쉬움)~10(어려움) */
  difficulty: number | null;
  reps: number;
  lapses: number;
  graduated: boolean;
  /** 마지막으로 퀴즈를 푼 날 (학습 시간대 기준) */
  lastReviewDate: DateStr | null;
}

export interface ScheduledReview extends ReviewState {
  intervalDays: number;
  dueDate: DateStr;
}

export const NEW_REVIEW_STATE: ReviewState = {
  stability: null,
  difficulty: null,
  reps: 0,
  lapses: 0,
  graduated: false,
  lastReviewDate: null,
};

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const round2 = (n: number) => Math.round(n * 100) / 100;

/** 마지막 복습 뒤 t 일이 지났을 때 기억 유지율 (0~1) */
export function retrievability(elapsedDays: number, stability: number): number {
  return Math.pow(1 + (F * Math.max(0, elapsedDays)) / stability, C);
}

/** 기억 유지율이 target 으로 떨어지기까지 걸리는 일수 */
export function intervalFor(stability: number, target: number = MEMORY.targetRetention): number {
  return (stability / F) * (Math.pow(target, 1 / C) - 1);
}

/** 오늘 이 단어를 떠올릴 확률. 상태가 없으면 null */
export function currentRetention(state: Pick<ReviewState, 'stability' | 'lastReviewDate'>, today: DateStr): number | null {
  if (!state.stability || !state.lastReviewDate) return null;
  return retrievability(diffDays(state.lastReviewDate, today), state.stability);
}

// 평가: 퀴즈는 맞음/틀림 둘뿐이라 FSRS 의 Good(3) / Again(1) 만 쓴다
type Grade = 1 | 3;

const initDifficulty = (g: number) => clamp(w[4] - Math.exp(w[5] * (g - 1)) + 1, 1, 10);

function nextDifficulty(d: number, g: Grade): number {
  const delta = -w[6] * (g - 3);
  const damped = d + (delta * (10 - d)) / 9; // 10 에 가까울수록 덜 오른다
  return clamp(w[7] * initDifficulty(4) + (1 - w[7]) * damped, 1, 10); // 평균으로 조금씩 회귀
}

function stabilityAfterSuccess(d: number, s: number, r: number): number {
  return s * (Math.exp(w[8]) * (11 - d) * Math.pow(s, -w[9]) * (Math.exp(w[10] * (1 - r)) - 1) + 1);
}

function stabilityAfterLapse(d: number, s: number, r: number): number {
  const next = w[11] * Math.pow(d, -w[12]) * (Math.pow(s + 1, w[13]) - 1) * Math.exp(w[14] * (1 - r));
  return Math.min(next, s);
}

/** 같은 날 다시 푼 경우(간격 0일) 단기 안정도 변화 */
function stabilitySameDay(s: number, g: Grade): number {
  return s * Math.exp(w[17] * (g - 3 + w[18]));
}

export interface ScheduleOptions {
  /** 시험일. 있으면 다음 복습을 시험 전날 이전으로 당긴다 */
  examDate?: DateStr | null;
}

/**
 * 퀴즈 결과로 기억 상태와 다음 복습일을 계산한다.
 * @param prev 기존 상태 (처음이면 NEW_REVIEW_STATE)
 * @param correct 이번 시도의 정답 여부
 * @param today 푼 날짜 (학습 시간대 기준)
 */
export function scheduleNextReview(
  prev: ReviewState,
  correct: boolean,
  today: DateStr,
  opts: ScheduleOptions = {},
): ScheduledReview {
  const g: Grade = correct ? 3 : 1;
  let stability: number;
  let difficulty: number;

  if (prev.stability === null || prev.difficulty === null) {
    stability = w[g - 1];
    difficulty = initDifficulty(g);
  } else {
    const elapsed = prev.lastReviewDate ? Math.max(0, diffDays(prev.lastReviewDate, today)) : 0;
    const r = retrievability(elapsed, prev.stability);
    difficulty = nextDifficulty(prev.difficulty, g);
    stability =
      elapsed === 0
        ? stabilitySameDay(prev.stability, g)
        : correct
          ? stabilityAfterSuccess(prev.difficulty, prev.stability, r)
          : stabilityAfterLapse(prev.difficulty, prev.stability, r);
  }
  stability = clamp(stability, 0.1, 36500);

  let intervalDays = correct ? clamp(Math.round(intervalFor(stability)), 1, MEMORY.maxIntervalDays) : 1;
  // 시험 전에 한 번은 더 보도록: 다음 복습이 시험 전날을 넘으면 시험 전날로
  if (opts.examDate) {
    const untilEve = diffDays(today, addDays(opts.examDate, -1));
    if (untilEve >= 1 && intervalDays > untilEve) intervalDays = untilEve;
  }

  return {
    stability: round2(stability),
    difficulty: round2(difficulty),
    reps: correct ? prev.reps + 1 : 0,
    lapses: correct ? prev.lapses : prev.lapses + 1,
    graduated: false,
    lastReviewDate: today,
    intervalDays,
    dueDate: addDays(today, intervalDays),
  };
}

/**
 * 플래시카드에서 '모르겠어요'를 고른 단어를 내일 복습에 넣는다.
 * 퀴즈가 아니라 자기 평가라서 기억 상태는 건드리지 않고 기한만 당긴다.
 */
export function pullForwardReview(prev: ScheduledReview | null, today: DateStr): ScheduledReview {
  const tomorrow = addDays(today, 1);
  if (!prev) return { ...NEW_REVIEW_STATE, intervalDays: 0, dueDate: tomorrow };
  return { ...prev, graduated: false, dueDate: prev.dueDate < tomorrow ? prev.dueDate : tomorrow };
}

/** 예전 SM-2 열(ease)을 아직 쓰는 화면·통계를 위해: 난이도 1~10 → ease 3.0~1.3 */
export const easeFromDifficulty = (d: number | null) =>
  d === null ? 2.5 : round2(clamp(1.3 + ((10 - d) / 8) * 1.7, 1.3, 3.0));
