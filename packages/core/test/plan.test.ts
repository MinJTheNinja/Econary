import { describe, expect, it } from 'vitest';
import { addDays, buildPlan } from '../src';

const today = '2026-11-10';
const exam = (days: number) => addDays(today, days);

// supabase/tests/rls-check.mjs 의 plan_quota 케이스와 같은 값
describe('buildPlan', () => {
  it('no exam → capacity by minutes', () => {
    expect(buildPlan({ remaining: 1000, learned: 0, examDate: null, dailyMinutes: 20, today })).toMatchObject({ quota: 20, phase: 'open', learnDays: null });
  });
  it('exam passed → capacity', () => {
    expect(buildPlan({ remaining: 1000, learned: 5, examDate: exam(0), dailyMinutes: 10, today })).toMatchObject({ quota: 10, phase: 'open' });
  });
  it('spreads remaining words over learn days', () => {
    const p = buildPlan({ remaining: 300, learned: 0, examDate: exam(37), dailyMinutes: 30, today });
    expect(p).toMatchObject({ quota: 10, phase: 'learn', learnDays: 30, daysLeft: 37, coverage: 1, coveredWords: 300 });
    expect(p.reviewStart).toBe(exam(30));
    expect(p.finishDate).toBe(addDays(today, 29));
  });
  it('capped by study time → partial coverage', () => {
    const p = buildPlan({ remaining: 3000, learned: 0, examDate: exam(37), dailyMinutes: 10, today });
    expect(p).toMatchObject({ quota: 10, learnDays: 30, coveredWords: 300 });
    expect(p.coverage).toBeCloseTo(0.1);
  });
  it('at least 3 a day', () => {
    expect(buildPlan({ remaining: 20, learned: 0, examDate: exam(60), dailyMinutes: 30, today })).toMatchObject({ quota: 3, learnDays: 53 });
  });
  it('60 minutes caps at 50', () => {
    expect(buildPlan({ remaining: 3000, learned: 0, examDate: exam(20), dailyMinutes: 60, today })).toMatchObject({ quota: 50, learnDays: 13 });
  });
  it('final week is review only', () => {
    expect(buildPlan({ remaining: 500, learned: 40, examDate: exam(7), dailyMinutes: 20, today })).toMatchObject({ quota: 0, phase: 'review', learnDays: 0 });
  });
  it('final week still teaches if nothing learned yet', () => {
    expect(buildPlan({ remaining: 500, learned: 0, examDate: exam(5), dailyMinutes: 20, today })).toMatchObject({ quota: 20, phase: 'learn', learnDays: 1 });
  });
});
