import { describe, expect, it } from 'vitest';
import {
  addDays,
  buildTodayReviewList,
  computeOverallProgress,
  computeStreak,
  computeTodayProgress,
  diffDays,
  studyDate,
  type AssignmentRow,
  type ScheduleRow,
} from '../src';

const T = '2026-11-09';
const done = (assignDate: string, wordId: number): AssignmentRow => ({
  assignDate, wordId, contentViewedAt: 'x', quizCompletedAt: 'x',
});
const open = (assignDate: string, wordId: number): AssignmentRow => ({
  assignDate, wordId, contentViewedAt: null, quizCompletedAt: null,
});

describe('date helpers', () => {
  it('studyDate uses KST (UTC 15:30 is next day in Seoul)', () => {
    expect(studyDate(new Date('2026-11-09T15:30:00Z'))).toBe('2026-11-10');
    expect(studyDate(new Date('2026-11-09T14:59:00Z'))).toBe('2026-11-09');
  });
  it('addDays / diffDays across month boundary', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(diffDays('2026-11-09', '2026-12-01')).toBe(22);
  });
});

describe('computeStreak', () => {
  it('is 0 with no history', () => {
    expect(computeStreak([], T)).toBe(0);
  });

  it('counts consecutive complete days including today', () => {
    const rows = [done(T, 1), done('2026-11-08', 2), done('2026-11-07', 3), done('2026-11-05', 4)];
    expect(computeStreak(rows, T)).toBe(3);
  });

  it('keeps yesterday’s streak while today is still in progress', () => {
    const rows = [open(T, 1), done('2026-11-08', 2), done('2026-11-07', 3)];
    expect(computeStreak(rows, T)).toBe(2);
  });

  it('a partially completed day breaks the streak', () => {
    const rows = [done(T, 1), done('2026-11-08', 2), open('2026-11-08', 3), done('2026-11-07', 4)];
    expect(computeStreak(rows, T)).toBe(1);
  });

  it('viewing without submitting the quiz is not completion', () => {
    const viewedOnly: AssignmentRow = { assignDate: T, wordId: 1, contentViewedAt: 'x', quizCompletedAt: null };
    expect(computeStreak([viewedOnly], T)).toBe(0);
  });
});

describe('buildTodayReviewList', () => {
  const s = (wordId: number, dueDate: string, lastReviewedDate: string | null = null, graduated = false): ScheduleRow =>
    ({ wordId, dueDate, lastReviewedDate, graduated });

  it('splits pending (due ≤ today) and done (reviewed today); excludes future and graduated', () => {
    const list = buildTodayReviewList(
      [s(1, '2026-11-08'), s(2, T), s(3, '2026-11-10'), s(4, '2026-11-12', T), s(5, '2026-11-01', null, true)],
      T,
    );
    expect(list.pending.map((x) => x.wordId)).toEqual([1, 2]);
    expect(list.done.map((x) => x.wordId)).toEqual([4]);
    expect(list.isEmpty).toBe(false);
  });

  it('reports empty state', () => {
    expect(buildTodayReviewList([s(3, '2026-11-10')], T).isEmpty).toBe(true);
  });
});

describe('computeTodayProgress', () => {
  it('counts new + review completion and remaining', () => {
    const p = computeTodayProgress(
      [done(T, 1), open(T, 2), open(T, 3), done('2026-11-08', 9)],
      [
        { wordId: 9, dueDate: T, graduated: false, lastReviewedDate: null },
        { wordId: 8, dueDate: '2026-11-15', graduated: false, lastReviewedDate: T },
      ],
      T,
    );
    expect(p).toEqual({
      newTotal: 3, newCompleted: 1, reviewTotal: 2, reviewCompleted: 1, remaining: 3, hasHistory: true,
    });
  });

  it('flags no history', () => {
    expect(computeTodayProgress([], [], T).hasHistory).toBe(false);
  });
});

describe('computeOverallProgress', () => {
  it('computes studied/unstudied, accuracy and latest-wrong words', () => {
    const o = computeOverallProgress(
      2000,
      [done('2026-11-08', 1), done(T, 2), open(T, 3)],
      [
        { wordId: 1, isCorrect: false, submittedAt: '2026-11-08T01:00:00Z' },
        { wordId: 1, isCorrect: true, submittedAt: '2026-11-09T01:00:00Z' },
        { wordId: 2, isCorrect: false, submittedAt: '2026-11-09T02:00:00Z' },
      ],
    );
    expect(o).toEqual({
      totalWords: 2000, studiedWords: 2, unstudiedWords: 1998, attempts: 3, accuracy: 1 / 3, wrongWordIds: [2],
    });
  });

  it('accuracy is null without attempts', () => {
    expect(computeOverallProgress(10, [], []).accuracy).toBeNull();
  });
});
