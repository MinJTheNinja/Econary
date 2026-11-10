/**
 * 오늘 탭 데이터. 앱 실행 화면이 미리 불러 두고(prefetchToday) 오늘 탭이 그걸 넘겨받는다(takeToday)
 * → 실행 화면이 끝나면 오늘의 단어가 바로 보인다.
 */
import { studyDate } from '@tesat/core';
import { getMyPlan, getTodayAssignment, getTodayReviews, getWeek, getWords } from './api';

export async function loadToday() {
  // 배정이 계획(get_my_plan)을 읽으므로 배정 먼저
  const assignments = await getTodayAssignment();
  const [plan, reviews, week] = await Promise.all([getMyPlan(), getTodayReviews(), getWeek().catch(() => null)]);
  const words = await getWords(assignments.map((a) => a.word_id));
  return {
    items: assignments.map((a) => ({ a, w: words.get(a.word_id) })),
    plan,
    reviewsPending: reviews.pending.length,
    week,
  };
}
export type TodayData = Awaited<ReturnType<typeof loadToday>>;

let prefetched: { day: string; promise: Promise<TodayData> } | null = null;

/** 실행 화면에서 한 번. 실패하면 오늘 탭이 다시 불러온다 */
export function prefetchToday(): Promise<TodayData> {
  const promise = loadToday();
  prefetched = { day: studyDate(), promise };
  promise.catch(() => { if (prefetched?.promise === promise) prefetched = null; });
  return promise;
}

/** 미리 불러 둔 게 있으면 한 번만 넘겨준다 (날짜가 바뀌었으면 버림) */
export function takeToday(): Promise<TodayData> | null {
  const p = prefetched;
  prefetched = null;
  return p && p.day === studyDate() ? p.promise : null;
}
