import { SRS } from './config';
import { addDays, type DateStr } from './date';

/** review_schedule 한 행과 같은 모양 */
export interface ReviewState {
  intervalDays: number;
  ease: number;
  reps: number;
  lapses: number;
  graduated: boolean;
}

export interface ScheduledReview extends ReviewState {
  dueDate: DateStr;
}

export const NEW_REVIEW_STATE: ReviewState = {
  intervalDays: 0,
  ease: SRS.initialEase,
  reps: 0,
  lapses: 0,
  graduated: false,
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * 퀴즈 결과를 반영해 다음 복습일을 계산한다 (PRD 5.1).
 * - 정답: 연속 정답 수(reps)에 따라 1일 → 3일 → interval×ease 로 늘어난다.
 * - 오답: reps 를 0으로 되돌리고 다음 날 다시 복습, ease 감소.
 * - 연속 정답이 SRS.maxReps 에 도달하면 졸업(더 이상 복습 대상 아님).
 *
 * @param prev 기존 상태 (처음 퀴즈를 푼 단어면 NEW_REVIEW_STATE)
 * @param correct 이번 시도의 정답 여부
 * @param today 시도한 날짜 (학습 시간대 기준)
 */
export function scheduleNextReview(prev: ReviewState, correct: boolean, today: DateStr): ScheduledReview {
  if (!correct) {
    const intervalDays = SRS.fixedIntervals[0] ?? 1;
    return {
      intervalDays,
      ease: round2(clamp(prev.ease - SRS.easePenaltyOnWrong, SRS.minEase, SRS.maxEase)),
      reps: 0,
      lapses: prev.lapses + 1,
      graduated: false,
      dueDate: addDays(today, intervalDays),
    };
  }

  const reps = prev.reps + 1;
  const ease = round2(clamp(prev.ease + SRS.easeBonusOnCorrect, SRS.minEase, SRS.maxEase));
  const fixed = SRS.fixedIntervals[reps - 1];
  const intervalDays = clamp(
    fixed ?? Math.round(Math.max(prev.intervalDays, 1) * prev.ease),
    1,
    SRS.maxIntervalDays,
  );

  return {
    intervalDays,
    ease,
    reps,
    lapses: prev.lapses,
    graduated: reps >= SRS.maxReps,
    dueDate: addDays(today, intervalDays),
  };
}
