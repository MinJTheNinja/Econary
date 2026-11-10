# 토스 미니앱(앱인토스) 출시 준비

같은 Econary 앱을 토스 앱 안의 미니앱으로도 낸다. 방식은 **WebView**(Expo 웹 export 재사용). 기준: 2026-11-10, `@apps-in-toss/web-framework` 3.10.0.
공식 문서: https://developers-apps-in-toss.toss.im (비게임 체크리스트 `/checklist/app-nongame.html`, 운영 정책 `/intro/guide.md`, SDK 3.x `/documentation/integration/sdk-3.x.md`)

## 0. 요약

- 토스 빌드는 **익명 학습만** 지원한다. 토스 로그인은 사업자등록이 필요하고, 미니앱에서는 토스 로그인 외의 로그인(Google/Apple)이 금지라서다.
- 네이티브·Play 빌드는 그대로다. 모든 차이는 `EXPO_PUBLIC_TARGET=toss` 일 때만 켜진다 (`apps/mobile/src/lib/target.ts`).
- 광고·결제 없음 (수익이 생기면 "국가 자격증 없는 수익형 교육 서비스 불가" 규정에 걸릴 수 있음).

## 1. 빌드와 업로드

```bash
cd apps/mobile
npm run build:toss          # dist-toss/ + econary.ait (apps/mobile 에 생김, 둘 다 git 제외)
```

`scripts/build-toss.mjs` 가 하는 일:

1. `EXPO_PUBLIC_TARGET=toss npx expo export --platform web --output-dir dist-toss --clear`
2. JS 번들이 **1개**인지 확인 (화면 청크 분할 없음)
3. 번들에 `eval(` · `new Function(` 이 없는지 확인 → 있으면 실패
4. `index.html` 보정: `lang="ko"`, 핀치 줌 끔(`maximum-scale=1, user-scalable=no`), `color-scheme: light`, 배경색
5. `npx ait build` → `econary.ait` (지금 약 0.65MB, 압축 전 2.5MB. 한도 100MB)

`eval` 을 없애는 방법 (토스 빌드에만 적용):

| 출처 | 처리 |
|---|---|
| expo-router 화면 청크 로더 (`expo/build/async-require/fetchThenEvalJs`) | `app.config.js` 가 토스 빌드에서 `asyncRoutes: false` 로 한 번들 생성 + `metro.config.js` 가 로더를 `toss/stubs/fetchThenEvalJs.js` 로 교체 |
| `expo-modules-core` uuid 의 Node 전용 분기 (`eval('require')('node:crypto')`, 브라우저에서는 실행 안 됨) | `metro.config.js` 가 `toss/stubs/uuid.web.js` 로 교체 (`crypto.randomUUID()` 만 사용) |
| `react-native-nitro-google-signin` 동적 `import()` (웹 청크 생성 원인) | `src/lib/googleSignIn.web.ts` 가 웹에서는 모듈을 참조하지 않음 |

업로드: 콘솔 **앱 번들** 에 `econary.ait` 를 올리거나, 콘솔 워크스페이스 → 키 에서 API 키를 받아 `npx ait token add` 후 `npx ait deploy -m "메모"`.

설정 파일: `apps/mobile/apps-in-toss.config.ts` — `appName: 'econary'`(**콘솔에 등록한 이름과 같아야 하고 등록 후 변경 불가**. 다른 이름으로 등록하면 여기를 바꾼다), 내비게이션 바(뒤로·홈 버튼, 라이트 테마), WebView(당겨서 새로고침 끔, 바운스 끔).

## 2. 토스 빌드에서 달라지는 점

