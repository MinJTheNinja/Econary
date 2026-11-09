import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { isConfigured, supabase } from './supabase';

interface AuthState {
  session: Session | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
}

const AuthContext = createContext<AuthState>({ session: null, loading: true, error: null, retry: () => {} });

/**
 * 익명으로 바로 시작한다 (설계 결정: 익명 + 선택적 로그인). 저장된 세션이 있으면 그대로 쓰고,
 * 없으면 익명 계정을 만든다. Apple/Google 연결은 Phase 8에서 linkIdentity 로 추가.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(isConfigured);
  const [error, setError] = useState<string | null>(
    isConfigured ? null : 'EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY 가 설정되지 않았습니다 (apps/mobile/.env).',
  );
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!isConfigured) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        if (!cancelled) setSession(data.session);
      } else {
        const { data: anon, error: e } = await supabase.auth.signInAnonymously();
        if (cancelled) return;
        if (e) setError(e.message.includes('Anonymous sign-ins are disabled')
          ? 'Supabase 에서 익명 로그인이 꺼져 있습니다 (Authentication → Sign In / Providers → Allow anonymous sign-ins).'
          : (console.warn('[auth]', e.message), '네트워크 연결을 확인한 뒤 다시 시도해 주세요.'));
        else setSession(anon.session);
      }
      if (!cancelled) setLoading(false);
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      // 연결된 계정에서 로그아웃하면 바로 새 익명 학습자로 시작한다 (앱은 항상 로그인 상태)
      if (event === 'SIGNED_OUT' && !cancelled) {
        setLoading(true);
        // onAuthStateChange 콜백 안에서 auth 호출을 await 하면 교착될 수 있어 다음 틱으로 미룬다 (Supabase 권장)
        setTimeout(() => {
          supabase.auth.signInAnonymously().then(({ error: e }) => {
            if (e) { console.warn('[auth]', e.message); setError('네트워크 연결을 확인한 뒤 다시 시도해 주세요.'); }
            setLoading(false);
          });
        }, 0);
      }
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [attempt]);

  return (
    <AuthContext.Provider
      value={{
        session, loading, error,
        retry: () => { setError(null); setLoading(true); setAttempt((n) => n + 1); },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
