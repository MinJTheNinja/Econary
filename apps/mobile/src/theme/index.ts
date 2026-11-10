import { useColorScheme } from 'react-native';
import { isToss } from '../lib/target';
import { dark, light, type Palette } from './tokens';

export * from './tokens';

/** 시스템 라이트/다크를 따른다 (app.json userInterfaceStyle: automatic). 토스 미니앱은 라이트만 지원해야 해서 고정 */
export function useTheme(): { c: Palette; isDark: boolean } {
  const isDark = useColorScheme() === 'dark' && !isToss;
  return { c: isDark ? dark : light, isDark };
}
