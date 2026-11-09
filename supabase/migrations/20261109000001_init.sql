-- TESAT 시사 어휘 학습 앱 — 초기 스키마
-- PRD 참조: docs/PRD_기능명세서_2026-11-09.xlsx (요구사항 1~8)
-- 미결정 정책은 docs/open-decisions.md 참고.
--
-- 권한 모델
--   학습자(authenticated, 익명 포함): 본인 학습 데이터만 읽기/쓰기, 승인된 콘텐츠만 읽기.
--   관리자 웹/파이프라인: service_role 키로 서버에서만 접근 (RLS 우회). profiles.role 은 관리자 웹 로그인 게이트용.

-- ───────────────────────────── 공통 ─────────────────────────────

create or replace function public.kst_today() returns date
language sql stable as $$ select (now() at time zone 'Asia/Seoul')::date $$;

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;

-- 파이프라인 pipeline/word_linker 의 _norm_term 과 동일한 규칙 (소문자, 공백·구두점 제거)
create or replace function public.normalize_term(t text) returns text
language sql immutable as $$
  select regexp_replace(lower(coalesce(t, '')), '[[:space:]\-_/()\[\]·,.''"]+', '', 'g')
$$;

-- ───────────────────────────── 1. 핵심 단어 ─────────────────────────────

create table public.level_settings (
  level            text primary key,              -- 'beginner' | 'basic' | 'advanced'
  label            text not null,
  daily_new_count  int  not null check (daily_new_count between 1 and 100),
  sort_order       int  not null default 0
);

insert into public.level_settings (level, label, daily_new_count, sort_order) values
  ('beginner', '입문', 5, 1),
  ('basic',    '기본', 10, 2),
  ('advanced', '심화', 20, 3);

create table public.words (
  id               bigint generated always as identity primary key,
  term             text not null check (length(trim(term)) > 0),
  normalized_term  text generated always as (public.normalize_term(term)) stored,
  english_name     text,
  meaning          text not null,
  category         text,
  importance       int  not null default 50 check (importance between 0 and 100), -- 관리자 수동 입력 (PRD 1.1)
  is_active        boolean not null default true,  -- false 면 신규 배정 제외, 기존 이력은 보존
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint words_normalized_term_key unique (normalized_term)   -- 중복 단어 방지 (PRD 1.1 예외)
);
create index words_priority_idx on public.words (importance desc, id) where is_active;
create trigger words_touch before update on public.words
  for each row execute function public.touch_updated_at();

-- ───────────────────────────── 2. 시사 콘텐츠 파이프라인 ─────────────────────────────

create table public.pipeline_runs (
  id           bigint generated always as identity primary key,
  source       text not null check (source in ('ytn', 'hankyung')),
  run_date     date not null default public.kst_today(),
  stage        text not null check (stage in ('fetch', 'parse', 'link', 'generate')),
  status       text not null check (status in ('ok', 'fetch_failed', 'parse_failed', 'no_match', 'generate_failed')),
  item_count   int  not null default 0,
  detail       text,
  created_at   timestamptz not null default now()
);
create index pipeline_runs_date_idx on public.pipeline_runs (run_date desc, source);

