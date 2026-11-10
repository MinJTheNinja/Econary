/**
 * 웹에서는 네이티브 Google 로그인을 쓰지 않는다 (accountLink.ts 의 NATIVE_GOOGLE 이 Android 전용).
 * 여기서 import() 를 하지 않아야 웹 번들에 지연 청크와 그 로더(eval 사용)가 생기지 않는다 — 토스 미니앱은 eval 금지.
 */
type GoogleSignIn = typeof import('react-native-nitro-google-signin');

export const loadGoogleSignIn = (): Promise<GoogleSignIn> =>
  Promise.reject(new Error('네이티브 Google 로그인은 웹에서 쓸 수 없어요.'));
