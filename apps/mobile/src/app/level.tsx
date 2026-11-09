import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text } from 'react-native';
import { Body, Card, ErrorView, Loading, Screen, colors } from '../components/ui';
import { getLevels, getMyLevel, setMyLevel } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useLoad } from '../lib/useLoad';

/** 학습 수준 설정 (PRD 3.1). 바꾸면 다음 학습일부터 신규 단어 수에 적용된다. */
export default function LevelScreen() {
  const { session } = useAuth();
  const { data, error, reload, setData } = useLoad(async () => {
    const [levels, current] = await Promise.all([getLevels(), getMyLevel()]);
    return { levels, current };
  }, []);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const choose = async (level: string) => {
    if (!session || saving || !data) return;
    setSaving(true);
    setSaveError(null);
    try {
      await setMyLevel(level, session.user.id);
      setData({ ...data, current: level });
      router.back();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  if (error) return <ErrorView message={error} onRetry={reload} />;
  if (!data) return <Loading />;

  return (
    <Screen>
      <Body muted>하루에 새로 배울 단어 수를 정합니다. 오늘 이미 배정된 단어는 그대로이고, 내일부터 적용돼요.</Body>
      {saveError && <Body style={{ color: colors.bad }}>저장하지 못했습니다: {saveError}</Body>}
      {data.levels.map((l) => {
        const selected = l.level === data.current;
        return (
          <Pressable key={l.level} onPress={() => choose(l.level)} accessibilityRole="radio" accessibilityState={{ selected }} accessibilityLabel={`${l.label}, 하루 새 단어 ${l.daily_new_count}개`}>
            <Card style={selected ? { borderColor: colors.accent, borderWidth: 2 } : undefined}>
              <Text style={{ fontSize: 18, fontWeight: '600', color: colors.text }}>{l.label}{selected ? '  ✓' : ''}</Text>
              <Body muted>하루 새 단어 {l.daily_new_count}개</Body>
            </Card>
          </Pressable>
        );
      })}
    </Screen>
  );
}
