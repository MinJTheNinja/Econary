import 'server-only';
import { redirect } from 'next/navigation';
import { adminDb, authClient, isConfigured } from './supabase';

export type AdminRole = 'content_admin' | 'quality_admin';
export interface Admin {
  id: string;
  email: string | null;
  role: AdminRole;
}

/** 로그인한 사용자의 관리자 역할. 학습자거나 비로그인이면 null */
export async function currentAdmin(): Promise<Admin | null> {
  if (!isConfigured()) return null;
  const supabase = await authClient();
  const { data } = await supabase.auth.getUser(); // 서버에서 토큰을 검증하는 getUser 사용 (getSession 아님)
  const user = data.user;
  if (!user) return null;
  const { data: profile } = await adminDb().from('profiles').select('role').eq('user_id', user.id).single();
  if (profile?.role !== 'content_admin' && profile?.role !== 'quality_admin') return null;
  return { id: user.id, email: user.email ?? null, role: profile.role };
}

/** 페이지·서버 액션 맨 앞에서 호출. 관리자가 아니면 로그인 화면으로. */
export async function requireAdmin(): Promise<Admin> {
  const admin = await currentAdmin();
  if (!admin) redirect('/login');
  return admin;
}
