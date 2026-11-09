import { addDays, type DateStr } from './date';

export interface AssignmentRow {
  assignDate: DateStr;
  wordId: number;
  contentViewedAt: string | null;
  quizCompletedAt: string | null;
}

export interface ScheduleRow {
  wordId: number;
  dueDate: DateStr;
  graduated: boolean;
  /** 마지막 복습 날짜 (학습 시간대 기준). 아직 복습 안 했으면 null */
  lastReviewedDate: DateStr | null;
}

export interface AttemptRow {
  wordId: number;
  isCorrect: boolean;
  submittedAt: string; // ISO
}

/**
 * 항목 하나의 학습 완료 기준 (PRD 6.1): 요구 콘텐츠 확인 + 퀴즈 제출.
 * 앱 실행이나 화면 열람만으로는 완료되지 않는다.
 */
export function isAssignmentComplete(a: AssignmentRow): boolean {
  return a.contentViewedAt !== null && a.quizCompletedAt !== null;
}

/**
 * 일일 학습 완료 조건: 그날 배정된 신규 단어를 전부 완료.
 * (운영 정책 미확정 — docs/open-decisions.md)
 */
export function isDayComplete(assignments: AssignmentRow[]): boolean {
  return assignments.length > 0 && assignments.every(isAssignmentComplete);
}

/** 오늘 복습 목록: 오늘까지 예정된 단어(미완료) + 오늘 이미 복습한 단어(완료) (PRD 5.1) */
export function buildTodayReviewList(schedule: ScheduleRow[], today: DateStr) {
  const done = schedule.filter((s) => s.lastReviewedDate === today);
  const doneIds = new Set(done.map((s) => s.wordId));
  const pending = schedule
    .filter((s) => !s.graduated && s.dueDate <= today && !doneIds.has(s.wordId))
    .sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : a.wordId - b.wordId));
  return { pending, done, isEmpty: pending.length === 0 && done.length === 0 };
}

export interface TodayProgress {
  newTotal: number;
  newCompleted: number;
  reviewTotal: number;
  reviewCompleted: number;
  remaining: number;
  hasHistory: boolean;
}

/** 오늘의 신규/복습 완료 수와 남은 수 (PRD 6.1) */
export function computeTodayProgress(
  allAssignments: AssignmentRow[],
  schedule: ScheduleRow[],
  today: DateStr,
): TodayProgress {
  const todays = allAssignments.filter((a) => a.assignDate === today);
  const newCompleted = todays.filter(isAssignmentComplete).length;
  const review = buildTodayReviewList(schedule, today);
  const reviewTotal = review.pending.length + review.done.length;
  return {
    newTotal: todays.length,
    newCompleted,
    reviewTotal,
    reviewCompleted: review.done.length,
    remaining: todays.length - newCompleted + review.pending.length,
    hasHistory: allAssignments.length > 0 || schedule.length > 0,
  };
}

/**
 * 연속 학습 일수 (PRD 6.1): 일일 완료 조건을 충족한 날이 끊김 없이 이어진 수.
 * 오늘 아직 완료하지 않았다면 어제까지의 연속을 유지해서 보여준다 (오늘 끝내면 +1).
 */
export function computeStreak(allAssignments: AssignmentRow[], today: DateStr): number {
  const byDate = new Map<DateStr, AssignmentRow[]>();
  for (const a of allAssignments) {
    const list = byDate.get(a.assignDate);
    if (list) list.push(a);
    else byDate.set(a.assignDate, [a]);
  }
  const completed = (d: DateStr) => isDayComplete(byDate.get(d) ?? []);

  let cursor = completed(today) ? today : addDays(today, -1);
  let streak = 0;
  while (completed(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export interface OverallProgress {
  totalWords: number;
  studiedWords: number;
  unstudiedWords: number;
  attempts: number;
  accuracy: number | null; // 0~1, 시도 없으면 null
  /** 가장 최근 시도가 오답인 단어 (오답 노트) */
  wrongWordIds: number[];
}

/** 누적 진도·정답률·오답 단어 (PRD 6.1) */
export function computeOverallProgress(
  totalActiveWords: number,
  allAssignments: AssignmentRow[],
  attempts: AttemptRow[],
): OverallProgress {
  const studied = new Set(allAssignments.filter(isAssignmentComplete).map((a) => a.wordId));

  const latest = new Map<number, AttemptRow>();
  for (const at of attempts) {
    const prev = latest.get(at.wordId);
    if (!prev || at.submittedAt > prev.submittedAt) latest.set(at.wordId, at);
  }
  const wrongWordIds = [...latest.values()].filter((a) => !a.isCorrect).map((a) => a.wordId).sort((a, b) => a - b);
  const correct = attempts.filter((a) => a.isCorrect).length;

  return {
    totalWords: totalActiveWords,
    studiedWords: studied.size,
    unstudiedWords: Math.max(0, totalActiveWords - studied.size),
    attempts: attempts.length,
    accuracy: attempts.length ? correct / attempts.length : null,
    wrongWordIds,
  };
}

/** 하루 학습 상태 (진도 잔디): 신규 모두 완료 / 일부 학습 / 쉼. 미래 날짜는 'future'. */
export type DayStatus = 'complete' | 'partial' | 'rest' | 'future';

export interface DayCell {
  date: DateStr;
  status: DayStatus;
}

/**
 * from~to(포함) 날짜별 상태. '일부 학습'은 그날 배정 중 하나라도 뜻 확인이나 퀴즈 제출이 있었던 날.
 * today 이후는 future.
 */
export function computeDayStatuses(
  allAssignments: AssignmentRow[],
  from: DateStr,
  to: DateStr,
  today: DateStr,
): DayCell[] {
  const byDate = new Map<DateStr, AssignmentRow[]>();
  for (const a of allAssignments) {
    const list = byDate.get(a.assignDate);
    if (list) list.push(a);
    else byDate.set(a.assignDate, [a]);
  }
  const cells: DayCell[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const rows = byDate.get(d) ?? [];
    let status: DayStatus;
    if (d > today) status = 'future';
    else if (isDayComplete(rows)) status = 'complete';
    else if (rows.some((r) => r.contentViewedAt !== null || r.quizCompletedAt !== null)) status = 'partial';
    else status = 'rest';
    cells.push({ date: d, status });
  }
  return cells;
}
