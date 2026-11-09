import { describe, expect, it } from 'vitest';
import { NEW_REVIEW_STATE, SRS, scheduleNextReview, type ReviewState } from '../src';

const today = '2026-11-09';

describe('scheduleNextReview', () => {
  it('first correct answer → review tomorrow', () => {
    const r = scheduleNextReview(NEW_REVIEW_STATE, true, today);
    expect(r).toMatchObject({ reps: 1, intervalDays: 1, dueDate: '2026-11-10', graduated: false });
  });

  it('second correct → 3 days, third → interval × ease', () => {
    const r1 = scheduleNextReview(NEW_REVIEW_STATE, true, today);
    const r2 = scheduleNextReview(r1, true, '2026-11-10');
    expect(r2).toMatchObject({ reps: 2, intervalDays: 3, dueDate: '2026-11-13' });
    const r3 = scheduleNextReview(r2, true, '2026-11-13');
    expect(r3.intervalDays).toBe(Math.round(3 * r2.ease));
    expect(r3.reps).toBe(3);
  });

  it('wrong answer resets reps, schedules tomorrow, lowers ease, counts lapse', () => {
    const prev: ReviewState = { intervalDays: 10, ease: 2.6, reps: 4, lapses: 0, graduated: false };
    const r = scheduleNextReview(prev, false, today);
    expect(r).toMatchObject({ reps: 0, intervalDays: 1, lapses: 1, dueDate: '2026-11-10', ease: 2.4 });
  });

  it('ease never drops below the minimum', () => {
    let s: ReviewState = NEW_REVIEW_STATE;
    for (let i = 0; i < 20; i++) s = scheduleNextReview(s, false, today);
    expect(s.ease).toBe(SRS.minEase);
  });

  it('interval is capped', () => {
    const prev: ReviewState = { intervalDays: 100, ease: 3, reps: 5, lapses: 0, graduated: false };
    expect(scheduleNextReview(prev, true, today).intervalDays).toBe(SRS.maxIntervalDays);
  });

  it('graduates after maxReps consecutive correct answers', () => {
    let s: ReviewState = NEW_REVIEW_STATE;
    for (let i = 0; i < SRS.maxReps - 1; i++) s = scheduleNextReview(s, true, today);
    expect(s.graduated).toBe(false);
    expect(scheduleNextReview(s, true, today).graduated).toBe(true);
  });
});
