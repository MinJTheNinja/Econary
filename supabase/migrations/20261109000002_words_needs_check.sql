-- 원본 단어장에서 ※(뜻 확신 낮음)로 표시된 단어. 관리자 웹에서 확인 후 해제한다.
alter table public.words add column needs_check boolean not null default false;
create index words_needs_check_idx on public.words (id) where needs_check;
