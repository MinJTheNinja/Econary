import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import { Platform, StyleSheet } from 'react-native';
import { fontFamily, useTheme } from '../../theme';
import { haptic } from '../../ui/haptics';
import { Icon, type IconName } from '../../ui/Icon';

const TABS: { name: string; title: string; icon: IconName }[] = [
  { name: 'index', title: '오늘', icon: 'calendar' },
  { name: 'review', title: '복습', icon: 'refresh' },
  { name: 'progress', title: '진도', icon: 'bars' },
];

/**
 * 탭 바 (디자인 '탭 바'): iOS 는 반투명 머티리얼(BlurView), 그 외는 material.bar 단색.
 * 탭 전환은 150ms 크로스페이드 + selection 햅틱.
 */
export default function TabsLayout() {
  const { c, isDark } = useTheme();
  const ios = Platform.OS === 'ios';
  return (
    <Tabs
      screenListeners={{ tabPress: () => haptic.select() }}
      screenOptions={{
        headerShown: false,
        animation: 'fade',
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.tabInactive,
        tabBarLabelStyle: { fontFamily, fontSize: 11, fontWeight: '600' },
        tabBarStyle: {
          position: ios ? 'absolute' : undefined,
          backgroundColor: ios ? 'transparent' : c.bar,
          borderTopColor: c.barLine,
          borderTopWidth: StyleSheet.hairlineWidth,
        },
        tabBarBackground: ios
          ? () => <BlurView tint={isDark ? 'systemChromeMaterialDark' : 'systemChromeMaterialLight'} intensity={100} style={StyleSheet.absoluteFill} />
          : undefined,
      }}
    >
      {TABS.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{ title: t.title, tabBarIcon: ({ color }) => <Icon name={t.icon} color={String(color)} size={24} /> }}
        />
      ))}
    </Tabs>
  );
}
