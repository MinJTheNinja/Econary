import { requireAdmin } from '@/lib/auth';
import { SOURCE_LABEL, kst } from '@/lib/format';
import { adminDb } from '@/lib/supabase';
import { ReviewCard, type PendingContent } from './ReviewCard';

interface Row extends PendingContent {
  word_id: number;
  source: string;
  source_url: string | null;
  source_title: string | null;
  source_date: string | null;
  created_at: string;
  words: { term: string; meaning: string; needs_check: boolean } | null;
}

export default async function ReviewPage() {
  await requireAdmin();
  const { data, error } = await adminDb()
    .from('word_contents')
    .select('id, word_id, kind, body, choices, answer_index, answer_explanation, topic, source, source_url, source_title, source_date, created_at, words(term, meaning, needs_check)')
    .eq('review_status', 'pending')
    .order('created_at')
    .order('kind')
    .limit(100);

  // 단어별로 묶어 설명과 퀴즈를 함께 본다
  const groups = new Map<number, Row[]>();
  for (const r of (data ?? []) as unknown as Row[]) {
    groups.set(r.word_id, [...(groups.get(r.word_id) ?? []), r]);
  }

  return (
    <>
      <h1>검수 대기 <span className="muted small">{data?.length ?? 0}건</span></h1>
      <p className="muted small">
        파이프라인이 만든 설명·퀴즈는 승인해야 학습자에게 보입니다. 기사 문장을 옮긴 흔적이 있거나 뜻과 맞지 않으면 제외하세요.
        출처 기사 링크는 관리자에게만 보입니다.
      </p>
      {error && <p className="notice">{error.message}</p>}
      {!groups.size && <div className="card muted">검수할 콘텐츠가 없습니다.</div>}

      {[...groups.values()].map((rows) => {
        const first = rows[0];
        return (
          <section key={first.word_id} className="card">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h2 style={{ margin: 0 }}>
                {first.words?.term}
                {first.words?.needs_check && <span className="badge warn" style={{ marginLeft: 8 }}>뜻 확인 필요</span>}
              </h2>
              <span className="muted small">
                {SOURCE_LABEL[first.source]} · {first.source_date ?? kst(first.created_at)}
              </span>
            </div>
            <p className="muted" style={{ margin: '4px 0' }}>고정 뜻: {first.words?.meaning}</p>
            {first.source_url && (
              <p className="small" style={{ margin: 0 }}>
                출처 기사: <a href={first.source_url} target="_blank" rel="noreferrer">{first.source_title || first.source_url}</a>
              </p>
            )}
            {rows.map((c) => <ReviewCard key={c.id} c={c} />)}
          </section>
        );
      })}
    </>
  );
}
