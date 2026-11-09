import { useEffect, useState, type DependencyList } from 'react';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * 비동기 조회 + 오류 + 다시 시도. 상태는 비동기 결과에서만 바꿔서 effect 안 동기 setState 를 피한다.
 * deps 가 바뀌거나 reload() 하면 다시 불러온다. 이전 요청 결과는 버린다.
 */
export function useLoad<T>(fn: () => Promise<T>, deps: DependencyList) {
  const [state, setState] = useState<{ data?: T; error?: string; key: number }>({ key: 0 });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fn().then(
      (data) => { if (!cancelled) setState({ data, key: attempt }); },
      (e) => { if (!cancelled) setState({ error: message(e), key: attempt }); },
    );
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fn 은 호출부의 deps 로 대표된다
  }, [...deps, attempt]);

  return {
    data: state.data,
    error: state.error,
    reload: () => { setState({ key: attempt + 1 }); setAttempt((n) => n + 1); },
    setData: (data: T) => setState((s) => ({ ...s, data })),
  };
}
