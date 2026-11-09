/** 디자인 '모션 · 햅틱' 표의 햅틱. 웹에서는 아무 일도 하지 않는다. */
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

const native = Platform.OS === 'ios' || Platform.OS === 'android';
const safe = (fn: () => Promise<void>) => {
  if (native) fn().catch(() => {});
};

export const haptic = {
  /** 보기 선택, 탭 전환 */
  select: () => safe(() => Haptics.selectionAsync()),
  /** 제출 */
  submit: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** 정답, 신고 접수 */
  success: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  /** 오답, 결과 미확정 */
  warning: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
};
