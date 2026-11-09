-- Phase 5: 복습 완료 구분
-- 신규 학습 퀴즈도 다음 복습일을 정하지만 "오늘 복습을 한 것"은 아니다. 오늘 복습 목록의 완료 표시는
-- 복습 흐름에서 푼 경우만 세야 하므로 마지막 일정 갱신이 어떤 흐름에서 왔는지 기록한다.
alter table public.review_schedule
  add column last_context text not null default 'new' check (last_context in ('new', 'review'));
