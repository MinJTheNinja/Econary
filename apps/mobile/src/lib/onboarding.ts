/**
 * 첫 실행 온보딩(시험 회차·하루 공부 시간)을 마쳤는지. 서버 profiles.onboarded_at 이 기준이라
 * 앱을 다시 설치하거나 계정으로 로그인해도 그대로 이어진다.
 * 루트 레이아웃이 이 값으로 welcome / 앱 본문을 가른다 (Stack.Protected).
 */
import { useEffect, useSyncExternalStore } from 'react';
import { getMyProfile } from './api';

type State = { userId: string; value: boolean | null; error: boolean };
let state: State | null = null;
const listeners = new Set<() => void>();
const set = (s: State) => { state = s; listeners.forEach((l) => l()); };

function load(userId: string) {
  set({ userId, value: null, error: false });
  getMyProfile().then(
    (p) => { if (state?.userId === userId) set({ userId, value: p.onboarded_at !== null, error: false }); },
    (e) => { console.warn('[onboarding]', e); if (state?.userId === userId) set({ userId, value: null, error: true }); },
  );
}

/** value: null 이면 아직 읽는 중 (실행 화면 유지). error 면 retry 로 다시 읽는다 */
export function useOnboarded(userId: string | undefined): { value: boolean | null; error: boolean; retry: () => void } {
  const s = useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => state,
    () => state,
  );
  useEffect(() => {
    if (userId && state?.userId !== userId) load(userId);
  }, [userId]);
  const mine = userId && s?.userId === userId ? s : null;
  return { value: mine?.value ?? null, error: mine?.error ?? false, retry: () => { if (userId) load(userId); } };
}

/** 온보딩 완료 (서버 저장은 saveStudyProfile 이 한다). 바로 앱 본문으로 넘어간다 */
export function finishOnboarding(userId: string): void {
  set({ userId, value: true, error: false });
}
