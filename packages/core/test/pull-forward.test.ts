import { describe, expect, it } from 'vitest';
import { NEW_REVIEW_STATE, pullForwardReview } from '../src';

const today = '2026-11-10';

describe('pullForwardReview', () => {
  it('no schedule yet → new state due tomorrow', () => {
    expect(pullForwardReview(null, today)).toEqual({ ...NEW_REVIEW_STATE, intervalDays: 0, dueDate: '2026-11-11' });
  });

  it('later due date is pulled to tomorrow, intervals kept', () => {
    const prev = { stability: 9, difficulty: 5, reps: 3, lapses: 1, graduated: false, lastReviewDate: '2026-11-01', intervalDays: 9, dueDate: '2026-11-20' };
    expect(pullForwardReview(prev, today)).toEqual({ ...prev, dueDate: '2026-11-11' });
  });

  it('earlier or overdue due date stays', () => {
    const prev = { stability: 1, difficulty: 5, reps: 1, lapses: 0, graduated: false, lastReviewDate: '2026-11-01', intervalDays: 1, dueDate: '2026-11-08' };
    expect(pullForwardReview(prev, today).dueDate).toBe('2026-11-08');
  });

  it('graduated word comes back into review', () => {
    const prev = { stability: 30, difficulty: 5, reps: 5, lapses: 0, graduated: true, lastReviewDate: '2026-11-01', intervalDays: 30, dueDate: '2026-12-30' };
    expect(pullForwardReview(prev, today)).toMatchObject({ graduated: false, dueDate: '2026-11-11', reps: 5 });
  });
});
