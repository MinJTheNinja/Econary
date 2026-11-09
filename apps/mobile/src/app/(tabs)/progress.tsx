import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Body, Card, ErrorView, Loading, Screen, Title, colors } from '../../components/ui';
import { getProgress } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useLoad } from '../../lib/useLoad';

/**
 * 학습 진도 (PRD 6.1): 오늘의 신규·복습 완료와 남은 수, 누적 진도, 정답률, 오답 단어, 연속 학습 일수.
 * 학습 완료는 콘텐츠 확인 + 퀴즈 제출 기준이며, 연속 학습은 그날 배정된 신규 단어를 모두 마친 날로 센다.
 */
export default function ProgressScreen() {
  const { data, error, reload } = useLoad(getProgress, []);
  const focusedOnce = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (focusedOnce.current) reload();
      focusedOnce.current = true;
    }, []), // eslint-disable-line react-hooks/exhaustive-deps -- 탭에 돌아올 때마다 새로 계산
  );

  if (error) return <ErrorView message={`진도를 불러오지 못했습니다.\n${error}`} onRetry={reload} />;
  if (!data) return <Loading />;

  const { today, streak, overall, wrongWords } = data;
  const pct = overall.totalWords ? Math.round((overall.studiedWords / overall.totalWords) * 1000) / 10 : 0;

  if (!today.hasHistory) {
    return (
      <Screen>
        <Title>학습 진도</Title>
        <AccountCard />
        <Card>
          <Body>아직 학습 기록이 없어요.</Body>
          <Body muted>오늘의 단어를 학습하고 퀴즈를 풀면 여기에 진도가 쌓입니다.</Body>
        </Card>
        <Pressable onPress={() => router.navigate('/')} accessibilityRole="button" accessibilityLabel="오늘의 학습 시작하기">
          <Body style={{ color: colors.accent }}>오늘의 학습 시작하기 →</Body>
        </Pressable>
      </Screen>
    );
  }

  return (
    <Screen>
      <Title>학습 진도</Title>
      <AccountCard />

      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Text style={{ fontSize: 34, fontWeight: '800', color: streak ? colors.warn : colors.muted }}>{streak}</Text>
        <View style={{ flex: 1 }}>
          <Body style={{ fontWeight: '600' }}>일 연속 학습</Body>
          <Body muted style={{ fontSize: 13 }}>그날 배정된 새 단어를 모두 마친 날이 이어진 수예요.</Body>
        </View>
      </Card>

      <Card>
        <Body muted style={{ fontSize: 13, fontWeight: '600' }}>오늘</Body>
        <Stat label="신규 학습" value={`${today.newCompleted} / ${today.newTotal}`} />
        <Stat label="복습" value={`${today.reviewCompleted} / ${today.reviewTotal}`} />
        <Stat label="남은 학습" value={`${today.remaining}`} emphasize={today.remaining > 0} />
      </Card>

      <Card>
        <Body muted style={{ fontSize: 13, fontWeight: '600' }}>누적</Body>
        <Stat label="학습한 단어" value={`${overall.studiedWords.toLocaleString()}개 (${pct}%)`} />
        <Stat label="아직 안 배운 단어" value={`${overall.unstudiedWords.toLocaleString()}개`} />
        <Stat
          label="퀴즈 정답률"
          value={overall.accuracy === null ? '-' : `${Math.round(overall.accuracy * 100)}% (${overall.attempts}회)`}
        />
      </Card>

      <Card>
        <Body muted style={{ fontSize: 13, fontWeight: '600' }}>오답 단어 {wrongWords.length ? `${wrongWords.length}` : ''}</Body>
        {wrongWords.length === 0 ? (
          <Body muted>최근에 틀린 단어가 없어요.</Body>
        ) : (
          <>
            <Body muted style={{ fontSize: 13 }}>가장 최근 시도에서 틀린 단어예요. 복습 일정에 따라 다시 나옵니다.</Body>
            {wrongWords.map((w) => (
              <Pressable
                key={w.id}
                onPress={() => router.push(`/study/${w.id}`)}
                accessibilityRole="button"
                accessibilityLabel={`${w.term}, 오답 단어. 다시 보기`}
              >
                <Body style={{ color: colors.accent }}>{w.term}</Body>
              </Pressable>
            ))}
          </>
        )}
      </Card>
    </Screen>
  );
}

/** 익명이면 계정 연결을 권하고, 연결돼 있으면 계정 화면으로 가는 한 줄 */
function AccountCard() {
  const { session } = useAuth();
  const anonymous = session?.user.is_anonymous ?? true;
  const label = anonymous
    ? '학습 기록을 Apple/Google 계정에 연결하기'
    : `계정 연결됨${session?.user.email ? ` · ${session.user.email}` : ''}`;
  return (
    <Pressable onPress={() => router.push('/account')} accessibilityRole="button" accessibilityLabel={label}>
      <Card style={anonymous ? { borderColor: colors.accent } : undefined}>
        <Body style={{ color: anonymous ? colors.accent : colors.muted, fontWeight: anonymous ? '600' : '400' }}>{label} →</Body>
        {anonymous && <Body muted style={{ fontSize: 13 }}>지금은 이 기기에만 저장돼요. 연결하면 기기를 바꿔도 이어서 할 수 있어요.</Body>}
      </Card>
    </Pressable>
  );
}

function Stat({ label, value, emphasize }: { label: string; value: string; emphasize?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }} accessible accessibilityLabel={`${label} ${value}`}>
      <Body>{label}</Body>
      <Body style={{ fontWeight: '600', color: emphasize ? colors.warn : colors.text }}>{value}</Body>
    </View>
  );
}
