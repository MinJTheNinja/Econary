import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { Mark } from './Icon';
import { Button, Spinner, Txt } from './kit';

/** 앱 실행 화면 (디자인 '앱 실행 · 로딩 / 오류'): 익명 로그인이 끝날 때까지, 실패하면 다시 시도 */
export function Launch({ error, onRetry }: { error?: string | null; onRetry?: () => void }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', paddingHorizontal: 32, paddingBottom: insets.bottom + 56 }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18 }}>
        <View accessible accessibilityRole="image" accessibilityLabel="Econary">
          <Mark size={88} bg={c.accentFill} />
        </View>
        <View style={{ alignItems: 'center', gap: 4 }}>
          <Txt variant="title" style={{ fontSize: 22 }}>Econary</Txt>
          <Txt variant="subhead" color={c.text2} style={{ fontSize: 14 }}>하루 10분, 경제 어휘를 내 것으로</Txt>
        </View>
        {error ? (
          <View accessibilityRole="alert" style={{ marginTop: 28, alignItems: 'center', gap: 8 }}>
            <Txt variant="headline">로그인하지 못했습니다.</Txt>
            <Txt variant="subhead" color={c.text2} style={{ textAlign: 'center' }}>{error}</Txt>
          </View>
        ) : null}
      </View>
      {error ? (
        <View style={{ alignSelf: 'stretch' }}><Button label="다시 시도" onPress={() => onRetry?.()} /></View>
      ) : (
        <View accessibilityRole="progressbar" accessibilityLabel="학습 기록을 준비하는 중" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Spinner color={c.text2} />
          <Txt variant="subhead" color={c.text2} style={{ fontSize: 14 }}>학습 기록을 준비하는 중…</Txt>
        </View>
      )}
    </View>
  );
}
