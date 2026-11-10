import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AuthProvider, useAuth } from '../lib/auth';
import { useOnboarded } from '../lib/onboarding';
import { isToss } from '../lib/target';
import { closeTossView, subscribeTossBack } from '../lib/toss';
import { fontFamily, useTheme } from '../theme';
import { Launch } from '../ui/Launch';

// 스플래시(마크만)는 첫 화면이 그려질 때까지 유지, 이후 200ms 페이드로 실행 화면에 넘긴다
SplashScreen.preventAutoHideAsync().catch(() => {});
SplashScreen.setOptions({ fade: true, duration: 200 });

function Gate() {
  const { c } = useTheme();
  const { session, loading, error, retry } = useAuth();
  const onboarded = useOnboarded(session?.user.id);

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  // 토스 미니앱: 뒤로 가기는 토스 내비게이션 바 몫. 쌓인 화면이 있으면 뒤로, 첫 화면이면 미니앱 종료 (체크리스트)
  useEffect(() => {
    if (!isToss) return;
    return subscribeTossBack(() => {
      if (router.canGoBack()) router.back();
      else void closeTossView();
    });
  }, []);

  if (error || (!loading && !session)) return <Launch error={error ?? '네트워크 연결을 확인한 뒤 다시 시도해 주세요.'} onRetry={retry} />;
  // 첫 실행 온보딩(시험 회차·공부 시간)은 익명 학습자에게만. 기존 계정으로 로그인하면 바로 앱으로 — 계획이 없으면 오늘 탭에서 세운다.
  // 계정 학습자는 온보딩 여부를 기다리지 않는다: 웹에서 Google 로그인으로 돌아오면 세션이 익명 → 계정으로 바뀌는데,
  // 그때 실행 화면으로 바꾸면 내비게이터가 통째로 내려갔다 올라오면서 빈 화면이 된다
  const anonymous = session?.user.is_anonymous ?? true;
  if (anonymous && onboarded.error) return <Launch error="네트워크 연결을 확인한 뒤 다시 시도해 주세요." onRetry={onboarded.retry} />;
  if (loading || !session || (anonymous && onboarded.value === null)) return <Launch />;
  const inApp = !anonymous || !!onboarded.value;

  // 디자인: 화면 push 는 네이티브 스택 전환 그대로. 헤더는 제목 없이 '‹ 이전 화면' 만, 배경은 화면과 같은 색
  const sheet = {
    presentation: 'formSheet' as const,
    headerShown: false,
    sheetGrabberVisible: true,
    sheetCornerRadius: 20,
    contentStyle: { backgroundColor: c.sheet },
  };
  return (
    <Stack
      screenOptions={{
        // 토스 미니앱은 토스 공통 내비게이션 바를 쓰므로 우리 헤더(뒤로 가기)를 숨긴다 — 겹치면 반려
        headerShown: !isToss,
        headerTitle: '',
        headerShadowVisible: false,
        headerStyle: { backgroundColor: c.bg },
        headerTintColor: c.accent,
        headerBackTitleStyle: { fontFamily, fontSize: 17 },
        contentStyle: { backgroundColor: c.bg },
      }}
    >
      <Stack.Protected guard={inApp} redirectTo="/welcome">
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="study/[wordId]" options={{ headerBackTitle: '오늘' }} />
        <Stack.Screen name="quiz/[wordId]" />
        <Stack.Screen name="study-plan" options={{ ...sheet, sheetAllowedDetents: [0.93] }} />
        <Stack.Screen name="report" options={{ ...sheet, sheetAllowedDetents: [0.93] }} />
        <Stack.Screen name="words" options={{ ...sheet, sheetAllowedDetents: [0.85] }} />
      </Stack.Protected>
      <Stack.Protected guard={!inApp} redirectTo="/">
        <Stack.Screen name="welcome" options={{ headerShown: false }} />
      </Stack.Protected>
      {/* 소개 화면의 '이미 계정이 있어요'에서도 열리므로 항상 열 수 있다 */}
      <Stack.Screen name="account" options={{ headerBackTitle: inApp ? '진도' : '소개' }} />
      <Stack.Screen name="auth-callback" options={{ headerBackTitle: '진도' }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      {isToss ? null : <StatusBar style="auto" />}
      <Gate />
    </AuthProvider>
  );
}
