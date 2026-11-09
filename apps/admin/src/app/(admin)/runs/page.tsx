import { requireAdmin } from '@/lib/auth';
import { RUN_STATUS, SOURCE_LABEL, STAGE_LABEL, kst } from '@/lib/format';
import { adminDb } from '@/lib/supabase';

export default async function RunsPage() {
  await requireAdmin();
  const { data } = await adminDb()
    .from('pipeline_runs')
    .select('id, source, run_date, stage, status, item_count, detail, created_at')
    .order('id', { ascending: false })
    .limit(150);

  return (
    <>
      <h1>파이프라인 처리 기록</h1>
      <p className="muted small">
        출처(YTN·한경)별로 수집 → 본문 → 단어 연결 → 생성 단계 결과입니다. 한 출처가 실패해도 다른 출처와 그날의 학습은 계속됩니다.
      </p>
      <table>
        <thead><tr><th>시각</th><th>출처</th><th>단계</th><th>상태</th><th>건수</th><th>상세</th></tr></thead>
        <tbody>
          {(data ?? []).map((r) => (
            <tr key={r.id}>
              <td style={{ whiteSpace: 'nowrap' }}>{kst(r.created_at)}</td>
              <td>{SOURCE_LABEL[r.source]}</td>
              <td>{STAGE_LABEL[r.stage]}</td>
              <td><span className={`badge ${RUN_STATUS[r.status]?.tone}`}>{RUN_STATUS[r.status]?.label ?? r.status}</span></td>
              <td>{r.item_count}</td>
              <td className="small" style={{ whiteSpace: 'pre-wrap', maxWidth: 520 }}>
                {r.detail && r.detail.length > 160 ? (
                  <details><summary>{r.detail.slice(0, 160)}…</summary>{r.detail}</details>
                ) : r.detail}
              </td>
            </tr>
          ))}
          {!data?.length && <tr><td colSpan={6} className="muted">기록 없음</td></tr>}
        </tbody>
      </table>
    </>
  );
}
