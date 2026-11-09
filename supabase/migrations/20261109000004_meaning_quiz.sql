-- Phase 4: 뜻 고르기 퀴즈 (대체 퀴즈)
--
-- 파이프라인이 만든 검수 퀴즈는 시사 이슈에 걸린 일부 단어에만 생긴다. 하지만 학습 완료에는 퀴즈 제출이 필요하므로
-- (PRD 6.1), 검수 퀴즈가 없는 단어는 관리자가 관리하는 고정 단어 목록의 뜻으로 4지선다를 만든다 (PRD 4: "단어 목록과
-- 뜻을 기반으로 생성"). 정답은 단어 자신의 뜻이고, 오답은 다른 활성 단어의 뜻이다. 채점은 서버에서 한다.

alter table public.quiz_attempts alter column content_id drop not null;
alter table public.quiz_attempts add column quiz_kind text not null default 'content'
  check (quiz_kind in ('content', 'meaning'));
alter table public.quiz_attempts add constraint quiz_attempts_content_required
  check (quiz_kind = 'meaning' or content_id is not null);

-- 보기용으로 뜻을 짧게: 첫 문장(마침표 기준), 최대 110자
create or replace function public.short_meaning(m text) returns text
language sql immutable as $$
  select case
    when length(s) > 110 then left(s, 108) || '…'
    else s end
  from (select coalesce(nullif(substring(m from '^(.+?[.。])(\s|$)'), ''), m) as s) x
$$;

-- 단어 하나의 뜻 고르기 보기 4개 (정답 1 + 오답 3, 섞어서). 같은 카테고리 단어를 오답으로 우선.
-- 정답 여부는 돌려주지 않는다 (choice_word_id 가 문제 단어 id 와 같은 것이 정답이지만, 학습 화면에서 이미
-- 뜻을 본 뒤 푸는 복습형 확인 문제라 숨길 실익이 적다. 채점은 submit_meaning_quiz 가 한다).
create or replace function public.get_meaning_quiz(p_word_id bigint)
returns table (choice_word_id bigint, text text)
language sql security definer set search_path = public as $$
  with target as (select id, category, meaning from words where id = p_word_id),
  distractors as (
    select w.id, w.meaning
      from words w, target t
     where w.id <> t.id and w.is_active and not w.needs_check
       and public.short_meaning(w.meaning) <> public.short_meaning(t.meaning)
     order by (w.category is not distinct from t.category) desc, random()
     limit 3
  )
  select id, public.short_meaning(meaning) from (
    select id, meaning from target
    union all
    select id, meaning from distractors
  ) c
  order by random()
$$;

-- 뜻 고르기 제출. submit_quiz_attempt 와 같은 멱등·완료 처리 규칙.
create or replace function public.submit_meaning_quiz(
  p_client_attempt_id uuid,
  p_word_id           bigint,
  p_selected_word_id  bigint,
  p_context           text
) returns table (attempt_id bigint, is_correct boolean, answer_word_id bigint, answer_text text, already_recorded boolean)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  w   words%rowtype;
  existing quiz_attempts%rowtype;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select * into w from words where id = p_word_id;
  if not found then raise exception 'word not found'; end if;

  select * into existing from quiz_attempts where user_id = uid and client_attempt_id = p_client_attempt_id;
  if found then
    return query select existing.id, existing.is_correct, w.id, public.short_meaning(w.meaning), true;
    return;
  end if;

  insert into quiz_attempts (user_id, client_attempt_id, word_id, content_id, quiz_kind, context, selected_index, is_correct)
  values (uid, p_client_attempt_id, w.id, null, 'meaning', p_context,
          -1, p_selected_word_id = w.id)   -- selected_index 는 content 퀴즈 전용, 뜻 고르기는 -1
  returning * into existing;

  if p_context = 'new' then
    update daily_assignments
       set quiz_completed_at = coalesce(quiz_completed_at, now()),
           content_viewed_at = coalesce(content_viewed_at, now())
     where user_id = uid and word_id = w.id and quiz_completed_at is null;
  end if;

  return query select existing.id, existing.is_correct, w.id, public.short_meaning(w.meaning), false;
end $$;

revoke execute on function public.get_meaning_quiz(bigint) from public, anon;
revoke execute on function public.submit_meaning_quiz(uuid, bigint, bigint, text) from public, anon;
grant execute on function public.get_meaning_quiz(bigint) to authenticated;
grant execute on function public.submit_meaning_quiz(uuid, bigint, bigint, text) to authenticated;

-- 배정 우선순위의 "퀴즈 있는 단어 우선" 은 그대로 둔다: 검수 퀴즈가 있는 단어(시사성 있음)를 먼저 배정.
