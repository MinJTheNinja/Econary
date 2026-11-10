/**
 * 익명 학습자에게 Apple/Google 계정을 연결한다 (설계 결정: 익명 시작 + 선택적 로그인).
 * 연결하면 지금까지의 학습 기록이 그대로 그 계정에 남고, 다른 기기에서 같은 계정으로 로그인해 이어서 할 수 있다.
 *
 * - iOS + Apple: 네이티브 'Apple로 로그인' → ID 토큰으로 linkIdentity (App Store 가이드라인 4.8)
 * - Android + Google: 네이티브 Google 계정 선택 창(Credential Manager) → ID 토큰으로 linkIdentity.
 *   Google 화면에 Supabase 주소 대신 앱 이름이 보이고 브라우저를 거치지 않는다. EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID 필요.
 * - 그 외(웹, iOS 의 Google, Android·웹의 Apple): Supabase OAuth 를 브라우저로 열고, 돌아온 code 를 세션으로 교환 (PKCE)
 *
 * 이미 다른 학습 기록에 연결된 계정이면 연결할 수 없다 → 'already_linked' 를 돌려주고,
 * 사용자가 원하면 signInExisting() 으로 그 계정으로 전환한다 (이 기기의 익명 기록은 이어지지 않음).
 */
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { loadGoogleSignIn } from './googleSignIn';
import { supabase } from './supabase';

export type Provider = 'apple' | 'google';
export type LinkOutcome =
  | { status: 'linked' }
  | { status: 'signed_in' }
  | { status: 'cancelled' }
  | { status: 'redirecting' } // 웹: 페이지 전체가 로그인 화면으로 이동
  | { status: 'already_linked' }
  | { status: 'error'; message: string };

export const redirectUrl = () => Linking.createURL('auth-callback');

// email_exists: 같은 이메일을 다른 방식(다른 공급자·이메일 가입)으로 쓰는 계정이 이미 있다 — 학습자에게는 '이미 연결된 계정'과 같은 상황
const ALREADY_LINKED = /identity_already_exists|email_exists|already linked|already been linked|already been registered|already exists/i;

/** Supabase 설정 미비로 나는 오류는 학습자가 이해할 수 있는 말로 바꾼다 (설정 방법: docs/auth-setup.md) */
const SETUP_ERRORS: [RegExp, string][] = [
  [/manual[ _]linking(?: is)?[ _]disabled/i, '계정 연결 기능이 아직 켜져 있지 않아요. 잠시 후 다시 시도해 주세요.'],
  [/provider is not enabled|unsupported provider|validation_failed/i, '이 로그인 방식은 아직 준비 중이에요.'],
];

function failure(message: string): LinkOutcome {
  if (ALREADY_LINKED.test(message)) return { status: 'already_linked' };
  const known = SETUP_ERRORS.find(([re]) => re.test(message));
  if (known) console.warn(`[계정 연결] ${message} — docs/auth-setup.md 참고`);
  return { status: 'error', message: known ? known[1] : message };
}

/** 리디렉트 URL(쿼리 또는 #fragment)에서 code / error 를 꺼낸다 */
export function parseAuthRedirect(url: string): { code?: string; error?: string } {
  const params = new URLSearchParams([url.split('?')[1] ?? '', url.split('#')[1] ?? ''].join('&'));
  const error = params.get('error_code') ?? params.get('error_description') ?? params.get('error') ?? undefined;
  return { code: params.get('code') ?? undefined, error: error ?? undefined };
}

/**
 * code 는 한 번만 교환할 수 있다. Android 에서는 같은 리디렉트가 openAuthSessionAsync 결과와
 * auth-callback 딥링크 화면 양쪽으로 들어오므로, 같은 code 는 첫 교환 결과를 함께 쓴다 (두 번째 교환은 'invalid flow state').
 */
const exchanges = new Map<string, Promise<LinkOutcome>>();

/** auth-callback 에서 받은 code 를 세션으로 바꾼다 (웹 전체 리디렉트·딥링크 공통) */
export async function completeAuthRedirect(url: string): Promise<LinkOutcome> {
  const { code, error } = parseAuthRedirect(url);
  if (error) return failure(error);
  if (!code) return { status: 'error', message: '로그인 응답에 인증 코드가 없습니다.' };
  let pending = exchanges.get(code);
  if (!pending) {
    pending = supabase.auth.exchangeCodeForSession(code).then(({ error: e }) => (e ? failure(e.message) : { status: 'linked' as const }));
    exchanges.set(code, pending);
  }
  return pending;
}

async function nativeApple(mode: 'link' | 'signin'): Promise<LinkOutcome> {
  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.EMAIL],
      nonce: hashedNonce, // Apple 에는 해시를, Supabase 에는 원문을 보낸다
    });
  } catch (e) {
    if ((e as { code?: string }).code === 'ERR_REQUEST_CANCELED') return { status: 'cancelled' };
    return { status: 'error', message: e instanceof Error ? e.message : String(e) };
  }
  if (!credential.identityToken) return { status: 'error', message: 'Apple 에서 인증 토큰을 받지 못했습니다.' };

  const creds = { provider: 'apple' as const, token: credential.identityToken, nonce: rawNonce };
  const { error } = mode === 'link' ? await supabase.auth.linkIdentity(creds) : await supabase.auth.signInWithIdToken(creds);
  if (error) return failure(error.message);
  return { status: mode === 'link' ? 'linked' : 'signed_in' };
}

/** Google Cloud 의 '웹 애플리케이션' OAuth 클라이언트 ID (공개 값). ID 토큰의 aud 가 되고, Supabase Google 설정의 Client ID 와 같아야 한다 */
const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';
const NATIVE_GOOGLE = Platform.OS === 'android' && GOOGLE_WEB_CLIENT_ID !== '';

