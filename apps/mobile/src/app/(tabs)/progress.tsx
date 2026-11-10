import { studyDate } from '@tesat/core';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';
import { getProgress } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { isToss } from '../../lib/target';
import { useLoad } from '../../lib/useLoad';
import { spring, useTheme } from '../../theme';
import { Icon } from '../../ui/Icon';
import { Heatmap, RingStat } from '../../ui/deck';
import { Card, EmptyState, LargeTitle, Pressy, Spinner, TabScreen, Txt } from '../../ui/kit';

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
          <Card style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }} accessible accessibilityLabel={`${streak}일 연속 학습`}>
              <Txt variant="largeTitle" color={streak ? c.text : c.text2} style={{ fontVariant: ['tabular-nums'] }}>{streak}</Txt>
              <Txt variant="headline" style={{ flex: 1 }}>일 연속 학습</Txt>
              <Txt variant="caption" color={c.text2}>최근 5주</Txt>
            </View>
            <Heatmap cells={data.heatmap} today={studyDate()} />
          </Card>

          <Card
            style={{ gap: 10 }}
          >
            <View
              style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}
              accessible
              accessibilityLabel={`학습한 단어 ${overall.studiedWords}개, 전체 ${overall.totalWords}개의 ${pct}%. 다음 ${milestone}개까지 ${milestone - overall.studiedWords}개`}
            >
              <Txt variant="title" style={{ fontVariant: ['tabular-nums'] }}>{overall.studiedWords.toLocaleString()}</Txt>
              <Txt variant="subhead" color={c.text2} style={{ flex: 1, fontSize: 14 }}>/ {overall.totalWords.toLocaleString()} 단어 · {pct}%</Txt>
              <Txt variant="footnote" color={c.accent}>다음 {milestone.toLocaleString()}개까지 {(milestone - overall.studiedWords).toLocaleString()}개</Txt>
            </View>
            <ProgressBar ratio={overall.totalWords ? overall.studiedWords / overall.totalWords : 0} />
          </Card>

          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Card style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 }}>
              <RingStat ratio={overall.accuracy} size={56} />
              <View
                style={{ flex: 1, gap: 2 }}
                accessible
                accessibilityLabel={`퀴즈 정답률 ${overall.accuracy === null ? '기록 없음' : `${Math.round(overall.accuracy * 100)}%`}, ${overall.attempts}회`}
              >
                <Txt variant="subhead" weight="600" style={{ fontSize: 14 }} numberOfLines={1} adjustsFontSizeToFit>퀴즈 정답률</Txt>
                <Txt variant="caption" color={c.text2}>{overall.attempts}회</Txt>
              </View>
            </Card>
            <Card style={{ flex: 1, gap: 4 }}>
              <Txt variant="subhead" weight="600" style={{ fontSize: 14 }}>오늘</Txt>
              <MiniStat label="신규" value={`${today.newCompleted}/${today.newTotal}`} />
              <MiniStat label="복습" value={`${today.reviewCompleted}/${today.reviewTotal}`} />
              <MiniStat label="남은 학습" value={`${today.remaining}`} color={today.remaining > 0 ? c.warning : undefined} />
            </Card>
          </View>

          <Card style={{ gap: 12, paddingTop: 14, paddingHorizontal: 16, paddingBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Txt variant="subhead" weight="600" style={{ flex: 1 }}>오답 단어</Txt>
              {wrongWords.length ? <Txt variant="subhead" weight="700" color={c.danger}>{wrongWords.length}</Txt> : null}
            </View>
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

function MiniStat({ label, value, color }: { label: string; value: string; color?: string }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }} accessible accessibilityLabel={`${label} ${value}`}>
      <Txt variant="caption" color={c.text2} style={{ flex: 1 }}>{label}</Txt>
      <Txt variant="caption" weight="600" color={color} style={{ fontVariant: ['tabular-nums'] }}>{value}</Txt>
    </View>
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

/** 익명이면 계정 연결을 권하고, 연결돼 있으면 조용한 한 줄. 토스 미니앱은 계정 연결이 없어 계정 관리(삭제·방침) 한 줄만 */
function AccountCard() {
  const { c } = useTheme();
  const { session } = useAuth();
  const anonymous = session?.user.is_anonymous ?? true;
  if (anonymous && !isToss) {
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
  const label = isToss ? '익명 학습 · 계정 관리' : `계정 연결됨${session?.user.email ? ` · ${session.user.email}` : ''}`;
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
