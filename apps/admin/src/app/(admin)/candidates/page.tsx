import { requireAdmin } from '@/lib/auth';
import { adminDb } from '@/lib/supabase';
import { CandidateRow, type Candidate } from './CandidateRow';

export default async function CandidatesPage() {
  await requireAdmin();
  const { data } = await adminDb()
    .from('term_candidates')
    .select('normalized_term, term, english_name, definition, category, best_score, best_grade, seen_count, sources, last_source_url, last_seen')
    .eq('status', 'open')
    .order('seen_count', { ascending: false })
    .order('best_score', { ascending: false })
    .limit(100);

  return (
    <>
      <h1>단어 후보 <span className="muted small">{data?.length ?? 0}개</span></h1>
      <p className="muted small">
        기사에 TESAT 용어로 등장했지만 고정 단어 목록에 없는 용어입니다. 자주·높은 점수로 나오는 순서입니다.
        자동으로 추가되지 않으니, 뜻을 확인해 목록에 넣거나 무시하세요.
      </p>
      {!data?.length && <div className="card muted">새 후보가 없습니다.</div>}
      {(data as Candidate[] | null)?.map((c) => <CandidateRow key={c.normalized_term} c={c} />)}
    </>
  );
}
