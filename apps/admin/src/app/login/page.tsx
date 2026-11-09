import { isConfigured } from '@/lib/supabase';
import { LoginForm } from './LoginForm';

export const dynamic = 'force-dynamic'; // 환경변수 설정 여부를 요청 때마다 확인

export default function LoginPage() {
  return (
    <div style={{ maxWidth: 360, margin: '12vh auto', padding: '0 16px' }}>
      <h1>TESAT 콘텐츠 관리</h1>
      {isConfigured() ? (
        <div className="card">
          <LoginForm />
        </div>
      ) : (
        <p className="notice">
          apps/admin/.env.local 에 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY 를 넣어야 로그인할 수 있습니다
          (Supabase → Project Settings → API Keys).
        </p>
      )}
    </div>
  );
}
