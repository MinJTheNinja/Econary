import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AuthProvider, useAuth } from '../lib/auth';
import { fontFamily, useTheme } from '../theme';
import { Launch } from '../ui/Launch';

// 스플래시(마크만)는 첫 화면이 그려질 때까지 유지, 이후 200ms 페이드로 실행 화면에 넘긴다
SplashScreen.preventAutoHideAsync().catch(() => {});
SplashScreen.setOptions({ fade: true, duration: 200 });

function Gate() {
  const { c } = useTheme();
  const { session, loading, error, retry } = useAuth();

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  if (loading) return <Launch />;
  if (error || !session) return <Launch error={error ?? '네트워크 연결을 확인한 뒤 다시 시도해 주세요.'} onRetry={retry} />;

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
        headerTitle: '',
        headerShadowVisible: false,
        headerStyle: { backgroundColor: c.bg },
        headerTintColor: c.accent,
        headerBackTitleStyle: { fontFamily, fontSize: 17 },
        contentStyle: { backgroundColor: c.bg },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="study/[wordId]" options={{ headerBackTitle: '오늘' }} />
      <Stack.Screen name="quiz/[wordId]" />
      <Stack.Screen name="account" options={{ headerBackTitle: '진도' }} />
      <Stack.Screen name="auth-callback" options={{ headerBackTitle: '진도' }} />
      <Stack.Screen name="level" options={{ ...sheet, sheetAllowedDetents: 'fitToContents' }} />
      <Stack.Screen name="report" options={{ ...sheet, sheetAllowedDetents: [0.93] }} />
      <Stack.Screen name="words" options={{ ...sheet, sheetAllowedDetents: [0.85] }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="auto" />
      <Gate />
    </AuthProvider>
  );
}