| 화면/기능 | 네이티브·Play | 토스 미니앱 |
|---|---|---|
| 테마 | 시스템 라이트/다크 | 라이트 고정 (`src/theme/index.ts`) |
| 화면 위 헤더(‹ 뒤로) | 있음 | 숨김 — 토스 공통 내비게이션 바가 뒤로 가기 담당 (`src/app/_layout.tsx`) |
| 뒤로 가기 | 스택 | 토스 `backEvent` 구독: 쌓인 화면이 있으면 뒤로, 첫 화면이면 `Screen.close()` 로 미니앱 종료 |
| 단어 화면 '01 / 10' | 헤더 오른쪽 | 분야 칩 옆 |
| 첫 실행 '이미 계정이 있어요' | 있음 | 없음 |
| 진도 탭 계정 카드 | Apple/Google 연결 권유 | '익명 학습 · 계정 관리' 한 줄 |
| 계정 화면 | 연결·로그인·로그아웃·삭제 | 익명 안내 + 계정 삭제(화면 안 2단계 확인) + 개인정보처리방침 |
| 개인정보처리방침 열기 | 인앱 브라우저 | 토스 `Device.openURL` |
| 진동 | expo-haptics | 토스 `Device.triggerHaptic` (선택 tickWeak, 제출 tap, 정답 success, 오답 error) |
| 생성형 AI 고지 | 없음 | 뉴스 설명·시사 퀴즈에 'AI 초안을 운영자가 검토' |

토스 SDK 호출은 `src/lib/toss.web.ts` 에 모았다. 토스 앱 밖(일반 브라우저)에서는 아무 일도 하지 않는다. 네이티브 번들에는 SDK 가 들어가지 않는다 (`src/lib/toss.ts` 는 빈 함수).

## 3. Supabase

추가 설정 없음. 2026-11-10 에 아래 네 출처에서 `/auth/v1/signup`(익명 로그인), `/rest/v1/*`, RPC 로 CORS 프리플라이트를 보내 모두 `Access-Control-Allow-Origin: *` 를 받았다.

- `https://econary.apps.tossmini.com` (SDK 3.1+ 실서비스)
- `https://econary.private-apps.tossmini.com` (SDK 3.1+ QR 테스트)
- `https://econary.web.tossmini.com`, `https://econary.private-web.tossmini.com` (문서 일부에 나오는 3.0.x 출처)

OAuth 를 쓰지 않으므로 Redirect URL 추가도 필요 없다. 세션 토큰은 미니앱 출처의 localStorage 에 저장되고 요청 헤더로 보내므로 iOS 서드파티 쿠키 차단과 무관하다.
주의: 익명 로그인은 Supabase 기본값으로 **IP당 시간당 30회** 제한이 있다 (Authentication → Rate Limits). 토스 앱 사용자는 각자 IP 라 보통 문제없지만, 검수 기간에 같은 사무실 IP 에서 여러 번 새로 설치하면 걸릴 수 있다.

## 4. 데이터 보존 한계 (제안만, 구현 안 함)

- 기록은 Supabase 익명 계정에 있고, 그 계정의 로그인 정보는 미니앱 저장소(localStorage)에 있다.
- 재시작: 유지된다 (확인함: 새로 고침 후 같은 학습자).
- **미니앱 삭제, 토스 앱 데이터 삭제, 기기 변경**: 로그인 정보가 사라져 기록을 다시 불러올 수 없다. 서버에는 주인 없는 익명 계정이 남는다.
- QR 테스트(private 출처)와 실서비스 출처는 저장소가 따로라 기록이 공유되지 않는다.

선택지:

| 안 | 내용 | 보안 | 판단 |
|---|---|---|---|
| A. 현 상태 + 고지 | 계정 화면·개인정보처리방침에 "미니앱 삭제 시 기록 사라짐" 고지 (적용됨) | 문제 없음 | **권장 (지금)** |
| B. `User.getAnonymousKey()` 해시로 기록 복구 | 해시를 서버에 보내 같은 해시의 익명 계정 세션을 돌려줌 | 해시는 클라이언트가 보내는 값이라 본인 증명이 안 된다(문서 경고: 검증 API 는 이 미니앱이 발급한 키인지만 확인). 해시를 알거나 흉내 내면 남의 기록을 가져갈 수 있음 | **비권장** |
| C. `User.createAnonymousKeyAuthCode()` → Edge Function 이 토스 서버 API 로 코드 교환·검증 → 해당 Supabase 사용자 세션 발급 | 서버 간 검증이라 안전 | 토스 파트너 API 자격(인증서·키)이 필요. 개인 운영자에게 발급되는지 콘솔에서 확인 필요. 구현량: Edge Function + 매핑 테이블 + 세션 발급 | 이용자가 늘면 검토 |

