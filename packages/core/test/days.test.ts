import { describe, expect, it } from 'vitest';
import { computeDayStatuses, weekStart, type AssignmentRow } from '../src';

const row = (assignDate: string, wordId: number, viewed: boolean, quiz: boolean): AssignmentRow => ({
  assignDate, wordId, contentViewedAt: viewed ? 'x' : null, quizCompletedAt: quiz ? 'x' : null,
});

describe('weekStart', () => {
  it('returns Monday of the week', () => {
    expect(weekStart('2026-11-10')).toBe('2026-11-09'); // 화 → 월
    expect(weekStart('2026-11-09')).toBe('2026-11-09'); // 월
    expect(weekStart('2026-11-15')).toBe('2026-11-09'); // 일
    expect(weekStart('2026-11-01')).toBe('2026-10-26'); // 월 경계
  });
});

describe('computeDayStatuses', () => {
  it('classifies complete / partial / rest / future', () => {
    const rows = [
      row('2026-11-09', 1, true, true),
      row('2026-11-09', 2, true, true),
      row('2026-11-10', 3, true, false),
      row('2026-11-10', 4, false, false),
      row('2026-11-11', 5, false, false),
    ];
    const cells = computeDayStatuses(rows, '2026-11-08', '2026-11-12', '2026-11-11');
    expect(cells.map((c) => c.status)).toEqual(['rest', 'complete', 'partial', 'rest', 'future']);
    expect(cells[0].date).toBe('2026-11-08');
  });
});
