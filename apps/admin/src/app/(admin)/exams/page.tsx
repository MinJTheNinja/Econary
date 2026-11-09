import { requireAdmin } from '@/lib/auth';
import { adminDb } from '@/lib/supabase';
import { saveExamRound, toggleExamRound } from './actions';

interface Round {
  id: number;
  round: number;
  exam_date: string;
  is_active: boolean;
}

const todayKst = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());

async function add(form: FormData) {
  'use server';
  await saveExamRound(form);
}

/** TESAT 회차 — 학습자가 첫 실행·학습 계획에서 고르는 시험일 목록 (오늘 이후, 표시 중인 회차만 보임) */
export default async function ExamsPage() {
  await requireAdmin();
  const db = adminDb();
  const [{ data }, { data: picks }] = await Promise.all([
    db.from('exam_rounds').select('id, round, exam_date, is_active').order('exam_date', { ascending: false }),
    db.from('profiles').select('exam_round_id').not('exam_round_id', 'is', null),
  ]);
  const rounds = (data ?? []) as Round[];
  const count = new Map<number, number>();
  for (const p of (picks ?? []) as { exam_round_id: number }[]) count.set(p.exam_round_id, (count.get(p.exam_round_id) ?? 0) + 1);
  const today = todayKst();

  return (
    <>
      <h1>TESAT 회차</h1>
      <p className="muted small">공식 일정(tesat.or.kr)이 나오면 회차를 추가하세요. 학습자 앱에는 오늘 이후 시험만 보입니다.</p>
      <form action={add} className="card row" style={{ marginBottom: 16 }}>
        <label>회차 <input name="round" type="number" min={1} required style={{ width: 90 }} /></label>
        <label>시험일 <input name="exam_date" type="date" required /></label>
        <button className="primary">추가 / 수정</button>
      </form>
      {!rounds.length && <div className="card muted">등록된 회차가 없습니다.</div>}
      {rounds.length > 0 && (
        <table>
          <thead>
            <tr><th>회차</th><th>시험일</th><th>상태</th><th>선택한 학습자</th><th /></tr>
          </thead>
          <tbody>
            {rounds.map((r) => (
              <tr key={r.id}>
                <td>제{r.round}회</td>
                <td>{r.exam_date}</td>
                <td>
                  {r.exam_date <= today
                    ? <span className="badge muted">지난 시험</span>
                    : r.is_active ? <span className="badge ok">표시 중</span> : <span className="badge warn">숨김</span>}
                </td>
                <td>{count.get(r.id) ?? 0}명</td>
                <td>
                  <form action={toggleExamRound}>
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="active" value={String(!r.is_active)} />
                    <button className="small">{r.is_active ? '숨기기' : '다시 표시'}</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
