import { useColorScheme } from 'react-native';
import { dark, light, type Palette } from './tokens';

export * from './tokens';

/** 시스템 라이트/다크를 따른다 (app.json userInterfaceStyle: automatic) */
export function useTheme(): { c: Palette; isDark: boolean } {
  const isDark = useColorScheme() === 'dark';
  return { c: isDark ? dark : light, isDark };
}
