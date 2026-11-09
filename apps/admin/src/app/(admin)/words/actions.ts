'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth';
import { adminDb } from '@/lib/supabase';

export type WordFormState = { ok?: string; error?: string } | null;

function readWord(form: FormData) {
  const importance = Math.round(Number(form.get('importance')));
  return {
    term: String(form.get('term') ?? '').trim(),
    meaning: String(form.get('meaning') ?? '').trim(),
    english_name: String(form.get('english_name') ?? '').trim() || null,
    category: String(form.get('category') ?? '').trim() || null,
    importance: Number.isFinite(importance) ? Math.min(100, Math.max(0, importance)) : 50,
    is_active: form.get('is_active') === 'on',
    needs_check: form.get('needs_check') === 'on',
  };
}

function friendly(message: string) {
  return message.includes('words_normalized_term_key') ? '같은 단어가 이미 있습니다 (띄어쓰기·기호 무시 기준).' : message;
}

export async function updateWord(_: WordFormState, form: FormData): Promise<WordFormState> {
  await requireAdmin();
  const id = Number(form.get('id'));
  const w = readWord(form);
  if (!w.term || !w.meaning) return { error: '단어와 뜻은 비울 수 없습니다.' };
  const { error } = await adminDb().from('words').update(w).eq('id', id);
  if (error) return { error: friendly(error.message) };
  revalidatePath('/words');
  return { ok: '저장했습니다.' };
}

export async function createWord(_: WordFormState, form: FormData): Promise<WordFormState> {
  await requireAdmin();
  const w = readWord(form);
  if (!w.term || !w.meaning) return { error: '단어와 뜻을 입력하세요.' };
  const { error } = await adminDb().from('words').insert(w);
  if (error) return { error: friendly(error.message) };
  revalidatePath('/words');
  return { ok: `'${w.term}' 추가했습니다.` };
}