체크리스트의 '익명 키(사용자 식별키)' 항목(식별키 저장, 이용 이력·재시작 후 데이터 유지)은 식별키를 쓰는 앱이 대상이다. 지금은 식별키를 쓰지 않으며, 재시작 후 데이터 유지는 충족한다.

## 5. 콘솔 입력값

| 항목 | 값 |
|---|---|
| appName (영문 ID, 변경 불가) | `econary` (다르게 정하면 `apps-in-toss.config.ts` 도 변경) |
| 앱 이름(한국어) | `Econary: TESAT 경제 어휘` (짧게 필요하면 `Econary`) |
| 영문 이름 (15자 이하) | `Econary` |
| 부제 | `시험일에 맞춘 TESAT 경제 어휘 학습` (느낌표 금지) |
| 카테고리 | 교육 |
| 이용 연령 | 만 19세 이상 (앱인토스 공통) |
| 문의 이메일 | `econary.admin@gmail.com` |
| 제작자명 (10자 이하) | `Econary` |
| 개인정보처리방침 | `https://minjtheninja.github.io/Econary/privacy.html` (9번 항목에 토스 미니앱 내용 있음) |
| 앱 아이콘 600×600 PNG (배경 있음, 투명·라운드 금지) | `docs/store/toss-icon-600.png` |
| 스크린샷 (선택, 세로 636×1048 3장 이상) | 아직 없음 — QR 테스트 때 토스 앱에서 찍는 것을 권장 |

### 설명

Play 의 자세한 설명(`play-console.md`)에서 '가입 없이 바로 시작' 단락만 바꿔 쓴다:

```
TESAT(경제이해력검증시험)을 준비한다면, 시험까지 남은 날에 맞춰 경제·시사 어휘를 계획대로 공부하세요.

■ 시험일에 맞춘 학습 계획
응시할 TESAT 회차와 하루 공부 시간을 고르면, 시험 전까지 배울 수 있는 단어 수를 계산해 매일 새 단어를 정해 드려요. 시험 전 마지막 7일은 복습에 집중하도록 계획이 바뀝니다. 계획은 언제든 바꿀 수 있어요.

■ 오늘의 단어
중요한 경제 용어부터 하루 분량씩 공부해요. 뜻을 읽고, 퀴즈 한 문제로 바로 확인합니다.

■ 잊을 때쯤 다시 나오는 복습
퀴즈를 푼 단어는 기억이 흐려질 때쯤 복습 목록에 다시 나타나요. 틀린 단어는 더 자주 만납니다.

■ 진도와 연속 학습
지금까지 배운 단어 수, 퀴즈 정답률, 최근 5주의 학습 기록을 한눈에 볼 수 있어요.

■ 로그인 없이 바로 시작
따로 로그인하지 않고 바로 공부할 수 있어요. 학습 기록은 이 기기의 미니앱과 연결되어 저장되며, 미니앱을 삭제하면 기록도 사라져요.

■ 함께 고쳐 가는 콘텐츠
뉴스 설명과 시사 퀴즈는 AI 가 초안을 쓰고 운영자가 검토해요. 잘못된 부분을 발견하면 앱에서 바로 신고해 주세요.

Econary 는 economics dictionary 의 줄임말입니다. 한국경제신문의 TESAT 와 제휴하거나 공식 인증을 받은 앱이 아닙니다.
```

## 6. 비게임 체크리스트 대응표

