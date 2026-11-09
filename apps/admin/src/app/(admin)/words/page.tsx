import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { adminDb } from '@/lib/supabase';
import { WordForm, type WordRow } from './WordForm';

const PAGE = 50;
const FILTERS = { all: '전체', active: '활성', inactive: '비활성', needs_check: '뜻 확인 필요' } as const;
type Filter = keyof typeof FILTERS;
const SORTS = { importance: '중요도순', term: '가나다순', recent: '최근 수정순' } as const;
type Sort = keyof typeof SORTS;

export default async function WordsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdmin();
  const sp = await searchParams;
  const q = (sp.q ?? '').trim();
  const filter: Filter = (sp.filter as Filter) in FILTERS ? (sp.filter as Filter) : 'all';
  const sort: Sort = (sp.sort as Sort) in SORTS ? (sp.sort as Sort) : 'importance';
  const page = Math.max(1, Number(sp.page) || 1);

  let query = adminDb()
    .from('words')
    .select('id, term, meaning, english_name, category, importance, is_active, needs_check', { count: 'exact' });
  if (q) {
    const safe = q.replace(/[,()%*\\]/g, ' ');
    query = query.or(`term.ilike.*${safe}*,english_name.ilike.*${safe}*,meaning.ilike.*${safe}*`);
  }
  if (filter === 'active') query = query.eq('is_active', true);
  if (filter === 'inactive') query = query.eq('is_active', false);
  if (filter === 'needs_check') query = query.eq('needs_check', true);
  query =
    sort === 'term' ? query.order('term')
    : sort === 'recent' ? query.order('updated_at', { ascending: false })
    : query.order('importance', { ascending: false }).order('id');
  const { data, count, error } = await query.range((page - 1) * PAGE, page * PAGE - 1);

  const words = (data ?? []) as WordRow[];
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const href = (p: Partial<{ q: string; filter: string; sort: string; page: number }>) => {
    const u = new URLSearchParams({ q, filter, sort, page: String(page), ...Object.fromEntries(Object.entries(p).map(([k, v]) => [k, String(v)])) });
    return `/words?${u}`;
  };

  return (
    <>
      <h1>단어 목록 <span className="muted small">{total.toLocaleString()}개</span></h1>
      <p className="muted small">
        중요도는 0~100, 높을수록 신규 학습에 먼저 배정됩니다. 비활성 단어는 새로 배정되지 않지만 학습 이력은 남습니다.
      </p>

      <form className="row" style={{ marginBottom: 12 }}>
        <input name="q" defaultValue={q} placeholder="단어·영문명·뜻 검색" style={{ flex: '1 1 240px' }} />
        <select name="filter" defaultValue={filter}>
          {Object.entries(FILTERS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select name="sort" defaultValue={sort}>
          {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button>검색</button>
      </form>

      <details className="card">
        <summary>단어 추가</summary>
        <WordForm />
      </details>

      {error && <p className="notice">{error.message}</p>}
      <table>
        <thead><tr><th style={{ width: '24%' }}>단어</th><th>뜻</th><th style={{ width: 70 }}>중요도</th><th style={{ width: 80 }}>상태</th></tr></thead>
        <tbody>
          {words.map((w) => (
            <tr key={w.id}>
              <td>
                <strong>{w.term}</strong>
                {w.english_name && <div className="muted small">{w.english_name}</div>}
                {w.category && <div className="muted small">{w.category}</div>}
              </td>
              <td>
                <details>
                  <summary style={{ cursor: 'pointer' }}>{w.meaning}</summary>
                  <WordForm word={w} />
                </details>
              </td>
              <td>{w.importance}</td>
              <td className="stack">
                <span className={`badge ${w.is_active ? 'ok' : 'muted'}`}>{w.is_active ? '활성' : '비활성'}</span>
                {w.needs_check && <div><span className="badge warn">확인 필요</span></div>}
              </td>
            </tr>
          ))}
          {!words.length && <tr><td colSpan={4} className="muted">결과 없음</td></tr>}
        </tbody>
      </table>

      <div className="row" style={{ marginTop: 12 }}>
        {page > 1 && <Link href={href({ page: page - 1 })}>← 이전</Link>}
        <span className="muted small">{page} / {pages}</span>
        {page < pages && <Link href={href({ page: page + 1 })}>다음 →</Link>}
      </div>
    </>
  );
}