create table public.word_contents (
  id                  bigint generated always as identity primary key,
  word_id             bigint not null references public.words(id) on delete cascade,
  kind                text not null check (kind in ('explanation', 'quiz')),
  body                text not null check (length(body) <= 600),   -- 짧은 설명/문항만. 기사 장문 복사 금지
  choices             jsonb,                                       -- quiz: ["보기1", ...]
  answer_index        int,                                         -- quiz: 정답 보기 index (학습자에게 컬럼 비공개)
  answer_explanation  text,                                        -- quiz: 정답 해설 (제출 후 RPC로만 공개)
  source              text not null check (source in ('ytn', 'hankyung', 'manual')),
  topic               text,                                        -- 연결된 시사 주제 (자체 요약 한 줄)
  source_date         date,
  pipeline_run_id     bigint references public.pipeline_runs(id) on delete set null,
  review_status       text not null default 'pending' check (review_status in ('pending', 'approved', 'excluded')),
  reviewed_at         timestamptz,
  review_note         text,
  created_at          timestamptz not null default now(),
  constraint quiz_shape check (
    kind <> 'quiz' or (
      jsonb_typeof(choices) = 'array'
      and jsonb_array_length(choices) between 2 and 5
    )
  ),
  -- 정답 데이터 없는 퀴즈는 승인 불가 (PRD 2.2, 4.1)
  constraint quiz_approvable check (
    kind <> 'quiz' or review_status <> 'approved' or (
      answer_index is not null
      and answer_index >= 0
      and answer_index < jsonb_array_length(choices)
      and answer_explanation is not null
    )
  )
);
create index word_contents_word_idx on public.word_contents (word_id, kind) where review_status = 'approved';
create index word_contents_review_idx on public.word_contents (review_status, created_at);

-- ───────────────────────────── 3. 학습자 ─────────────────────────────

