import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { adminDb } from '@/lib/supabase';
import { signOut } from '../login/actions';

const ROLE_LABEL = { content_admin: '콘텐츠 관리자', quality_admin: '품질 관리자' } as const;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  const db = adminDb();
  const [pending, candidates, reports] = await Promise.all([
    db.from('word_contents').select('id', { count: 'exact', head: true }).eq('review_status', 'pending'),
    db.from('term_candidates').select('normalized_term', { count: 'exact', head: true }).eq('status', 'open'),
    db.from('content_reports').select('id', { count: 'exact', head: true }).eq('status', 'open'),
  ]);

  const nav: [string, string, number | null][] = [
    ['/', '개요', null],
    ['/review', '검수 대기', pending.count ?? 0],
    ['/words', '단어 목록', null],
    ['/candidates', '단어 후보', candidates.count ?? 0],
    ['/reports', '오류 신고', reports.count ?? 0],
    ['/exams', 'TESAT 회차', null],
    ['/runs', '파이프라인', null],
  ];

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">Econary 관리</div>
        <nav>
          {nav.map(([href, label, n]) => (
            <Link key={href} href={href}>
              <span>{label}</span>
              {n ? <span className="badge warn">{n}</span> : null}
            </Link>
          ))}
        </nav>
        <div className="who">
          <div>{admin.email}</div>
          <div>{ROLE_LABEL[admin.role]}</div>
          <form action={signOut} style={{ marginTop: 8 }}>
            <button className="small">로그아웃</button>
          </form>
        </div>
      </aside>
      <main>{children}</main>
    </div>
  );
}
