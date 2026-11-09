-- Phase 2: 콘텐츠 파이프라인 보조 데이터

-- 검수용 출처 기사 링크. 학습자에게는 공개하지 않는다 (word_contents 는 컬럼 단위로 select 권한을 준다).
alter table public.word_contents add column source_url text;
alter table public.word_contents add column source_title text;

-- 기사에 자주 나오지만 고정 단어 목록에 없는 용어. 관리자가 보고 단어 목록 추가 여부를 결정한다 (자동 추가 안 함).
create table public.term_candidates (
  normalized_term  text primary key,
  term             text not null,
  english_name     text,
  definition       text,
  category         text,
  best_score       int  not null default 0,
  best_grade       text,
  seen_count       int  not null default 1,
  sources          text[] not null default '{}',
  last_source_url  text,
  first_seen       date not null default public.kst_today(),
  last_seen        date not null default public.kst_today(),
  status           text not null default 'open' check (status in ('open', 'added', 'ignored'))
);
create index term_candidates_open_idx on public.term_candidates (best_score desc) where status = 'open';
alter table public.term_candidates enable row level security;  -- 학습자 접근 없음 (service_role 만)

-- 후보 누적 (등장 횟수 +1, 최고 점수 유지). 파이프라인이 service_role 로 호출.
create or replace function public.upsert_term_candidate(
  p_term text, p_english_name text, p_definition text, p_category text,
  p_score int, p_grade text, p_source text, p_source_url text
) returns void
language sql security definer set search_path = public as $$
  insert into term_candidates (normalized_term, term, english_name, definition, category,
                               best_score, best_grade, sources, last_source_url)
  values (public.normalize_term(p_term), p_term, p_english_name, p_definition, p_category,
          p_score, p_grade, array[p_source], p_source_url)
  on conflict (normalized_term) do update set
    seen_count      = term_candidates.seen_count + 1,
    last_seen       = public.kst_today(),
    last_source_url = excluded.last_source_url,
    sources         = (select array_agg(distinct s) from unnest(term_candidates.sources || excluded.sources) s),
    best_score      = greatest(term_candidates.best_score, excluded.best_score),
    best_grade      = case when excluded.best_score > term_candidates.best_score
                           then excluded.best_grade else term_candidates.best_grade end,
    definition      = coalesce(term_candidates.definition, excluded.definition);
$$;
revoke execute on function public.upsert_term_candidate(text, text, text, text, int, text, text, text) from public, anon, authenticated;
