-- 학습 v2:
--  1) 오늘 단어: 고르는 기준(이월·검수 퀴즈 있음·중요도)은 그대로, 오늘 목록 안의 순서(position)만 무작위
--  2) 뜻 퀴즈 보기: 잘라내지 않는다 (첫 문장 전체). 108자 + '…' 로 끊겨 보기를 읽을 수 없던 문제
--  3) 내용 퀴즈 선지별 설명 choice_notes: 제출 뒤에만 RPC 로 공개 (오답을 고르면 왜 틀렸는지 보여 준다)
--  4) 복습: 망각 곡선(FSRS) 상태 stability(일)·difficulty(1~10). 계산은 지금처럼 클라이언트(core/memory)

-- 1) ------------------------------------------------------------------------------------------
create or replace function public.get_or_create_today_assignment()
returns setof public.daily_assignments
language plpgsql security definer set search_path = public as $$
declare
  uid   uuid := auth.uid();
  today date := public.kst_today();
  quota int;
  have  int;
  last_pos int;
begin
  if uid is null then raise exception 'not authenticated'; end if;

  select gp.quota into quota from public.get_my_plan() gp;
  quota := greatest(coalesce(quota, 10), 0);

  select count(*), coalesce(max(position), 0) into have, last_pos
    from daily_assignments where user_id = uid and assign_date = today;

  if have < quota then
    insert into daily_assignments (user_id, assign_date, word_id, position)
    -- 고르기는 우선순위대로(limit), 순서는 무작위
    select uid, today, c.word_id, last_pos + row_number() over (order by random())
    from (
      select w.id as word_id, w.importance,
             case when carry.word_id is not null then 0 else 1 end as bucket,
             exists (select 1 from word_contents q
                      where q.word_id = w.id and q.kind = 'quiz' and q.review_status = 'approved') as has_quiz
        from words w
        left join lateral (
          select da.word_id from daily_assignments da
           where da.user_id = uid and da.word_id = w.id and da.assign_date < today
           group by da.word_id
          having bool_and(da.quiz_completed_at is null)
        ) carry on true
       where w.is_active
         and not exists (select 1 from daily_assignments t
                          where t.user_id = uid and t.assign_date = today and t.word_id = w.id)
         and (carry.word_id is not null
              or not exists (select 1 from daily_assignments da2 where da2.user_id = uid and da2.word_id = w.id))
       order by bucket, has_quiz desc, w.importance desc, w.id
       limit quota - have
    ) c
    on conflict do nothing;
  elsif have > quota then
    delete from daily_assignments d
     using (
       select word_id from daily_assignments
        where user_id = uid and assign_date = today
          and content_viewed_at is null and quiz_completed_at is null
        order by position desc
        limit have - quota
     ) x
     where d.user_id = uid and d.assign_date = today and d.word_id = x.word_id;
  end if;

  return query select * from daily_assignments
                where user_id = uid and assign_date = today order by position;
end $$;

-- 2) ------------------------------------------------------------------------------------------
create or replace function public.short_meaning(m text) returns text
language sql immutable as $$
  select coalesce(nullif(substring(m from '^(.+?[.。])(\s|$)'), ''), m)
$$;

-- 3) ------------------------------------------------------------------------------------------
alter table public.word_contents add column choice_notes jsonb;
alter table public.word_contents add constraint choice_notes_shape check (
  choice_notes is null or (kind = 'quiz' and jsonb_typeof(choice_notes) = 'array'
                           and jsonb_array_length(choice_notes) = jsonb_array_length(choices)));
-- 학습자 열 권한(select 목록)에는 넣지 않는다: 정답 근거가 들어 있어 제출 전에는 숨긴다

drop function public.submit_quiz_attempt(uuid, bigint, int, text);
create function public.submit_quiz_attempt(
  p_client_attempt_id uuid,
  p_content_id        bigint,
  p_selected_index    int,
  p_context           text
) returns table (attempt_id bigint, is_correct boolean, answer_index int, answer_explanation text,
                 choice_notes jsonb, already_recorded boolean)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  q   word_contents%rowtype;
  existing quiz_attempts%rowtype;
begin
  if uid is null then raise exception 'not authenticated'; end if;

  select * into q from word_contents
   where id = p_content_id and kind = 'quiz' and review_status = 'approved' and answer_index is not null;
  if not found then raise exception 'quiz not available'; end if;

  select * into existing from quiz_attempts
   where user_id = uid and client_attempt_id = p_client_attempt_id;
  if found then
    return query select existing.id, existing.is_correct, q.answer_index, q.answer_explanation, q.choice_notes, true;
    return;
  end if;

  insert into quiz_attempts (user_id, client_attempt_id, word_id, content_id, context, selected_index, is_correct)
  values (uid, p_client_attempt_id, q.word_id, q.id, p_context, p_selected_index, p_selected_index = q.answer_index)
  returning * into existing;

  if p_context = 'new' then
    update daily_assignments
       set quiz_completed_at = coalesce(quiz_completed_at, now()),
           content_viewed_at = coalesce(content_viewed_at, now())
     where user_id = uid and word_id = q.word_id and quiz_completed_at is null;
  end if;

  return query select existing.id, existing.is_correct, q.answer_index, q.answer_explanation, q.choice_notes, false;
end $$;
revoke execute on function public.submit_quiz_attempt(uuid, bigint, int, text) from public, anon;
grant execute on function public.submit_quiz_attempt(uuid, bigint, int, text) to authenticated;

-- 4) ------------------------------------------------------------------------------------------
alter table public.review_schedule
  add column stability  numeric(8,2),
  add column difficulty numeric(4,2) check (difficulty is null or difficulty between 1 and 10);
-- 기존 SM-2 상태에서 옮기기: 안정도 ≈ 마지막 간격, 난이도는 ease(1.3~3.0)를 10~2 로 뒤집어 환산
update public.review_schedule
   set stability  = greatest(interval_days, 1),
       difficulty = round(least(10, greatest(1, 10 - (ease - 1.3) / 1.7 * 8)), 2)
 where stability is null;
