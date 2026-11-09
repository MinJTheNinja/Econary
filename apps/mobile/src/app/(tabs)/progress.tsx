import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';
import { getProgress } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useLoad } from '../../lib/useLoad';
import { spring, useTheme } from '../../theme';
import { Icon } from '../../ui/Icon';
import { Card, EmptyState, Group, LargeTitle, Pressy, Row, SectionLabel, Spinner, TabScreen, Txt } from '../../ui/kit';

/** 학습 진도 (PRD 6.1) — 디자인 '진도' 보드 */
export default function ProgressScreen() {
  const { c } = useTheme();
  const { data, error, reload } = useLoad(getProgress, []);
  const focusedOnce = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (focusedOnce.current) reload();
      focusedOnce.current = true;
    }, []), // eslint-disable-line react-hooks/exhaustive-deps
  );

  if (error) {
    return (
      <TabScreen>
        <EmptyState icon="alertCircle" tone="danger" title="진도를 불러오지 못했어요."
          body="네트워크 연결을 확인한 뒤 다시 시도해 주세요." action={{ label: '다시 시도', onPress: reload }} />
      </TabScreen>
    );
  }
  if (!data) {
    return (
      <TabScreen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Spinner color={c.text2} /></View>
      </TabScreen>
    );
  }

  const { today, streak, overall, wrongWords } = data;
  const pct = overall.totalWords ? Math.round((overall.studiedWords / overall.totalWords) * 1000) / 10 : 0;
  const milestone = Math.floor(overall.studiedWords / 100) * 100 + 100;

  return (
    <TabScreen>
      <View style={{ paddingHorizontal: 4, paddingBottom: 6 }}><LargeTitle>진도</LargeTitle></View>
      <AccountCard />

      {!today.hasHistory ? (
        <EmptyState
          icon="bars" tone="tint" title="아직 학습 기록이 없어요."
          body="오늘의 단어를 학습하고 퀴즈를 풀면 여기에 진도가 쌓입니다."
          action={{ label: '오늘의 학습 시작하기', onPress: () => router.navigate('/'), kind: 'primary' }}
        />
      ) : (
        <>
          <Card style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }} accessible accessibilityLabel={`${streak}일 연속 학습`}>
              <Txt variant="display" color={streak ? c.text : c.text2} style={{ fontVariant: ['tabular-nums'] }}>{streak}</Txt>
              <Txt variant="headline">일 연속 학습</Txt>
            </View>
            <Txt variant="subhead" color={c.text2} style={{ fontSize: 14 }}>그날 배정된 새 단어를 모두 마친 날이 이어진 수예요.</Txt>
          </Card>

          <SectionLabel>오늘</SectionLabel>
          <Group>
            <Stat label="신규 학습" value={`${today.newCompleted} / ${today.newTotal}`} />
            <Stat label="복습" value={`${today.reviewCompleted} / ${today.reviewTotal}`} />
            <Stat label="남은 학습" value={`${today.remaining}`} color={today.remaining > 0 ? c.warning : undefined} last />
          </Group>

          <SectionLabel>누적</SectionLabel>
          <Group>
            <View
              style={{ gap: 10, paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 0.5, borderBottomColor: c.separator }}
              accessible
              accessibilityLabel={`학습한 단어 ${overall.studiedWords}개, 전체의 ${pct}%. 다음 ${milestone}개까지 ${milestone - overall.studiedWords}개 남았어요`}
            >
              <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                <Txt variant="callout" style={{ flex: 1 }}>학습한 단어</Txt>
                <Txt variant="callout" weight="600" style={{ fontVariant: ['tabular-nums'] }}>
                  {overall.studiedWords.toLocaleString()}개 <Txt variant="callout" weight="500" color={c.text2}>({pct}%)</Txt>
                </Txt>
              </View>
              <ProgressBar ratio={overall.totalWords ? overall.studiedWords / overall.totalWords : 0} />
              <Txt variant="footnote" weight="400" color={c.text2}>
                다음 {milestone.toLocaleString()}개까지 {(milestone - overall.studiedWords).toLocaleString()}개 남았어요
              </Txt>
            </View>
            <Stat label="아직 안 배운 단어" value={`${overall.unstudiedWords.toLocaleString()}개`} />
            <Stat
              label="퀴즈 정답률"
              value={overall.accuracy === null ? '-' : `${Math.round(overall.accuracy * 100)}%`}
              suffix={overall.accuracy === null ? undefined : `(${overall.attempts}회)`}
              last
            />
          </Group>

          <SectionLabel>오답 단어 {wrongWords.length || ''}</SectionLabel>
          <Card style={{ gap: 12, paddingTop: 14, paddingHorizontal: 16, paddingBottom: 16 }}>
            {wrongWords.length === 0 ? (
              <Txt variant="subhead" color={c.text2}>최근에 틀린 단어가 없어요.</Txt>
            ) : (
              <>
                <Txt variant="subhead" color={c.text2} style={{ fontSize: 14 }}>가장 최근 시도에서 틀린 단어예요. 복습 일정에 따라 다시 나옵니다.</Txt>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {wrongWords.map((w) => (
                    <Pressy
                      key={w.id}
                      onPress={() => router.push(`/study/${w.id}`)}
                      accessibilityLabel={`${w.term}, 오답 단어. 다시 보기`}
                      style={{ backgroundColor: c.chip, borderRadius: 22, paddingHorizontal: 14, minHeight: 44, justifyContent: 'center' }}
                    >
                      <Txt variant="subhead">{w.term}</Txt>
                    </Pressy>
                  ))}
                </View>
              </>
            )}
          </Card>
        </>
      )}
    </TabScreen>
  );
}

