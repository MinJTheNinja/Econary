import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { kst } from '@/lib/format';
import { adminDb } from '@/lib/supabase';
import { resolveReport } from './actions';

const TARGET: Record<string, string> = {
  word_meaning: '단어 뜻', explanation: '시사 설명', quiz: '시사 퀴즈', meaning_quiz: '뜻 고르기 퀴즈',
};

const REASON: Record<string, string> = {
  wrong_meaning: '뜻이 틀림', wrong_answer: '정답이 틀림', outdated: '오래된 정보', typo: '오타', other: '기타',
};

interface Report {
  id: number;
  reason: string;
  note: string | null;
  status: string;
  created_at: string;
  content_id: number | null;
  target: string;
  word_id: number;
  words: { term: string; meaning: string; needs_check: boolean } | null;
  word_contents: { kind: string; body: string; choices: string[] | null; answer_index: number | null; review_status: string } | null;
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireAdmin();
  const { status = 'open' } = await searchParams;
  const { data } = await adminDb()
    .from('content_reports')
    .select('id, reason, note, status, created_at, content_id, target, word_id, words(term, meaning, needs_check), word_contents(kind, body, choices, answer_index, review_status)')
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
            <strong>
              {r.words?.term} <span className="badge muted">{TARGET[r.target] ?? r.target}</span>{' '}
              <span className="badge warn">{REASON[r.reason] ?? r.reason}</span>
              {r.words?.needs_check && <span className="badge warn" style={{ marginLeft: 4 }}>뜻 확인 필요</span>}
            </strong>
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
              <input type="hidden" name="content_id" value={r.content_id ?? ''} />
              <input type="hidden" name="word_id" value={r.word_id} />
              {r.content_id ? (
                <label><input type="checkbox" name="exclude_content" /> 이 콘텐츠 게시 중단</label>
              ) : (
                <label><input type="checkbox" name="mark_needs_check" /> 단어를 '뜻 확인 필요'로 표시</label>
              )}
              <Link href={`/words?q=${encodeURIComponent(r.words?.term ?? '')}`} className="small">단어 뜻 수정 →</Link>
              <button className="primary" name="status" value="reviewed">확인 완료</button>
              <button name="status" value="dismissed">기각</button>
            </form>
          )}
        </div>
      ))}
    </>
  );
}
