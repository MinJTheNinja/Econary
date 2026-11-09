import { useState } from 'react';
import { View } from 'react-native';
import { getLevels, getMyLevel, setMyLevel } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useLoad } from '../lib/useLoad';
import { useTheme } from '../theme';
import { haptic } from '../ui/haptics';
import { Icon } from '../ui/Icon';
import { Group, InlineError, Row, Spinner, Txt } from '../ui/kit';

/**
 * 학습 수준 고르기 (PRD 3.1) — 고르면 바로 저장. 학습 수준 시트와 첫 실행 소개가 함께 쓴다.
 * onSheet: 시트 안 카드 색을 쓴다.
 */
export function LevelPicker({ onSheet }: { onSheet?: boolean }) {
  const { c } = useTheme();
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

  if (!data) return <View style={{ height: 180, alignItems: 'center', justifyContent: 'center' }}><Spinner color={c.text2} /></View>;

  return (
    <View style={{ gap: 12 }}>
      <View accessibilityRole="radiogroup" accessibilityLabel="학습 수준">
        <Group onSheet={onSheet}>
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
      {saveError ? <InlineError>저장하지 못했어요. 잠시 후 다시 선택해 주세요.</InlineError> : null}
    </View>
  );
}
