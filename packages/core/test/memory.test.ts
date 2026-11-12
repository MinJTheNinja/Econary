import { describe, expect, it } from 'vitest';
import {
  MEMORY,
  NEW_REVIEW_STATE,
  currentRetention,
  intervalFor,
  retrievability,
  scheduleNextReview,
  type ReviewState,
} from '../src';

const today = '2026-11-12';

describe('forgetting curve', () => {
  it('retention is 90% after S days and falls with time', () => {
    expect(retrievability(0, 5)).toBe(1);
    expect(retrievability(5, 5)).toBeCloseTo(0.9, 5);
    expect(retrievability(20, 5)).toBeLessThan(retrievability(10, 5));
  });

  it('interval at 90% target equals stability', () => {
    expect(intervalFor(12)).toBeCloseTo(12, 5);
    expect(intervalFor(12, 0.8)).toBeGreaterThan(12);
  });

  it('current retention needs a review history', () => {
    expect(currentRetention(NEW_REVIEW_STATE, today)).toBeNull();
    expect(currentRetention({ stability: 4, lastReviewDate: '2026-11-08' }, today)).toBeCloseTo(0.9, 5);
  });
});

describe('scheduleNextReview', () => {
  it('first correct answer: about 3 days, wrong: tomorrow', () => {
    const ok = scheduleNextReview(NEW_REVIEW_STATE, true, today);
    expect(ok).toMatchObject({ intervalDays: 3, dueDate: '2026-11-15', reps: 1, lastReviewDate: today });
    const bad = scheduleNextReview(NEW_REVIEW_STATE, false, today);
    expect(bad).toMatchObject({ intervalDays: 1, dueDate: '2026-11-13', reps: 0, lapses: 1 });
    expect(bad.difficulty!).toBeGreaterThan(ok.difficulty!);
  });

  it('intervals grow with each successful review on time', () => {
    let s = scheduleNextReview(NEW_REVIEW_STATE, true, today);
    const intervals = [s.intervalDays];
    for (let i = 0; i < 4; i++) {
      s = scheduleNextReview(s, true, s.dueDate);
      intervals.push(s.intervalDays);
    }
    for (let i = 1; i < intervals.length; i++) expect(intervals[i]).toBeGreaterThan(intervals[i - 1]);
    expect(intervals[4]).toBeLessThanOrEqual(MEMORY.maxIntervalDays);
  });

  it('recalling after forgetting more raises stability more', () => {
    const base: ReviewState = { stability: 10, difficulty: 5, reps: 3, lapses: 0, graduated: false, lastReviewDate: '2026-11-02' };
    const onTime = scheduleNextReview(base, true, '2026-11-12'); // 10일 뒤 (R=90%)
    const late = scheduleNextReview(base, true, '2026-12-12'); // 40일 뒤 (R 낮음)
    expect(late.stability!).toBeGreaterThan(onTime.stability!);
  });

  it('a lapse shrinks stability and resets to tomorrow', () => {
    const base: ReviewState = { stability: 30, difficulty: 5, reps: 4, lapses: 0, graduated: false, lastReviewDate: '2026-10-13' };
    const r = scheduleNextReview(base, false, today);
    expect(r.stability!).toBeLessThan(30);
    expect(r).toMatchObject({ intervalDays: 1, reps: 0, lapses: 1 });
  });

  it('never schedules past the day before the exam', () => {
    const base: ReviewState = { stability: 40, difficulty: 4, reps: 4, lapses: 0, graduated: false, lastReviewDate: '2026-10-03' };
    const r = scheduleNextReview(base, true, today, { examDate: '2026-11-20' });
    expect(r.dueDate).toBe('2026-11-19');
    // 시험 전날이 내일 이전이면 그대로 (시험 후 일정)
    const after = scheduleNextReview(base, true, today, { examDate: '2026-11-13' });
    expect(after.intervalDays).toBeGreaterThan(1);
  });
});
