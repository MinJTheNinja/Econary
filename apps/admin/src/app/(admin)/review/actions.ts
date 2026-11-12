'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth';
import { adminDb } from '@/lib/supabase';

export type ReviewState = { error?: string; done?: 'approved' | 'excluded' } | null;

/** 검수 결정 (PRD 2.2). 승인 시 관리자가 고친 문구를 함께 저장한다. 정답 없는 퀴즈는 DB 제약이 승인을 막는다. */
export async function decide(_: ReviewState, form: FormData): Promise<ReviewState> {
  await requireAdmin();
  const id = Number(form.get('id'));
  const decision = form.get('decision') === 'approve' ? 'approved' : 'excluded';
  const kind = String(form.get('kind'));

  const patch: Record<string, unknown> = {
    review_status: decision,
    reviewed_at: new Date().toISOString(),
    review_note: String(form.get('review_note') ?? '').trim() || null,
  };

  if (decision === 'approved') {
    const body = String(form.get('body') ?? '').trim();
    if (!body) return { error: '본문이 비어 있습니다.' };
    if (body.length > 600) return { error: '본문은 600자 이하여야 합니다.' };
    patch.body = body;
    patch.topic = String(form.get('topic') ?? '').trim() || null;
    if (kind === 'quiz') {
      // 보기와 선지별 설명은 같은 칸끼리 묶어서, 빈 보기를 빼도 짝이 어긋나지 않게
      const pairs = [0, 1, 2, 3]
        .map((i) => ({ choice: String(form.get(`choice${i}`) ?? '').trim(), note: String(form.get(`note${i}`) ?? '').trim() }))
        .filter((p) => p.choice);
      const choices = pairs.map((p) => p.choice);
      // 설명은 전부 있을 때만 저장 (일부만 있으면 앱이 해설로 대체하도록 비운다)
      const choiceNotes = pairs.every((p) => p.note) ? pairs.map((p) => p.note) : null;
      if (choices.length < 2) return { error: '보기가 2개 이상 필요합니다.' };
      const answer = Number(form.get('answer_index'));
      if (!(answer >= 0 && answer < choices.length)) return { error: '정답을 선택하세요.' };
      const explanation = String(form.get('answer_explanation') ?? '').trim();
      if (!explanation) return { error: '정답 해설이 필요합니다.' };
      Object.assign(patch, { choices, answer_index: answer, answer_explanation: explanation, choice_notes: choiceNotes });
    }
  }

  const { error } = await adminDb().from('word_contents').update(patch).eq('id', id).eq('review_status', 'pending');
  if (error) {
    return { error: error.message.includes('quiz_approvable') ? '정답 데이터가 없는 퀴즈는 승인할 수 없습니다.' : error.message };
  }
  revalidatePath('/review');
  revalidatePath('/', 'layout');
  return { done: decision };
}
