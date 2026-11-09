/**
 * 운영 정책 상수. PRD에서 "별도 결정 필요"로 남긴 값들이라 한곳에 모아 둔다.
 * 확정되면 여기만 바꾸면 된다 (docs/open-decisions.md).
 */

/** 하루 경계를 정하는 시간대. 일일 배정·연속 학습 계산 모두 이 기준. */
export const STUDY_TIMEZONE = 'Asia/Seoul';

/** 간격 반복(SM-2 변형) 파라미터 */
export const SRS = {
  initialEase: 2.5,
  minEase: 1.3,
  maxEase: 3.0,
  easeBonusOnCorrect: 0.1,
  easePenaltyOnWrong: 0.2,
  /** 정답 n회째의 고정 간격(일). 그 이후는 interval × ease */
  fixedIntervals: [1, 3] as readonly number[],
  maxIntervalDays: 120,
  /** 연속 정답이 이 횟수에 도달하면 복습 졸업 (PRD 5: 최대 복습 횟수 미확정) */
  maxReps: 8,
} as const;
