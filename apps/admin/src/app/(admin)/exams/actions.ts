'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth';
import { adminDb } from '@/lib/supabase';

/** TESAT 회차 추가 (학습자 온보딩·학습 계획의 시험일 목록). 같은 회차 번호면 시험일만 고친다 */
export async function saveExamRound(form: FormData): Promise<{ error?: string }> {
  await requireAdmin();
  const round = Number(form.get('round'));
  const examDate = String(form.get('exam_date') ?? '');
  if (!Number.isInteger(round) || round <= 0) return { error: '회차 번호를 확인해 주세요.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(examDate)) return { error: '시험일을 확인해 주세요.' };
  const { error } = await adminDb()
    .from('exam_rounds')
    .upsert({ round, exam_date: examDate, is_active: true }, { onConflict: 'round' });
  if (error) return { error: error.message };
  revalidatePath('/exams');
  return {};
}

/** 목록에서 숨기기/다시 보이기. 이미 고른 학습자의 계획은 그대로 유지된다 */
export async function toggleExamRound(form: FormData) {
  await requireAdmin();
  await adminDb()
    .from('exam_rounds')
    .update({ is_active: form.get('active') === 'true' })
    .eq('id', Number(form.get('id')));
  revalidatePath('/exams');
}
