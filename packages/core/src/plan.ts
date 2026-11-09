import { PLAN } from './config';
import { addDays, diffDays, type DateStr } from './date';

export type PlanPhase = 'open' | 'learn' | 'review';

export interface PlanInput {
  /** 아직 학습 완료하지 않은 활성 단어 수 */
  remaining: number;
  /** 지금까지 학습 완료한 단어 수 */
  learned: number;
  /** 시험일 (없으면 null) */
  examDate: DateStr | null;
  dailyMinutes: number;
  today: DateStr;
}

export interface Plan {
  /** 오늘 신규 단어 수 */
  quota: number;
  /** open: 시험일 없음/지남, learn: 신규 학습 기간, review: 시험 전 마무리 복습 기간 */
  phase: PlanPhase;
  /** 시험까지 남은 일수 (D-n). 시험일이 없으면 null */
  daysLeft: number | null;
  /** 신규 학습에 쓸 수 있는 남은 일수 */
  learnDays: number | null;
  /** 하루 최대 신규 단어 수 (공부 시간 기준) */
  capacity: number;
  /** 시험 전 복습 기간 시작일 (learn 일 때만) */
  reviewStart: DateStr | null;
  /** 이 속도로 남은 단어를 모두 배우는 날 (quota 가 0 이면 null) */
  finishDate: DateStr | null;
  /** 시험 전까지 남은 단어 중 학습할 수 있는 비율 (0~1). 시험일이 없으면 1 */
  coverage: number;
  /** 시험 전까지 학습할 수 있는 단어 수 */
  coveredWords: number;
}

export function planCapacity(dailyMinutes: number): number {
  return Math.min(dailyMinutes * PLAN.wordsPerMinute, PLAN.maxDaily);
}

/** 오늘의 학습 계획. 서버 plan_quota 와 같은 규칙 (quota·phase·learnDays). */
export function buildPlan({ remaining, learned, examDate, dailyMinutes, today }: PlanInput): Plan {
  const capacity = planCapacity(dailyMinutes);
  const daysLeft = examDate ? diffDays(today, examDate) : null;
  const finish = (quota: number) => (quota > 0 && remaining > 0 ? addDays(today, Math.ceil(remaining / quota) - 1) : null);

  if (daysLeft === null || daysLeft <= 0) {
    return {
      quota: capacity, phase: 'open', daysLeft: daysLeft !== null && daysLeft <= 0 ? daysLeft : null, learnDays: null, capacity,
      reviewStart: null, finishDate: finish(capacity), coverage: 1, coveredWords: remaining,
    };
  }
  if (daysLeft <= PLAN.reviewDays && learned > 0) {
    return {
      quota: 0, phase: 'review', daysLeft, learnDays: 0, capacity,
      reviewStart: null, finishDate: null, coverage: 0, coveredWords: 0,
    };
  }
  const learnDays = Math.max(1, daysLeft - PLAN.reviewDays);
  const needed = Math.ceil(remaining / learnDays);
  const quota = Math.min(capacity, Math.max(PLAN.minDaily, needed));
  const coveredWords = Math.min(remaining, quota * learnDays);
  return {
    quota, phase: 'learn', daysLeft, learnDays, capacity,
    reviewStart: daysLeft > PLAN.reviewDays ? addDays(examDate!, -PLAN.reviewDays) : null,
    finishDate: finish(quota),
    coverage: remaining === 0 ? 1 : coveredWords / remaining,
    coveredWords,
  };
}
