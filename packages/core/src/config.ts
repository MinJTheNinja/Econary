/**
 * 운영 정책 상수. PRD에서 "별도 결정 필요"로 남긴 값들이라 한곳에 모아 둔다.
 * 확정되면 여기만 바꾸면 된다 (docs/open-decisions.md).
 */

/** 하루 경계를 정하는 시간대. 일일 배정·연속 학습 계산 모두 이 기준. */
export const STUDY_TIMEZONE = 'Asia/Seoul';

/**
 * 복습 간격: 망각 곡선 기반 기억 모델 (FSRS-5, core/memory.ts).
 * 단어마다 '안정도'(기억이 90% 로 떨어지기까지 걸리는 일수)와 '난이도'를 추적하고,
 * 기억 유지율이 targetRetention 으로 떨어지는 날 복습한다.
 */
export const MEMORY = {
  /** 복습 시점의 목표 기억 유지율. 0.9 = '열 번 중 아홉 번은 떠올릴 수 있을 때' 복습 */
  targetRetention: 0.9,
  maxIntervalDays: 365,
  /** FSRS-5 기본 파라미터 (open-spaced-repetition, 수억 건 복습 기록으로 학습된 값) */
  w: [
    0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192,
    1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621,
  ] as readonly number[],
} as const;

/**
 * 학습 계획 (시험일 + 하루 공부 시간 → 하루 신규 단어 수).
 * supabase/migrations/*_study_plan.sql 의 plan_quota 와 같은 값이어야 한다.
 */
export const PLAN = {
  /** 공부 시간 1분당 신규 단어 수 (복습 포함 대략치) */
  wordsPerMinute: 1,
  maxDaily: 50,
  minDaily: 3,
  /** 시험 전 마지막 n일은 신규 없이 복습만 */
  reviewDays: 7,
  minuteOptions: [10, 20, 30, 60] as readonly number[],
} as const;
