# Apple / Google 계정 연결 설정

앱은 익명으로 바로 시작하고, 사용자가 원하면 **진도 탭 → 계정** 에서 Apple/Google 계정을 연결한다.
연결하면 익명 시절 학습 기록이 그 계정으로 이어진다 (`supabase.auth.linkIdentity`).
코드는 `apps/mobile/src/lib/accountLink.ts`, 화면은 `apps/mobile/src/app/account.tsx`.

| 플랫폼 | Apple | Google |
|---|---|---|
| iOS | 네이티브 'Apple로 로그인' (ID 토큰) | 브라우저 OAuth |
| Android | 브라우저 OAuth | 브라우저 OAuth |
| 웹 (개발 미리보기) | 페이지 이동 OAuth → `/auth-callback` | 같음 |

아래 설정을 마치기 전에는 계정 화면에서 버튼을 누르면 "provider is not enabled" 류의 오류가 표시된다 (앱은 정상 동작).

## 1. Supabase (Dashboard → Authentication)

1. **Sign In / Providers → Allow manual linking** 켜기 — 익명 계정에 Apple/Google 을 연결하는 데 필요.
2. **URL Configuration → Redirect URLs** 에 추가:
   - `tesatvocab://auth-callback` (설치된 앱)
   - `http://localhost:8081/auth-callback` (웹 미리보기)
   - Expo Go 로 테스트할 때: `exp://**/--/auth-callback`
3. Google / Apple 공급자 설정은 아래 2·3번에서 받은 값을 넣는다.

Supabase 콜백 주소 (Google·Apple 콘솔에 넣을 값): `https://njdrmaosdbsbzileljpl.supabase.co/auth/v1/callback`

## 2. Google

1. Google Cloud Console → APIs & Services → **OAuth 동의 화면** 구성 (앱 이름, 지원 이메일, 범위: email·profile·openid).
2. **사용자 인증 정보 → OAuth 클라이언트 ID → 웹 애플리케이션**
   - 승인된 리디렉션 URI: 위 Supabase 콜백 주소
3. 받은 **클라이언트 ID / 보안 비밀** 을 Supabase → Providers → Google 에 입력하고 켜기.

(브라우저 OAuth 방식이라 Android/iOS 전용 클라이언트 ID 는 필요 없다.)

## 3. Apple (Apple Developer 계정 필요)

1. **Identifiers → App ID** `com.tesat.vocab` 에 *Sign In with Apple* 기능 켜기 (앱의 `ios.bundleIdentifier`).
2. **Identifiers → Services ID** 하나 만들기 (예: `com.tesat.vocab.web`) → Sign In with Apple 설정
   - Domains: `njdrmaosdbsbzileljpl.supabase.co`
   - Return URL: 위 Supabase 콜백 주소
   (Android·웹의 브라우저 로그인에 쓰인다.)
3. **Keys** → Sign In with Apple 키 생성 → `.p8` 파일, Key ID, Team ID 확보.
4. Supabase → Providers → Apple:
   - Client IDs: `com.tesat.vocab,com.tesat.vocab.web` (네이티브 iOS + Services ID). Expo Go 에서 시험하려면 `host.exp.Exponent` 도 추가.
   - Secret Key: `.p8` 로 만든 client secret (Supabase 화면의 안내/생성기 사용). **6개월마다 만료되므로 재발급 필요.**

## 4. 빌드

- iOS 네이티브 Apple 로그인은 `app.json` 의 `ios.usesAppleSignIn: true` 와 `expo-apple-authentication` 플러그인으로 켜져 있다.
  개발 빌드 또는 EAS 빌드에서 동작한다 (`npx eas-cli@latest build --profile development`).
- App Store 가이드라인 4.8: Google 로그인을 제공하면 Apple 로그인도 동등하게 제공해야 하므로 iOS 에서는 Apple 버튼을 먼저 보여준다.

## 동작 규칙

- **익명 → 연결**: 같은 학습자 id 를 유지하므로 학습 기록이 그대로 남는다.
- **이미 다른 기록에 연결된 계정**: 연결할 수 없다고 안내하고, 원하면 그 계정으로 로그인 전환. 이때 이 기기의 익명 기록은 옮겨지지 않는다 (병합은 하지 않음 — 필요해지면 서버 함수로 별도 구현).
- **로그아웃**: 계정 기록은 서버에 남고, 이 기기는 새 익명 학습자로 시작한다.
