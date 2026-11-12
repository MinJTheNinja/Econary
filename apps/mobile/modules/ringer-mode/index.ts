/**
 * 기기 벨소리 모드. Android 만 네이티브로 읽는다 (AudioManager.ringerMode).
 * iOS 는 무음 스위치를 읽을 공개 API 가 없고 웹에는 개념이 없어 'unknown'.
 * 네이티브 모듈이 없는 빌드(새 빌드 전 dev client 등)에서도 'unknown' 으로 조용히 동작한다.
 */
import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

export type RingerMode = 'silent' | 'vibrate' | 'normal' | 'unknown';

type RingerModeNative = { getRingerMode(): RingerMode };

const native = Platform.OS === 'android' ? requireOptionalNativeModule<RingerModeNative>('RingerMode') : null;

export function getRingerMode(): RingerMode {
  try {
    return native?.getRingerMode() ?? 'unknown';
  } catch {
    return 'unknown';
  }
}