function Stat({ label, value, suffix, color, last }: { label: string; value: string; suffix?: string; color?: string; last?: boolean }) {
  const { c } = useTheme();
  return (
    <Row last={last} minHeight={46} accessibilityLabel={`${label} ${value}${suffix ? ` ${suffix}` : ''}`}>
      <Txt variant="callout" style={{ flex: 1 }}>{label}</Txt>
      <Txt variant="callout" weight="600" color={color} style={{ fontVariant: ['tabular-nums'] }}>
        {value}{suffix ? <Txt variant="callout" weight="500" color={c.text2}>{` ${suffix}`}</Txt> : null}
      </Txt>
    </Row>
  );
}

/** 진도 막대: 처음 그려질 때 한 번만 0→값 (spring.sheet). Reduce Motion 이면 즉시 */
function ProgressBar({ ratio }: { ratio: number }) {
  const { c } = useTheme();
  const reduce = useReducedMotion();
  const w = useSharedValue(reduce ? ratio : 0);
  useEffect(() => {
    w.value = reduce ? ratio : withSpring(ratio, spring.sheet);
  }, [ratio, reduce, w]);
  const anim = useAnimatedStyle(() => ({ width: `${Math.max(w.value * 100, 0)}%` }));
  return (
    <View style={{ height: 6, borderRadius: 3, backgroundColor: c.track, overflow: 'hidden' }}>
      <Animated.View style={[{ height: 6, borderRadius: 3, minWidth: 10, backgroundColor: c.accent }, anim]} />
    </View>
  );
}

/** 익명이면 계정 연결을 권하고, 연결돼 있으면 조용한 한 줄 */
function AccountCard() {
  const { c } = useTheme();
  const { session } = useAuth();
  const anonymous = session?.user.is_anonymous ?? true;
  if (anonymous) {
    return (
      <Pressy
        onPress={() => router.push('/account')}
        accessibilityLabel="학습 기록을 Apple/Google 계정에 연결하기"
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.surface, borderWidth: 1.5, borderColor: c.accent, borderRadius: 16, padding: 16 }}
      >
        <View style={{ flex: 1, gap: 4 }}>
          <Txt variant="callout" weight="600" color={c.accent}>학습 기록을 Apple/Google 계정에 연결하기</Txt>
          <Txt variant="subhead" color={c.text2} style={{ fontSize: 14 }}>지금은 이 기기에만 저장돼요. 연결하면 기기를 바꿔도 이어서 할 수 있어요.</Txt>
        </View>
        <Icon name="chevronRight" color={c.accent} size={16} />
      </Pressy>
    );
  }
  const label = `계정 연결됨${session?.user.email ? ` · ${session.user.email}` : ''}`;
  return (
    <Pressy
      onPress={() => router.push('/account')}
      accessibilityLabel={label}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.surface, borderRadius: 14, paddingHorizontal: 16, minHeight: 52 }}
    >
      <Icon name="user" color={c.text2} size={18} />
      <Txt variant="subhead" color={c.text2} style={{ flex: 1 }} numberOfLines={1}>{label}</Txt>
      <Icon name="chevronRight" color={c.text2} size={16} />
    </Pressy>
  );
}
