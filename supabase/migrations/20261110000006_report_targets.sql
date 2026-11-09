-- Phase 6: 오류 신고 대상 확장 (PRD 7.1)
-- 생성 콘텐츠(시사 설명·시사 퀴즈) 외에 고정 단어의 뜻과, 그 뜻으로 만든 뜻 고르기 퀴즈도 신고할 수 있어야 한다.
-- 이 둘은 word_contents 행이 없으므로 content_id 를 비우고 target 으로 무엇을 신고했는지 구분한다.

alter table public.content_reports alter column content_id drop not null;
alter table public.content_reports add column target text not null default 'quiz'
  check (target in ('word_meaning', 'explanation', 'quiz', 'meaning_quiz'));
update public.content_reports r
   set target = (select case c.kind when 'explanation' then 'explanation' else 'quiz' end
                   from public.word_contents c where c.id = r.content_id)
 where r.content_id is not null;
alter table public.content_reports add constraint content_reports_target_content check (
  (target in ('explanation', 'quiz')) = (content_id is not null)
);
