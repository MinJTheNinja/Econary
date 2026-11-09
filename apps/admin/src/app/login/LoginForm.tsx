'use client';

import { useActionState } from 'react';
import { signIn } from './actions';

export function LoginForm() {
  const [error, action, pending] = useActionState(signIn, null);
  return (
    <form action={action} className="stack">
      <input name="email" type="email" placeholder="이메일" autoComplete="username" required style={{ width: '100%' }} />
      <input name="password" type="password" placeholder="비밀번호" autoComplete="current-password" required style={{ width: '100%' }} />
      {error && <p className="small" style={{ color: 'var(--bad)', margin: 0 }}>{error}</p>}
      <button className="primary" disabled={pending} style={{ width: '100%' }}>
        {pending ? '확인 중…' : '로그인'}
      </button>
    </form>
  );
}
