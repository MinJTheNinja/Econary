'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth';
import { adminDb } from '@/lib/supabase';

export type CandidateState = { error?: string; done?: 'added' | 'ignored' } | null;

/** 후보를 고정 단어 목록에 추가 (관리자가 뜻·중요도를 확인한 뒤) 또는 무시 */
export async function resolveCandidate(_: CandidateState, form: FormData): Promise<CandidateState> {
  await requireAdmin();
  const key = String(form.get('normalized_term'));
  const db = adminDb();

  if (form.get('decision') === 'ignore') {
    await db.from('term_candidates').update({ status: 'ignored' }).eq('normalized_term', key);
    revalidatePath('/candidates');
    revalidatePath('/', 'layout');
    return { done: 'ignored' };
  }

  const term = String(form.get('term') ?? '').trim();
  const meaning = String(form.get('meaning') ?? '').trim();
  const importance = Math.min(100, Math.max(0, Math.round(Number(form.get('importance')) || 50)));
  if (!term || !meaning) return { error: '단어와 뜻을 입력하세요.' };

  const { error } = await db.from('words').insert({
    term, meaning, importance,
    english_name: String(form.get('english_name') ?? '').trim() || null,
    category: String(form.get('category') ?? '').trim() || null,
  });
  if (error) {
    return { error: error.message.includes('words_normalized_term_key') ? '이미 같은 단어가 목록에 있습니다.' : error.message };
  }
  await db.from('term_candidates').update({ status: 'added' }).eq('normalized_term', key);
  revalidatePath('/candidates');
  revalidatePath('/', 'layout');
  return { done: 'added' };
}
