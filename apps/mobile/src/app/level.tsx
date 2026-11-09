import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getLevels, getMyLevel, setMyLevel } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useLoad } from '../lib/useLoad';
import { useTheme } from '../theme';
import { haptic } from '../ui/haptics';
import { Icon } from '../ui/Icon';
import { Group, InlineError, Pressy, Row, Spinner, Txt } from '../ui/kit';

/** 학습 수준 시트 (PRD 3.1) — 고르면 바로 저장, '완료'로 닫는다. 오늘 이미 배정된 단어는 그대로, 내일부터 적용 */
export default function LevelSheet() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { data, setData } = useLoad(async () => {
    const [levels, current] = await Promise.all([getLevels(), getMyLevel()]);
    return { levels, current };
  }, []);
  const [saveError, setSaveError] = useState(false);

  const choose = async (level: string) => {
    if (!session || !data || level === data.current) return;
    haptic.select();
    const previous = data.current;
    setData({ ...data, current: level }); // 낙관적 반영, 실패하면 되돌린다
    setSaveError(false);
    try {
      await setMyLevel(level, session.user.id);
    } catch {
      setData({ ...data, current: previous });
      setSaveError(true);
    }
  };

  return (
    <View style={{ backgroundColor: c.sheet, paddingTop: 20, paddingHorizontal: 16, paddingBottom: insets.bottom + 24, gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4 }}>
        <Txt variant="title" style={{ fontSize: 20, flex: 1 }} accessibilityRole="header">학습 수준</Txt>
        <Pressy onPress={() => router.back()} accessibilityLabel="완료" style={{ minHeight: 44, minWidth: 44, alignItems: 'flex-end', justifyContent: 'center' }}>
          <Txt variant="headline" color={c.accent}>완료</Txt>
        </Pressy>
      </View>
      <Txt variant="subhead" color={c.text2} style={{ marginHorizontal: 4, marginBottom: 4 }}>
        하루에 새로 배울 단어 수를 정합니다. 오늘 이미 배정된 단어는 그대로이고, 내일부터 적용돼요.
      </Txt>

      {!data ? (
        <View style={{ height: 180, alignItems: 'center', justifyContent: 'center' }}><Spinner color={c.text2} /></View>
      ) : (
        <View accessibilityRole="radiogroup" accessibilityLabel="학습 수준">
          <Group onSheet>
            {data.levels.map((l, i) => {
              const on = l.level === data.current;
              return (
                <Row
                  key={l.level}
                  last={i === data.levels.length - 1}
                  minHeight={60}
                  onPress={() => choose(l.level)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={`${l.label}, 하루 새 단어 ${l.daily_new_count}개`}
                >
                  <View style={{ flex: 1, gap: 2 }}>
                    <Txt variant="headline">{l.label}</Txt>
                    <Txt variant="subhead" color={c.text2} style={{ fontSize: 14 }}>하루 새 단어 {l.daily_new_count}개</Txt>
                  </View>
                  {on ? <Icon name="check" color={c.accent} size={20} /> : null}
                </Row>
              );
            })}
          </Group>
        </View>
      )}
      {saveError ? <InlineError>저장하지 못했어요. 잠시 후 다시 선택해 주세요.</InlineError> : null}
    </View>
  );
}
