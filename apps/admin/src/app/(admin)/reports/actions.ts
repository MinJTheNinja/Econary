'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth';
import { adminDb } from '@/lib/supabase';

/** 신고 처리 상태 변경 (PRD 7.2). 신고 대상 콘텐츠를 내리려면 exclude_content 를 함께 보낸다. */
export async function resolveReport(form: FormData) {
  await requireAdmin();
  const id = Number(form.get('id'));
  const status = form.get('status') === 'dismissed' ? 'dismissed' : 'reviewed';
  const db = adminDb();
  await db.from('content_reports').update({ status }).eq('id', id);
  if (form.get('exclude_content') === 'on') {
    await db
      .from('word_contents')
      .update({ review_status: 'excluded', reviewed_at: new Date().toISOString(), review_note: `오류 신고 #${id}로 게시 중단` })
      .eq('id', Number(form.get('content_id')));
  }
  revalidatePath('/reports');
  revalidatePath('/', 'layout');
}
