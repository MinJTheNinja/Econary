import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { useReducedMotion } from 'react-native-reanimated';
import { AuthProvider, useAuth } from '../lib/auth';
import { useOnboarded } from '../lib/onboarding';
import { prefetchToday } from '../lib/today';
import { isToss } from '../lib/target';
import { closeTossView, subscribeTossBack } from '../lib/toss';
import { fontFamily, useTheme } from '../theme';
import { Launch } from '../ui/Launch';

// 스플래시(마크만)는 첫 화면이 그려질 때까지 유지, 이후 200ms 페이드로 실행 화면에 넘긴다
SplashScreen.preventAutoHideAsync().catch(() => {});
SplashScreen.setOptions({ fade: true, duration: 200 });

const bootAt = Date.now();
/** 실행 화면 애니메이션(0.25s 대기 + 0.8s)이 끝날 때까지는 보여 준다 */
const MIN_LAUNCH_MS = 1150;
/** 오늘의 단어가 늦어도 이 시간이 지나면 넘어간다 (오늘 탭이 이어서 불러온다) */
const MAX_WAIT_MS = 8000;
let launchReleased = false;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * 앱을 처음 열 때만: 실행 화면을 애니메이션이 끝나고 오늘의 단어를 다 불러올 때까지 유지.
 * 'ready' 동안 '준비했어요'를 잠깐 보여 주고 'done' 이 되면 앱 본문으로. 한 번 넘어가면 다시 붙잡지 않는다
 * (웹에서 Google 로그인으로 돌아와 세션이 바뀔 때 실행 화면으로 되돌아가면 안 된다).
 */
function useLaunchHold(target: 'app' | 'welcome' | null): 'hold' | 'ready' | 'done' {
  const reduce = useReducedMotion();
  const [state, setState] = useState<'hold' | 'ready' | 'done'>(launchReleased ? 'done' : 'hold');
  useEffect(() => {
    if (!target || launchReleased) return;
    let cancelled = false;
    const minWait = sleep(reduce ? 0 : Math.max(0, MIN_LAUNCH_MS - (Date.now() - bootAt)));
    const work = target === 'app' ? Promise.race([prefetchToday().then(() => {}, () => {}), sleep(MAX_WAIT_MS)]) : Promise.resolve();
    void Promise.all([minWait, work]).then(async () => {
      if (cancelled) return;
      if (target === 'app') {
        setState('ready');
        await sleep(450);
        if (cancelled) return;
      }
      launchReleased = true;
      setState('done');
    });
    return () => { cancelled = true; };
  }, [target, reduce]);
  return state;
}

function Gate() {
  const { c } = useTheme();
  const { session, loading, error, retry } = useAuth();
  const onboarded = useOnboarded(session?.user.id);
  const anonymous = session?.user.is_anonymous ?? true;
  // 어디로 갈지 (아직 모르면 null): 계정 학습자 또는 온보딩을 마친 익명 학습자 → 앱, 아니면 소개
  const target = loading || !session || (anonymous && onboarded.value === null) ? null : !anonymous || onboarded.value ? 'app' : 'welcome';
  const launch = useLaunchHold(target);

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
  if (anonymous && onboarded.error) return <Launch error="네트워크 연결을 확인한 뒤 다시 시도해 주세요." onRetry={onboarded.retry} />;
  if (launch !== 'done' || !target) return <Launch ready={launch === 'ready'} />;
  const inApp = target === 'app';

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
        <Stack.Screen name="cards" options={{ presentation: 'fullScreenModal', headerShown: false }} />
        <Stack.Screen name="session" options={{ presentation: 'fullScreenModal', headerShown: false, gestureEnabled: false }} />
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
