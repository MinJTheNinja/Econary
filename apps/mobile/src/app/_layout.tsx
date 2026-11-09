import { Stack } from 'expo-router';
import { ErrorView, Loading } from '../components/ui';
import { AuthProvider, useAuth } from '../lib/auth';

function Gate() {
  const { session, loading, error, retry } = useAuth();
  if (loading) return <Loading />;
  if (error || !session) return <ErrorView message={error ?? '로그인하지 못했습니다.'} onRetry={retry} />;
  return (
    <Stack screenOptions={{ headerBackTitle: '뒤로' }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="study/[wordId]" options={{ title: '단어 학습' }} />
      <Stack.Screen name="quiz/[wordId]" options={{ title: '퀴즈' }} />
      <Stack.Screen name="level" options={{ title: '학습 수준', presentation: 'modal' }} />
      <Stack.Screen name="report" options={{ title: '오류 신고', presentation: 'modal' }} />
      <Stack.Screen name="account" options={{ title: '계정' }} />
      <Stack.Screen name="auth-callback" options={{ title: '계정 연결' }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
