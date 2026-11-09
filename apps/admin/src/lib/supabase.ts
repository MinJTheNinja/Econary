import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const PUBLISHABLE = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';

/** 로그인 세션용 클라이언트 (쿠키). 데이터 조회에는 쓰지 않는다. */
export async function authClient() {
  const store = await cookies();
  return createServerClient(URL, PUBLISHABLE, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // 서버 컴포넌트에서는 쿠키를 쓸 수 없다 — proxy.ts 가 세션을 갱신한다
        }
      },
    },
  });
}

/**
 * service_role 클라이언트: RLS 를 우회해 관리 데이터를 읽고 쓴다.
 * 반드시 requireAdmin() 통과 후에만 사용 (server-only 모듈이라 브라우저 번들에 포함되지 않음).
 */
export function adminDb() {
  return createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export const isConfigured = () => Boolean(URL && PUBLISHABLE && process.env.SUPABASE_SERVICE_ROLE_KEY);
