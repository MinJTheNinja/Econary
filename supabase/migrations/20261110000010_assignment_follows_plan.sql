-- 오늘의 배정이 계획을 따라간다: 학습 계획(공부 시간·회차)을 바꾸면 오늘 배정도 바로 맞춘다.
--  * 계획 quota 보다 적으면: 같은 순서 규칙으로 모자란 만큼 추가
--  * 많으면: 아직 손대지 않은(뜻 확인·퀴즈 모두 안 한) 단어를 뒤에서부터 뺀다. 시작한 단어는 그대로 둔다
-- quota 는 '오늘 이전 완료' 기준이라 하루 안에서는 계획을 바꿀 때만 달라진다.
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
    select uid, today, c.word_id, last_pos + row_number() over (order by c.bucket, c.has_quiz desc, c.importance desc, c.word_id)
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
