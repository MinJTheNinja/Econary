# 미결정 정책 (PRD에서 "별도 결정 필요"로 남긴 항목)

코드에서는 아래 값들을 설정 상수/테이블로 분리해 두었고, 확정되면 값만 바꾸면 된다.

| 항목 | PRD 위치 | 현재 임시값 | 코드 위치 |
|---|---|---|---|
| 수준별 일일 신규 학습량 | 3.1 | 입문 5 / 기본 10 / 심화 20 | `level_settings` 테이블, `packages/core/src/config.ts` |
| 간격 반복 계산식 | 5 | SM-2 변형 (오답 시 1일로 리셋) | `packages/core/src/srs.ts` |
| 최대 복습 횟수 | 5 | 8회 정답 후 졸업 | `packages/core/src/config.ts` |
| 일일 학습 완료 조건(연속학습 기준) | 6.1 | 오늘 배정된 신규 단어 전부 퀴즈 제출 | `packages/core/src/progress.ts` |
| 비활성 단어의 기존 이력 보존 | 1 | 보존 (신규 배정만 제외) | `words.is_active` |
| 비로그인 이력/기기 간 동기화 | 6 | 익명 계정으로 서버 저장, Apple/Google 로그인 연결 시 동기화 | Supabase anonymous auth |
| 운영 지표 산식·집계 기준 | 8 | PostHog 에서 보기로 결정 (관리자 웹에 직접 만들지 않음). 이벤트 설계·연동은 나중에 | 보류 |
| 하루 경계 시간대 | — | Asia/Seoul 자정 | `packages/core/src/date.ts` |
| 검수 퀴즈 없는 단어의 퀴즈 | 4, 6.1 | 고정 단어 목록 뜻으로 만든 "뜻 고르기" 4지선다 (서버 채점, 오답은 같은 카테고리 우선, 확인 필요 단어 제외) | `supabase/migrations/20261109000004_meaning_quiz.sql` |
