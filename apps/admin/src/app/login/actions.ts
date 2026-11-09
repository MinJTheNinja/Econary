'use server';

import { redirect } from 'next/navigation';
import { currentAdmin } from '@/lib/auth';
import { authClient } from '@/lib/supabase';

export async function signIn(_prev: string | null, form: FormData): Promise<string | null> {
  const supabase = await authClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(form.get('email') ?? ''),
    password: String(form.get('password') ?? ''),
  });
  if (error) return '이메일 또는 비밀번호가 맞지 않습니다.';
  if (!(await currentAdmin())) {
    await supabase.auth.signOut();
    return '관리자 권한이 없는 계정입니다.';
  }
  redirect('/');
}

export async function signOut() {
  const supabase = await authClient();
  await supabase.auth.signOut();
  redirect('/login');
}
