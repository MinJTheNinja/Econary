'use client';

import { useActionState } from 'react';
import { resolveCandidate } from './actions';

export interface Candidate {
  normalized_term: string;
  term: string;
  english_name: string | null;
  definition: string | null;
  category: string | null;
  best_score: number;
  best_grade: string | null;
  seen_count: number;
  sources: string[];
  last_source_url: string | null;
  last_seen: string;
}

export function CandidateRow({ c }: { c: Candidate }) {
  const [state, action, pending] = useActionState(resolveCandidate, null);
  if (state?.done) {
    return <div className="card small muted">{c.term} — {state.done === 'added' ? '단어 목록에 추가됨' : '무시함'}</div>;
  }
  return (
    <form action={action} className="card stack">
      <input type="hidden" name="normalized_term" value={c.normalized_term} />
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="row">
          <input name="term" defaultValue={c.term} style={{ fontWeight: 600 }} />
          <input name="english_name" defaultValue={c.english_name ?? ''} placeholder="영문명" />
          <input name="category" defaultValue={c.category ?? ''} placeholder="카테고리" style={{ width: 140 }} />
        </div>
        <span className="small muted">
          점수 {c.best_score} ({c.best_grade}) · {c.seen_count}회 · {c.sources.join(', ')} · 최근 {c.last_seen}
          {c.last_source_url && <> · <a href={c.last_source_url} target="_blank" rel="noreferrer">기사</a></>}
        </span>
      </div>
      <textarea name="meaning" defaultValue={c.definition ?? ''} rows={2} placeholder="뜻 (자동 추출된 정의 — 확인 후 수정)" />
      <div className="row">
        <label>중요도 <input type="number" name="importance" min={0} max={100} defaultValue={50} /></label>
        <button className="primary" name="decision" value="add" disabled={pending}>단어 목록에 추가</button>
        <button name="decision" value="ignore" disabled={pending}>무시</button>
        {state?.error && <span className="small" style={{ color: 'var(--bad)' }}>{state.error}</span>}
      </div>
    </form>
  );
}
