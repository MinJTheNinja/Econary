'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth';
import { adminDb } from '@/lib/supabase';

/**
 * 신고 처리 상태 변경 (PRD 7.2). 생성 콘텐츠 신고는 exclude_content 로 게시를 내리고,
 * 단어 뜻·뜻 고르기 신고는 mark_needs_check 로 단어를 '뜻 확인 필요'로 표시한다 (뜻 수정은 단어 목록에서).
 */
export async function resolveReport(form: FormData) {
  await requireAdmin();
  const id = Number(form.get('id'));
  const status = form.get('status') === 'dismissed' ? 'dismissed' : 'reviewed';
  const db = adminDb();
  await db.from('content_reports').update({ status }).eq('id', id);
  if (form.get('mark_needs_check') === 'on') {
    await db.from('words').update({ needs_check: true }).eq('id', Number(form.get('word_id')));
  }
  if (form.get('exclude_content') === 'on' && form.get('content_id')) {
    await db
      .from('word_contents')
      .update({ review_status: 'excluded', reviewed_at: new Date().toISOString(), review_note: `오류 신고 #${id}로 게시 중단` })
      .eq('id', Number(form.get('content_id')));
  }
  revalidatePath('/reports');
  revalidatePath('/', 'layout');
}
