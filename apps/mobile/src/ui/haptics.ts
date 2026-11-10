/** 디자인 '모션 · 햅틱' 표의 햅틱. 토스 미니앱은 토스 SDK 햅틱, 그 밖의 웹에서는 아무 일도 하지 않는다. */
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import { isToss } from '../lib/target';
import { tossHaptic, type TossHaptic } from '../lib/toss';

const native = Platform.OS === 'ios' || Platform.OS === 'android';
const safe = (fn: () => Promise<void>, toss: TossHaptic) => {
  if (native) fn().catch(() => {});
  else if (isToss) tossHaptic(toss);
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
