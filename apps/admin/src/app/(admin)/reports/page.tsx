import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { kst } from '@/lib/format';
import { adminDb } from '@/lib/supabase';
import { resolveReport } from './actions';

const REASON: Record<string, string> = {
  wrong_meaning: '뜻이 틀림', wrong_answer: '정답이 틀림', outdated: '오래된 정보', typo: '오타', other: '기타',
};

interface Report {
  id: number;
  reason: string;
  note: string | null;
  status: string;
  created_at: string;
  content_id: number;
  words: { term: string; meaning: string } | null;
  word_contents: { kind: string; body: string; choices: string[] | null; answer_index: number | null; review_status: string } | null;
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireAdmin();
  const { status = 'open' } = await searchParams;
  const { data } = await adminDb()
    .from('content_reports')
    .select('id, reason, note, status, created_at, content_id, words(term, meaning), word_contents(kind, body, choices, answer_index, review_status)')
    .eq('status', status)
    .order('created_at', { ascending: false })
    .limit(100);
  const reports = (data ?? []) as unknown as Report[];

  return (
    <>
      <h1>오류 신고</h1>
      <div className="row" style={{ marginBottom: 12 }}>
        {[['open', '접수'], ['reviewed', '확인함'], ['dismissed', '기각']].map(([k, v]) => (
          <Link key={k} href={`/reports?status=${k}`} className={`badge ${k === status ? 'ok' : 'muted'}`}>{v}</Link>
        ))}
      </div>
      {!reports.length && <div className="card muted">신고가 없습니다.</div>}
      {reports.map((r) => (
        <div key={r.id} className="card stack">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <strong>{r.words?.term} <span className="badge warn">{REASON[r.reason] ?? r.reason}</span></strong>
            <span className="muted small">#{r.id} · {kst(r.created_at)}</span>
          </div>
          {r.note && <p style={{ margin: 0 }}>“{r.note}”</p>}
          <div className="small muted">고정 뜻: {r.words?.meaning}</div>
          {r.word_contents && (
            <div className="small" style={{ background: 'var(--bg)', padding: 8, borderRadius: 6 }}>
              <span className="badge muted">{r.word_contents.kind === 'quiz' ? '퀴즈' : '설명'} · {r.word_contents.review_status}</span>
              <div>{r.word_contents.body}</div>
              {r.word_contents.choices && (
                <ol className="choices">
                  {r.word_contents.choices.map((c, i) => (
                    <li key={i} className={i === r.word_contents!.answer_index ? 'answer' : ''}>{i + 1}. {c}</li>
                  ))}
                </ol>
              )}
            </div>
          )}
          {status === 'open' && (
            <form action={resolveReport} className="row">
              <input type="hidden" name="id" value={r.id} />
              <input type="hidden" name="content_id" value={r.content_id} />
              <label><input type="checkbox" name="exclude_content" /> 이 콘텐츠 게시 중단</label>
              <button className="primary" name="status" value="reviewed">확인 완료</button>
              <button name="status" value="dismissed">기각</button>
            </form>
          )}
        </div>
      ))}
    </>
  );
}
