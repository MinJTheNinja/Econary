# Econary — TESAT 시사 경제 어휘 학습 앱

Econary 는 economics dictionary 의 줄임말이다.

iOS·Android TESAT 경제·시사 어휘 학습 앱. 기획: `docs/PRD_기능명세서_2026-11-09.xlsx`, `docs/flowchart.webp`.
미결정 운영 정책: `docs/open-decisions.md`.

| 경로 | 내용 |
|---|---|
| `apps/mobile` | Expo Router 앱 (SDK 58). 현재 placeholder 탭: 오늘 / 복습 / 진도 |
| `packages/core` | 공용 도메인 로직: 간격 반복(SRS), 진도·연속 학습 계산, KST 날짜 |
| `supabase/migrations` | Postgres 스키마, RLS, RPC (`get_or_create_today_assignment`, `submit_quiz_attempt`) |
| `supabase/tests` | PGlite 기반 마이그레이션·RLS 점검 |
| `pipeline` | 단어 적재 스크립트 (Phase 2에서 슈카월드 파이프라인 포팅 예정: YTN + 한경) |

## 명령

```bash
npm install
npm test            # packages/core 단위 테스트
npm run test:db     # 마이그레이션 + RLS/RPC 점검 (Docker 불필요)
npm run mobile      # Expo 개발 서버 (w 키로 웹 미리보기)
```

단어 목록 적재 (Windows에서는 `python` 대신 `py` 권장 — WindowsApps 별칭이 실행을 막는 경우가 있음):

```bash
py pipeline/scripts/import_words.py 단어목록.xlsx --dry-run
```

## 콘텐츠 파이프라인 (`pipeline/`)

슈카월드 프로젝트의 용어 추출·채점(`tesat_rubric.py`, `keyword_extractor.py`)과 한경 수집 모듈을 그대로 가져와
출처를 YTN + 한경으로 바꿨다. 흐름: 새 기사 → 본문 → 용어 추출·채점(Groq) → 고정 단어 연결(`word_linker.py`)
→ 자체 문장 설명·4지선다 퀴즈 생성 + 원문 복사 검사(`content_generator.py`) → Supabase `word_contents` (검수 대기).
목록에 없는 용어는 `term_candidates` 에, 단계별 처리 결과는 `pipeline_runs` 에 쌓인다.

```bash
py pipeline/main.py
```

```bash
py -m unittest discover -s pipeline/tests
```

매일 자동 실행: `powershell -ExecutionPolicy Bypass -File .\pipeline\register_task.ps1` (09:00).

## 관리자 웹 (`apps/admin`, Next.js 16)

단어 관리(뜻·중요도·활성), 검수 대기(승인·제외·문구 수정), 단어 후보, 오류 신고, 파이프라인 처리 기록.
로그인은 Supabase 이메일/비밀번호이며 `profiles.role` 이 관리자인 계정만 들어갈 수 있다.
데이터는 서버에서 service_role 로만 읽고 쓴다 (브라우저로 키가 가지 않음).

1. `apps/admin/.env.local` 에 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` 입력
2. Supabase Dashboard → Authentication → Users → Add user 로 계정 생성 후:

```bash
py pipeline/scripts/make_admin.py 이메일주소
```

```bash
npm run dev -w @tesat/admin
```

http://localhost:3001

## 진행 단계
1. ✅ 기반: 스키마·RLS, core 로직, 앱 스켈레톤, 단어 import
2. ✅ 콘텐츠 파이프라인 (YTN + 한경 → 단어 연결 → 설명·퀴즈 후보 생성)
3. ✅ 관리자 웹 (단어 관리, 검수, 후보, 신고, 처리 기록)
4. ✅ 앱 학습 핵심 (익명 시작, 수준, 오늘의 학습, 퀴즈·재시도, 복습일 계산)
5. ✅ 간격 반복 복습 (오늘 복습 목록, 완료/미완료, 빈 상태)
6. ✅ 진도·연속학습·오류 신고 (앱 진도 탭, 뜻·설명·퀴즈 신고, 관리자 처리)
7. 운영 지표 → PostHog 에서 보기로 결정, 우선순위 뒤로 (마지막에 진행)
8. ✅ Claude Design UI 적용 (토큰 `apps/mobile/src/theme`, 컴포넌트 `apps/mobile/src/ui`, 아이콘·스플래시, Pretendard) + Apple/Google 계정 연결 (설정은 docs/auth-setup.md)
9. 스토어 출시