| 항목 | 대응 |
|---|---|
| 토스 공통 내비게이션 바 사용, 우리 뒤로 가기와 중복 없음 | 토스 빌드는 Stack 헤더 숨김. 시트(학습 계획·신고·단어 목록)의 '닫기/완료'는 뒤로 가기가 아니라 시트 닫기 |
| 모든 화면에서 뒤로 가기 동작, 첫 화면 뒤로 = 종료 | `backEvent` → `router.canGoBack()` ? 뒤로 : `Screen.close()` — **QR 테스트로 확인 필요** |
| 로고·이름은 등록한 브랜드 | 앱 안 표기 'Econary' |
| 라이트 모드만 | `useTheme` 라이트 고정, `color-scheme: light`, 내비게이션 바 `theme: 'light'` (브라우저에서 시스템 다크로 확인함) |
| 진입 시 바텀시트 자동 표시 금지 | 첫 화면은 소개 페이지. 자동으로 뜨는 시트 없음 |
| 상호작용 2초 이상 지연 금지 | 단일 2.5MB 번들, API 응답은 보통 1초 이내 — QR 테스트에서 체감 확인 |
| 핀치 줌 끔 | viewport `user-scalable=no` |
| SSR 금지 (CSR/SSG 만) | 정적 SPA (Expo web `single` 출력) |
| `eval`·외부 코드 실행 금지 | 빌드 스크립트가 검사 (위 1번) |
| iframe·자사 사이트 삽입·히스토리 조작으로 외부 이동 금지 | 없음. 외부 링크는 개인정보처리방침 하나, `openURL` 로 기기 브라우저에서 열기 |
| HTTPS 만, WebSocket 은 wss | Supabase HTTPS. Realtime 미사용 |
| 브리지 반복 호출·무한 재시도 금지 | 햅틱은 사용자 동작 때만, 실패 시 재시도 안 함. 네트워크 실패는 '다시 시도' 버튼 |
| 권한 요청 | 없음 (`permissions: []`) |
| 토스 로그인 외 로그인 금지 | 토스 빌드에서 Google/Apple 연결·로그인 화면과 진입점 모두 제거 |
| 광고·결제 | 없음 |
| 생성형 AI 결과물 고지 | 뉴스 설명·시사 퀴즈에 'AI 초안을 운영자가 검토' |
| 만 19세 이상 | 콘솔 설정 |
| 데이터가 재시작 후 유지 | localStorage 세션 유지 (새로 고침으로 확인함) |

## 7. QR 테스트 순서 (콘솔 업로드 후, 토스 앱 실기기)

콘솔 → 앱 번들 업로드 → **토스앱 테스트** → QR 스캔 (토스 로그인, 워크스페이스 멤버, 만 19세 이상). 내비게이션 바 ⋯ → 웹 디버그 툴즈로 로그·네트워크를 볼 수 있다.

1. 첫 화면(소개)이 바로 뜨고 바텀시트가 없다. 다크 모드 기기에서도 밝은 화면
2. 시작하기 → 시험 회차 → 공부 시간 → 계획 → 학습 시작하기 → 오늘 탭
3. 단어 → 퀴즈 → 다음 단어, 탭 전환 시 진동
4. 토스 내비게이션 바 뒤로: 퀴즈 → 단어 → 오늘 탭 → (오늘 탭에서) 미니앱 종료. Android 시스템 뒤로도 같은지
5. iOS 가장자리 스와이프 뒤로 (`allowsBackForwardNavigationGestures` 기본값 켜짐) 가 이상하게 동작하지 않는지
6. 위쪽 여백(내비게이션 바와 겹침 없음), 아래 탭 바가 홈 인디케이터에 가리지 않는지
7. 진도 → 익명 학습 · 계정 관리 → 개인정보처리방침이 브라우저로 열리는지
8. 미니앱을 닫았다 다시 열어 기록이 그대로인지
9. (마지막에) 계정 삭제 → 확인 → 새 익명 학습자로 소개 화면

알려진 한계: 정적 SPA 라 `/quiz/123` 같은 하위 주소에서 페이지를 새로 고치면 404 가 날 수 있다 (토스 호스팅의 처리 방식 미확인). 당겨서 새로고침은 꺼 두었고 미니앱은 항상 첫 주소로 열리므로 보통은 생기지 않는다. QR 테스트에서 앱을 백그라운드에 오래 두었다가 돌아왔을 때 확인한다.
