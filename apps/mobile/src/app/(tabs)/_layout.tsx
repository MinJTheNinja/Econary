import { Tabs } from 'expo-router';

// 탭 구성만 정한다. 시각 디자인은 Claude Design 결과물로 교체 (Phase 8).
export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerTitleAlign: 'center' }}>
      <Tabs.Screen name="index" options={{ title: '오늘' }} />
      <Tabs.Screen name="review" options={{ title: '복습' }} />
      <Tabs.Screen name="progress" options={{ title: '진도' }} />
    </Tabs>
  );
}
