import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { RUN_STATUS, SOURCE_LABEL, STAGE_LABEL, kst } from '@/lib/format';
import { adminDb } from '@/lib/supabase';

export default async function Overview() {
  await requireAdmin();
  const db = adminDb();
  const count = (q: PromiseLike<{ count: number | null }>) => q.then((r) => r.count ?? 0);

  const [words, active, needsCheck, approved, pending, runs] = await Promise.all([
    count(db.from('words').select('id', { count: 'exact', head: true })),
    count(db.from('words').select('id', { count: 'exact', head: true }).eq('is_active', true)),
    count(db.from('words').select('id', { count: 'exact', head: true }).eq('needs_check', true)),
    count(db.from('word_contents').select('id', { count: 'exact', head: true }).eq('review_status', 'approved')),
    count(db.from('word_contents').select('id', { count: 'exact', head: true }).eq('review_status', 'pending')),
    db.from('pipeline_runs').select('source, stage, status, item_count, created_at').order('id', { ascending: false }).limit(8),
  ]);

  return (
    <>
      <h1>개요</h1>
      <div className="grid" style={{ marginBottom: 20 }}>
        <Stat label="단어 (활성 / 전체)" value={`${active} / ${words}`} />
        <Stat label="뜻 확인 필요" value={needsCheck} href="/words?filter=needs_check" />
        <Stat label="검수 대기 콘텐츠" value={pending} href="/review" />
        <Stat label="게시 중 콘텐츠" value={approved} />
      </div>

      <h2>최근 파이프라인 실행</h2>
      <table>
        <thead><tr><th>시각</th><th>출처</th><th>단계</th><th>상태</th><th>건수</th></tr></thead>
        <tbody>
          {(runs.data ?? []).map((r, i) => (
            <tr key={i}>
              <td>{kst(r.created_at)}</td>
              <td>{SOURCE_LABEL[r.source]}</td>
              <td>{STAGE_LABEL[r.stage]}</td>
              <td><span className={`badge ${RUN_STATUS[r.status]?.tone}`}>{RUN_STATUS[r.status]?.label}</span></td>
              <td>{r.item_count}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="small"><Link href="/runs">전체 실행 기록 →</Link></p>
    </>
  );
}

function Stat({ label, value, href }: { label: string; value: number | string; href?: string }) {
  const body = (
    <div className="card" style={{ margin: 0 }}>
      <div className="muted small">{label}</div>
      <div className="stat">{value}</div>
    </div>
  );
  return href ? <Link href={href} style={{ color: 'inherit' }}>{body}</Link> : body;
}
