-- 계정 삭제 (Google Play 계정 삭제 요구사항 · 개인정보처리방침 '파기')
-- 학습자가 앱에서 직접 자기 계정을 지운다. auth.users 행을 지우면
--   profiles · daily_assignments · quiz_attempts · review_schedule 은 on delete cascade 로 함께 삭제되고,
--   content_reports 는 user_id 가 null 이 되어 (누가 보냈는지 알 수 없는 상태로) 콘텐츠 품질 기록만 남는다.
-- 관리자(content_admin / quality_admin) 계정은 앱에서 지울 수 없다 — 관리자 웹 로그인을 실수로 잃지 않도록.

create or replace function public.delete_my_account()
returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if exists (select 1 from profiles where user_id = uid and role <> 'learner') then
    raise exception 'staff accounts cannot be deleted from the app';
  end if;
  delete from auth.users where id = uid;
end $$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
