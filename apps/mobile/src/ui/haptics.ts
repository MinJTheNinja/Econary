/**
 * 디자인 '모션 · 햅틱' 표의 햅틱. 토스 미니앱은 토스 SDK 햅틱, 그 밖의 웹에서는 아무 일도 하지 않는다.
 * 계정 화면의 '진동' 설정이 꺼져 있거나, Android 기기가 무음 모드면 울리지 않는다
 * (진동 모드에서는 울린다. iOS 는 무음 스위치를 읽을 수 없어 설정으로만 끈다).
 */
import * as Haptics from 'expo-haptics';
import { AppState, Platform } from 'react-native';
import { getRingerMode, type RingerMode } from '../../modules/ringer-mode';
import { getPref, setPref } from '../lib/prefs';
import { isToss } from '../lib/target';
import { tossHaptic, type TossHaptic } from '../lib/toss';

const native = Platform.OS === 'ios' || Platform.OS === 'android';
const PREF_KEY = 'haptics';

// 설정은 시작할 때 한 번 읽어 두고, 바꾸면 바로 반영한다 (읽기 전에는 기본값 켜짐)
let enabled = true;
let prefTouched = false;
const prefLoaded = getPref<boolean>(PREF_KEY, true).then((v) => {
  if (!prefTouched) enabled = v;
  return enabled;
});

// 벨소리 모드는 시작할 때와 앱으로 돌아올 때마다 다시 읽는다 (앱 밖에서 무음으로 바꾸고 돌아오는 경우)
let ringer: RingerMode = getRingerMode();
AppState.addEventListener('change', (state) => {
  if (state === 'active') ringer = getRingerMode();
});

/** '진동' 설정 값 (저장된 값을 다 읽은 뒤) */
export function loadHapticsEnabled(): Promise<boolean> {
  return prefLoaded;
}

export function setHapticsEnabled(value: boolean): void {
  prefTouched = true;
  enabled = value;
  void setPref(PREF_KEY, value);
}

const safe = (fn: () => Promise<void>, toss: TossHaptic) => {
  if (!enabled) return;
  if (native) {
    if (ringer === 'silent') return;
    fn().catch(() => {});
  } else if (isToss) tossHaptic(toss);
};

export const haptic = {
  /** 보기 선택, 탭 전환 */
  select: () => safe(() => Haptics.selectionAsync(), 'tickWeak'),
  /** 제출 */
  submit: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light), 'tap'),
  /** 정답, 신고 접수 */
  success: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success), 'success'),
  /** 오답, 결과 미확정 */
  warning: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning), 'error'),
};