create table public.profiles (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  level        text not null default 'basic' references public.level_settings(level),
  role         text not null default 'learner' check (role in ('learner', 'content_admin', 'quality_admin')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- 가입(익명 포함) 시 프로필 자동 생성
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- 일일 신규 학습 배정 (PRD 3.2). 완료하지 못한 항목도 행이 남아 이력 보존.
create table public.daily_assignments (
  user_id            uuid not null references auth.users(id) on delete cascade,
  assign_date        date not null,
  word_id            bigint not null references public.words(id),
  position           int  not null,
  content_viewed_at  timestamptz,   -- 뜻/설명 확인
  quiz_completed_at  timestamptz,   -- 퀴즈 제출 (학습 완료 = 확인 + 제출, PRD 6.1)
  primary key (user_id, assign_date, word_id)
);
create index daily_assignments_word_idx on public.daily_assignments (user_id, word_id);

-- 퀴즈 시도 (PRD 4.1). client_attempt_id 로 재시도/중복 제출 시 같은 시도는 한 번만 기록 (PRD 5).
create table public.quiz_attempts (
  id                 bigint generated always as identity primary key,
  user_id            uuid not null references auth.users(id) on delete cascade,
  client_attempt_id  uuid not null,
  word_id            bigint not null references public.words(id),
  content_id         bigint not null references public.word_contents(id),
  context            text not null check (context in ('new', 'review')),
  selected_index     int  not null,
  is_correct         boolean not null,
  submitted_at       timestamptz not null default now(),
  constraint quiz_attempts_client_key unique (user_id, client_attempt_id)
);
create index quiz_attempts_user_idx on public.quiz_attempts (user_id, submitted_at desc);

-- 간격 반복 일정 (PRD 5.1). 계산식은 packages/core/src/srs.ts
create table public.review_schedule (
  user_id           uuid not null references auth.users(id) on delete cascade,
  word_id           bigint not null references public.words(id),
  due_date          date not null,
  interval_days     int  not null default 0,
  ease              numeric(4,2) not null default 2.5,
  reps              int  not null default 0,
  lapses            int  not null default 0,
  graduated         boolean not null default false,
  last_reviewed_at  timestamptz,
  primary key (user_id, word_id)
);
create index review_schedule_due_idx on public.review_schedule (user_id, due_date) where not graduated;

-- 콘텐츠 오류 신고 (PRD 7)
create table public.content_reports (
  id          bigint generated always as identity primary key,
  user_id     uuid references auth.users(id) on delete set null,
  word_id     bigint not null references public.words(id),
  content_id  bigint not null references public.word_contents(id),
  reason      text not null check (reason in ('wrong_meaning', 'wrong_answer', 'outdated', 'typo', 'other')),
  note        text check (length(note) <= 500),
  status      text not null default 'open' check (status in ('open', 'reviewed', 'dismissed')),
  created_at  timestamptz not null default now()
);
create index content_reports_status_idx on public.content_reports (status, created_at desc);

-- ───────────────────────────── RLS ─────────────────────────────

alter table public.level_settings    enable row level security;
alter table public.words             enable row level security;
alter table public.pipeline_runs     enable row level security;
alter table public.word_contents     enable row level security;
alter table public.profiles          enable row level security;
alter table public.daily_assignments enable row level security;
alter table public.quiz_attempts     enable row level security;
alter table public.review_schedule   enable row level security;
alter table public.content_reports   enable row level security;

create policy "levels readable" on public.level_settings for select to authenticated using (true);

-- 비활성 단어도 읽기 허용: 과거 학습 이력 표시용. 신규 배정에서는 RPC가 제외.
create policy "words readable" on public.words for select to authenticated using (true);

create policy "approved content readable" on public.word_contents for select to authenticated
  using (review_status = 'approved');
-- 정답/해설 컬럼은 학습자에게 비공개 → 제출 후 submit_quiz_attempt RPC 로만 공개
revoke select on public.word_contents from anon, authenticated;
grant select (id, word_id, kind, body, choices, source, topic, source_date) on public.word_contents to authenticated;

create policy "own profile read"   on public.profiles for select to authenticated using (user_id = auth.uid());
create policy "own profile update" on public.profiles for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
-- 학습자가 자기 role 을 올리지 못하도록 level 컬럼만 수정 허용
revoke update on public.profiles from anon, authenticated;
grant update (level) on public.profiles to authenticated;

create policy "own assignments read" on public.daily_assignments for select to authenticated
  using (user_id = auth.uid());
create policy "own assignments update" on public.daily_assignments for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke update on public.daily_assignments from anon, authenticated;
grant update (content_viewed_at) on public.daily_assignments to authenticated;

create policy "own attempts read" on public.quiz_attempts for select to authenticated
  using (user_id = auth.uid());
-- insert 는 submit_quiz_attempt RPC 로만 (정오답을 서버가 판정)

create policy "own schedule all" on public.review_schedule for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own reports insert" on public.content_reports for insert to authenticated
  with check (user_id = auth.uid());
create policy "own reports read" on public.content_reports for select to authenticated
  using (user_id = auth.uid());

-- pipeline_runs: 학습자 접근 없음 (정책 없음 = 거부). service_role 만.

-- ───────────────────────────── RPC ─────────────────────────────

-- 오늘의 신규 학습 배정 (PRD 3.2). 이미 오늘 배정이 있으면 그대로 반환 (멱등).
-- 우선순위: ① 지난 날 배정됐지만 퀴즈를 제출하지 않은 활성 단어(이월)
--           ② 한 번도 배정되지 않은 활성 단어, 중요도 내림차순
--           ③ 승인된 퀴즈가 있는 단어 우선 (퀴즈로 이어가야 하므로)
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
    select ls.daily_new_count into quota
      from profiles p join level_settings ls on ls.level = p.level
     where p.user_id = uid;
    quota := coalesce(quota, 10);

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

  return query select * from daily_assignments
                where user_id = uid and assign_date = today order by position;
end $$;

-- 퀴즈 제출 (PRD 4.1). 서버가 정오답 판정, client_attempt_id 로 멱등.
-- 반환: 정답 여부, 정답 index, 해설. 다음 복습일 계산은 클라이언트가 core/srs 로 review_schedule 에 upsert.
create or replace function public.submit_quiz_attempt(
  p_client_attempt_id uuid,
  p_content_id        bigint,
  p_selected_index    int,
  p_context           text
) returns table (attempt_id bigint, is_correct boolean, answer_index int, answer_explanation text, already_recorded boolean)
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
    return query select existing.id, existing.is_correct, q.answer_index, q.answer_explanation, true;
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

  return query select existing.id, existing.is_correct, q.answer_index, q.answer_explanation, false;
end $$;

revoke execute on function public.get_or_create_today_assignment() from public, anon;
revoke execute on function public.submit_quiz_attempt(uuid, bigint, int, text) from public, anon;
grant execute on function public.get_or_create_today_assignment() to authenticated;
grant execute on function public.submit_quiz_attempt(uuid, bigint, int, text) to authenticated;
