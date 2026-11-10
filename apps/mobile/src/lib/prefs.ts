/** 기기에만 남기는 작은 설정·기록 (플래시카드 옵션, 짝 맞추기 최고 기록). 실패해도 앱은 기본값으로 동작한다. */
import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = 'econary:';

export async function getPref<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export async function setPref<T>(key: string, value: T): Promise<void> {
  try {
    await AsyncStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // 저장 실패는 무시 (다음 실행에서 기본값)
  }
}
