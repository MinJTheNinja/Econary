'use client';

import { useActionState } from 'react';
import { createWord, updateWord } from './actions';

export interface WordRow {
  id: number;
  term: string;
  meaning: string;
  english_name: string | null;
  category: string | null;
  importance: number;
  is_active: boolean;
  needs_check: boolean;
}

const EMPTY: Omit<WordRow, 'id'> = {
  term: '', meaning: '', english_name: null, category: null, importance: 50, is_active: true, needs_check: false,
};

/** 단어 수정(word 있음) 또는 추가(word 없음) 폼 */
export function WordForm({ word }: { word?: WordRow }) {
  const [state, action, pending] = useActionState(word ? updateWord : createWord, null);
  const w = word ?? { id: 0, ...EMPTY };
  return (
    <form action={action} className="stack" style={{ paddingTop: 8 }}>
      {word && <input type="hidden" name="id" value={w.id} />}
      <div className="row">
        <input name="term" defaultValue={w.term} placeholder="단어" required style={{ flex: '1 1 160px' }} />
        <input name="english_name" defaultValue={w.english_name ?? ''} placeholder="영문명" style={{ flex: '1 1 140px' }} />
        <input name="category" defaultValue={w.category ?? ''} placeholder="카테고리" style={{ width: 100 }} />
      </div>
      <textarea name="meaning" defaultValue={w.meaning} rows={2} placeholder="뜻" required />
      <div className="row">
        <label>중요도 <input type="number" name="importance" min={0} max={100} defaultValue={w.importance} /></label>
        <label><input type="checkbox" name="is_active" defaultChecked={w.is_active} /> 활성 (신규 학습 배정)</label>
        <label><input type="checkbox" name="needs_check" defaultChecked={w.needs_check} /> 뜻 확인 필요</label>
        <button className="primary" disabled={pending}>{word ? '저장' : '추가'}</button>
        {state?.ok && <span className="small" style={{ color: 'var(--ok)' }}>{state.ok}</span>}
        {state?.error && <span className="small" style={{ color: 'var(--bad)' }}>{state.error}</span>}
      </div>
    </form>
  );
}
