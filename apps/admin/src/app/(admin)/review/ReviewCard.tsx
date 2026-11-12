'use client';

import { useActionState } from 'react';
import { decide } from './actions';

export interface PendingContent {
  id: number;
  kind: 'explanation' | 'quiz';
  body: string;
  choices: string[] | null;
  answer_index: number | null;
  answer_explanation: string | null;
  /** 보기마다 '고르면 보여 줄 설명' (없으면 null) */
  choice_notes: string[] | null;
  topic: string | null;
}

/** 콘텐츠 하나의 검수 폼: 필요하면 문구를 고친 뒤 승인, 또는 사유와 함께 제외 */
export function ReviewCard({ c }: { c: PendingContent }) {
  const [state, action, pending] = useActionState(decide, null);

  if (state?.done) {
    return (
      <p className="small" style={{ margin: '8px 0', color: state.done === 'approved' ? 'var(--ok)' : 'var(--muted)' }}>
        {c.kind === 'quiz' ? '퀴즈' : '설명'} {state.done === 'approved' ? '승인됨 — 학습자에게 게시' : '제외됨'}
      </p>
    );
  }

  return (
    <form action={action} className="stack" style={{ borderTop: '1px solid var(--line)', paddingTop: 10, marginTop: 10 }}>
      <input type="hidden" name="id" value={c.id} />
      <input type="hidden" name="kind" value={c.kind} />
      <div className="row">
        <span className="badge muted">{c.kind === 'quiz' ? '퀴즈' : '시사 설명'}</span>
        <input name="topic" defaultValue={c.topic ?? ''} placeholder="시사 주제 한 줄" style={{ flex: 1 }} />
      </div>
      <textarea name="body" defaultValue={c.body} rows={c.kind === 'quiz' ? 2 : 3} />
      {c.kind === 'quiz' && (
        <>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} style={{ display: 'grid', gap: 4 }}>
              <label className="row">
                <input type="radio" name="answer_index" value={i} defaultChecked={c.answer_index === i} title="정답" />
                <input name={`choice${i}`} defaultValue={c.choices?.[i] ?? ''} placeholder={`보기 ${i + 1}`} style={{ flex: 1 }} />
              </label>
              <input
                name={`note${i}`} defaultValue={c.choice_notes?.[i] ?? ''} style={{ marginLeft: 24, fontSize: 13 }}
                placeholder={c.answer_index === i ? '이 보기가 정답인 이유' : '이 보기를 고르면 보여 줄 설명 (어떤 개념이라 틀렸는지)'}
              />
            </div>
          ))}
          <textarea name="answer_explanation" defaultValue={c.answer_explanation ?? ''} rows={2} placeholder="정답 해설" />
        </>
      )}
      <div className="row">
        <button className="primary" name="decision" value="approve" disabled={pending}>승인</button>
        <button className="danger" name="decision" value="exclude" disabled={pending}>제외</button>
        <input name="review_note" placeholder="메모 (제외 사유 등, 선택)" style={{ flex: 1 }} />
      </div>
      {state?.error && <p className="small" style={{ color: 'var(--bad)', margin: 0 }}>{state.error}</p>}
    </form>
  );
}
