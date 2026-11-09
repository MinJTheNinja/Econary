-- 첫 실행 온보딩 + 시험일 기반 학습 계획
-- 사용자가 고른 TESAT 회차(시험일)와 하루 공부 시간으로 매일 신규 단어 수를 계산한다. 기존 레벨(입문/기본/심화)을 대체.
-- 계산 규칙은 packages/core/src/plan.ts 와 같아야 한다 (온보딩 미리보기). 상수: config.ts PLAN.

-- ───────── TESAT 회차 (관리자 웹에서 관리, 학습자는 읽기만) ─────────
create table public.exam_rounds (
  id          bigint generated always as identity primary key,
  round       int  not null unique check (round > 0),
  exam_date   date not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
alter table public.exam_rounds enable row level security;
create policy "exam rounds readable" on public.exam_rounds for select to authenticated using (true);
revoke insert, update, delete on public.exam_rounds from anon, authenticated;

-- 공식 일정 (tesat.or.kr, 2026-11-10 확인). 이후 회차는 관리자 웹에서 추가.
insert into public.exam_rounds (round, exam_date) values (110, '2026-12-19');

-- ───────── 학습자 프로필 ─────────
alter table public.profiles
  add column exam_round_id  bigint references public.exam_rounds(id) on delete set null,
  add column daily_minutes  int check (daily_minutes in (10, 20, 30, 60)),
  add column onboarded_at   timestamptz;

revoke update on public.profiles from anon, authenticated;
grant update (level, exam_round_id, daily_minutes, onboarded_at) on public.profiles to authenticated;

-- ───────── 계산 (순수 함수: core/plan.ts buildPlan 과 동일) ─────────
-- capacity = min(분 × 1, 50). 시험 없음/지남 → capacity.
-- 시험 전 마지막 7일은 복습 기간(신규 0) — 단, 아직 하나도 배우지 않았다면 그대로 배정.
-- 그 외 needed = ceil(remaining / (daysLeft - 7, 최소 1)), quota = clamp(needed, 3, capacity).
create or replace function public.plan_quota(p_remaining int, p_learned int, p_days_left int, p_minutes int)
returns table (quota int, phase text, learn_days int)
language sql immutable as $$
  with k as (select least(p_minutes * 1, 50) as cap, 3 as min_daily, 7 as review_days)
  select
    case
      when p_days_left is null or p_days_left <= 0 then k.cap
      when p_days_left <= k.review_days and p_learned > 0 then 0
      else least(k.cap, greatest(k.min_daily,
             ceil(p_remaining::numeric / greatest(1, p_days_left - k.review_days))::int))
    end,
    case
      when p_days_left is null or p_days_left <= 0 then 'open'
      when p_days_left <= k.review_days and p_learned > 0 then 'review'
      else 'learn'
    end,
    case
      when p_days_left is null or p_days_left <= 0 then null
      when p_days_left <= k.review_days and p_learned > 0 then 0
      else greatest(1, p_days_left - k.review_days)
    end
  from k
$$;

-- 사용자의 오늘 계획. remaining 은 '어제까지 학습 완료한 단어'를 뺀 활성 단어 수라서 하루 중 다시 불러도 같다.
-- daily_minutes 가 없으면(온보딩 전 기존 학습자) 레벨의 하루 개수로 폴백.
create or replace function public.get_my_plan()
returns table (
  quota int, phase text, learn_days int, days_left int, remaining int, learned int,
  exam_round int, exam_date date, daily_minutes int
)
language plpgsql stable security definer set search_path = public as $$
declare
  uid   uuid := auth.uid();
  today date := public.kst_today();
  p     profiles%rowtype;
  er    exam_rounds%rowtype;
  v_learned int;
  v_remaining int;
  v_days int;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select * into p from profiles where user_id = uid;
  if p.exam_round_id is not null then select * into er from exam_rounds where id = p.exam_round_id; end if;

  select count(distinct da.word_id)::int into v_learned
    from daily_assignments da
   where da.user_id = uid and da.quiz_completed_at is not null and da.assign_date < today;
  select count(*)::int into v_remaining
    from words w
   where w.is_active
     and not exists (select 1 from daily_assignments da
                      where da.user_id = uid and da.word_id = w.id
                        and da.quiz_completed_at is not null and da.assign_date < today);
  v_days := case when er.exam_date is null then null else er.exam_date - today end;

  if p.daily_minutes is null then
    return query
      select coalesce(ls.daily_new_count, 10), 'open'::text, null::int, v_days, v_remaining, v_learned,
             er.round, er.exam_date, null::int
        from (select 1) one left join level_settings ls on ls.level = p.level;
    return;
  end if;

  return query
    select pq.quota, pq.phase, pq.learn_days, v_days, v_remaining, v_learned, er.round, er.exam_date, p.daily_minutes
      from public.plan_quota(v_remaining, v_learned, v_days, p.daily_minutes) pq;
end $$;

revoke execute on function public.get_my_plan() from public, anon;
grant execute on function public.get_my_plan() to authenticated;

-- ───────── 오늘 배정: 하루 개수를 계획에서 ─────────
create or replace function public.get_or_create_today_assignment()
returns setof public.daily_assignments
language plpgsql security definer set search_path = public as $$
declare
  uid   uuid := auth.uid();
  today date := public.kst_today();
  quota int;
begin
  if uid is null then raise exception 'not authenticated'; end if;

  if not exists (select 1 from daily_assignments where user_id = uid and assign_date = today) then
    select gp.quota into quota from public.get_my_plan() gp;
    quota := coalesce(quota, 10);

    if quota > 0 then
      insert into daily_assignments (user_id, assign_date, word_id, position)
      select uid, today, c.word_id, row_number() over (order by c.bucket, c.has_quiz desc, c.importance desc, c.word_id)
      from (
        select w.id as word_id, w.importance,
               case when carry.word_id is not null then 0 else 1 end as bucket,
               exists (select 1 from word_contents q
                        where q.word_id = w.id and q.kind = 'quiz' and q.review_status = 'approved') as has_quiz
          from words w
          left join lateral (
            select da.word_id from daily_assignments da
             where da.user_id = uid and da.word_id = w.id
             group by da.word_id
            having bool_and(da.quiz_completed_at is null)
          ) carry on true
         where w.is_active
           and (carry.word_id is not null
                or not exists (select 1 from daily_assignments da2 where da2.user_id = uid and da2.word_id = w.id))
         order by bucket, has_quiz desc, w.importance desc, w.id
         limit quota
      ) c
      on conflict do nothing;
    end if;
  end if;

  return query select * from daily_assignments
                where user_id = uid and assign_date = today order by position;
end $$;
