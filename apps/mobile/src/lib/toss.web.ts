/**
 * 토스 미니앱 SDK(@apps-in-toss/web-framework) 래퍼. 토스 앱 WebView 밖(일반 브라우저)에서는
 * SDK 호출이 예외를 던지므로 전부 조용히 무시한다. import 만으로는 부수효과가 없다.
 */
import { Device, graniteEvent, Screen } from '@apps-in-toss/web-framework';
import type { TossHaptic } from './toss';

export type { TossHaptic };

declare global {
  interface Window {
    ReactNativeWebView?: unknown;
  }
}

/** 토스 앱 WebView 안인지 (SDK 가 브리지 호출 전에 확인하는 것과 같은 조건) */
export const inTossApp = () => typeof window !== 'undefined' && window.ReactNativeWebView != null;

export const tossHaptic = (type: TossHaptic) => {
  if (!inTossApp()) return;
  Device.triggerHaptic({ type }).catch(() => {});
};

/** 외부 링크(개인정보처리방침 등)를 기기 브라우저로 연다. 토스 밖이면 false — 호출한 쪽이 새 탭으로 연다. */
export const tossOpenURL = async (url: string) => {
  if (!inTossApp()) return false;
  try {
    await Device.openURL(url);
    return true;
  } catch {
    return false;
  }
};

export const closeTossView = async () => {
  if (!inTossApp()) return;
  await Screen.close().catch(() => {});
};

/** 토스 내비게이션 바·시스템 뒤로 가기. 구독하는 동안 기본 동작은 막힌다. 해제 함수를 돌려준다. */
export const subscribeTossBack = (onBack: () => void) => {
  if (!inTossApp()) return () => {};
  try {
    return graniteEvent.addEventListener('backEvent', { onEvent: onBack, onError: () => {} });
  } catch {
    return () => {};
  }
};
