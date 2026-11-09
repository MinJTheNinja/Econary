import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';

export const isConfigured = Boolean(url && key);

/** 학습자 클라이언트: publishable 키 + 로그인 세션. RLS 가 본인 데이터만 허용한다. */
export const supabase = createClient(url || 'http://localhost', key || 'missing', {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'pkce', // Apple/Google 계정 연결: 리디렉트로 받은 code 를 앱에서 세션으로 교환 (accountLink.ts)
  },
});

// 앱이 포그라운드일 때만 토큰 자동 갱신 (Supabase RN 권장 패턴)
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
