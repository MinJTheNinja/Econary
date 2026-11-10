import { describe, expect, it } from 'vitest';
import { NEW_REVIEW_STATE, pullForwardReview } from '../src';

const today = '2026-11-10';

describe('pullForwardReview', () => {
  it('no schedule yet → new state due tomorrow', () => {
    expect(pullForwardReview(null, today)).toEqual({ ...NEW_REVIEW_STATE, dueDate: '2026-11-11' });
  });

  it('later due date is pulled to tomorrow, intervals kept', () => {
    const prev = { intervalDays: 9, ease: 2.7, reps: 3, lapses: 1, graduated: false, dueDate: '2026-11-20' };
    expect(pullForwardReview(prev, today)).toEqual({ ...prev, dueDate: '2026-11-11' });
  });

  it('earlier or overdue due date stays', () => {
    const prev = { intervalDays: 1, ease: 2.5, reps: 1, lapses: 0, graduated: false, dueDate: '2026-11-08' };
    expect(pullForwardReview(prev, today).dueDate).toBe('2026-11-08');
  });

  it('graduated word comes back into review', () => {
    const prev = { intervalDays: 30, ease: 2.9, reps: 5, lapses: 0, graduated: true, dueDate: '2026-12-30' };
    expect(pullForwardReview(prev, today)).toMatchObject({ graduated: false, dueDate: '2026-11-11', reps: 5 });
  });
});