async function nativeGoogle(mode: 'link' | 'signin'): Promise<LinkOutcome> {
  // 네이티브 모듈이라 웹 번들에서는 불러오지 않는다
  const { GoogleOneTapSignIn, isErrorWithCode, isSuccessResponse, statusCodes } = await loadGoogleSignIn();
  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
  // Google 에는 해시를 (ID 토큰의 nonce 로 들어감), Supabase 에는 원문을 보낸다 — Apple 과 같은 방식
  GoogleOneTapSignIn.configure({ webClientId: GOOGLE_WEB_CLIENT_ID, nonce: hashedNonce });

  let token: string;
  try {
    // 기기의 모든 Google 계정 + '계정 추가'가 보이는 선택 창 (자동 선택하지 않음)
    const response = await GoogleOneTapSignIn.presentExplicitSignIn();
    if (!isSuccessResponse(response)) return { status: 'cancelled' };
    token = response.data.idToken;
  } catch (e) {
    if (isErrorWithCode(e) && e.code === statusCodes.SIGN_IN_CANCELLED) return { status: 'cancelled' };
    if (isErrorWithCode(e) && e.code === statusCodes.DEVELOPER_ERROR) {
      // 패키지명·SHA-1·클라이언트 ID 불일치 (docs/auth-setup.md 의 Android 클라이언트)
      console.warn('[계정 연결] Google DEVELOPER_ERROR — Android OAuth 클라이언트의 SHA-1/패키지명 확인', e);
      return { status: 'error', message: '이 로그인 방식은 아직 준비 중이에요.' };
    }
    return { status: 'error', message: e instanceof Error ? e.message : String(e) };
  }

  const creds = { provider: 'google' as const, token, nonce: rawNonce };
  const { error } = mode === 'link' ? await supabase.auth.linkIdentity(creds) : await supabase.auth.signInWithIdToken(creds);
  if (error) return failure(error.message);
  return { status: mode === 'link' ? 'linked' : 'signed_in' };
}

async function browserOAuth(provider: Provider, mode: 'link' | 'signin'): Promise<LinkOutcome> {
  const redirectTo = redirectUrl();
  const web = Platform.OS === 'web';
  const options = {
    redirectTo,
    skipBrowserRedirect: !web,
    // 브라우저에 로그인된 Google 계정을 자동으로 쓰지 않고 항상 계정 선택 화면을 보여 준다 (여러 계정 중 고를 수 있게)
    ...(provider === 'google' ? { queryParams: { prompt: 'select_account' } } : {}),
  };
  const { data, error } =
    mode === 'link'
      ? await supabase.auth.linkIdentity({ provider, options })
      : await supabase.auth.signInWithOAuth({ provider, options });
  if (error) return failure(error.message);
  if (web) return { status: 'redirecting' }; // supabase-js 가 페이지를 이동시키고 /auth-callback 이 마무리

  const result = await WebBrowser.openAuthSessionAsync(data.url!, redirectTo);
  if (result.type !== 'success') return { status: 'cancelled' };
  const outcome = await completeAuthRedirect(result.url);
  return outcome.status === 'linked' && mode === 'signin' ? { status: 'signed_in' } : outcome;
}

/** 지금 익명 계정에 Apple/Google 을 연결 (학습 기록 유지) */
export async function linkAccount(provider: Provider): Promise<LinkOutcome> {
  if (provider === 'apple' && Platform.OS === 'ios' && (await AppleAuthentication.isAvailableAsync())) {
    return nativeApple('link');
  }
  if (provider === 'google' && NATIVE_GOOGLE) return nativeGoogle('link');
  return browserOAuth(provider, 'link');
}

/** 이미 연결된 다른 계정으로 전환 (이 기기의 익명 기록은 이어지지 않는다) */
export async function signInExisting(provider: Provider): Promise<LinkOutcome> {
  if (provider === 'apple' && Platform.OS === 'ios' && (await AppleAuthentication.isAvailableAsync())) {
    return nativeApple('signin');
  }
  if (provider === 'google' && NATIVE_GOOGLE) return nativeGoogle('signin');
  return browserOAuth(provider, 'signin');
}

/** 기기의 Google 자격 증명 상태를 비워 다음 로그인 때 같은 계정이 자동으로 쓰이지 않게 한다 (실패해도 계속) */
async function clearGoogleCredential(): Promise<void> {
  if (!NATIVE_GOOGLE) return;
  await loadGoogleSignIn()
    .then(({ GoogleOneTapSignIn }) => GoogleOneTapSignIn.signOut())
    .catch(() => {});
}

/** 연결된 계정에서 로그아웃 → 새 익명 학습자로 시작 (AuthProvider 가 자동 처리). 계정의 기록은 서버에 남는다. */
export async function signOut(): Promise<void> {
  await clearGoogleCredential();
  await supabase.auth.signOut();
}

/**
 * 계정 삭제 (delete_my_account RPC): 학습 기록·프로필·연결된 Apple/Google 정보를 서버에서 지운다. 되돌릴 수 없다.
 * 이후 이 기기는 새 익명 학습자로 시작한다 (AuthProvider 가 자동 처리).
 */
export async function deleteAccount(): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error } = await supabase.rpc('delete_my_account');
  if (error) {
    return {
      ok: false,
      message: /staff accounts/.test(error.message) ? '관리자 계정은 앱에서 삭제할 수 없어요.' : '삭제하지 못했어요. 네트워크 연결을 확인한 뒤 다시 시도해 주세요.',
    };
  }
  await clearGoogleCredential();
  // 서버에서 사용자가 이미 지워졌으므로 이 기기의 세션만 비운다
  await supabase.auth.signOut({ scope: 'local' });
  return { ok: true };
}
