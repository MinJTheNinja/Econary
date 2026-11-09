import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ExamRoundPicker, MinutesPicker, PlanSummary } from '../components/StudyPlan';
import { getExamRounds, getMyPlan, saveStudyProfile } from '../lib/api';
import { useAuth } from '../lib/auth';
import { finishOnboarding } from '../lib/onboarding';
import { useLoad } from '../lib/useLoad';
import { categoryColors, onCategory, radius, useTheme } from '../theme';
import { haptic } from '../ui/haptics';
import { Icon, Mark, type IconName } from '../ui/Icon';
import { Button, InlineError, Pressy, Reveal, Spinner, Txt } from '../ui/kit';

/**
 * 소개 카드. 시안의 '후기 카드' 변형은 실제 학습자 후기가 생기면 그때 넣는다 — 지금은 '후기 없을 때 · 앱 소개' 변형.
 */
const CARDS: { badge: string | IconName; color: string; body: string; chip: string }[] = [
  { badge: 'calendar', color: categoryColors.금융, body: '시험일과 공부 시간에 맞춰 하루 단어 수를 정해 드려요.', chip: '맞춤 계획' },
  { badge: 'refresh', color: categoryColors.공공, body: '틀린 단어는 잊을 때쯤 다시 나와요. 퀴즈 한 문제로 확인해요.', chip: '복습' },
  { badge: 'bars', color: categoryColors.경영, body: '매일 이어 가면 진도 잔디가 채워져요.', chip: '5일 연속 학습' },
];
const ICON_BADGES: string[] = ['calendar', 'refresh', 'bars'];

type Step = 'intro' | 'exam' | 'time' | 'plan';
const STEPS: Step[] = ['intro', 'exam', 'time', 'plan'];
const HEAD: Record<Exclude<Step, 'intro'>, [string, string]> = {
  exam: ['언제 시험을 보세요?', '시험일에 맞춰 학습 계획을 세워 드려요.'],
  time: ['하루에 얼마나\n공부할 수 있나요?', '복습 시간까지 포함해서 골라 주세요.'],
  plan: ['이렇게 공부해 볼까요?', '오늘 탭에서 언제든 바꿀 수 있어요.'],
};

/**
 * 첫 실행 (시안 4번): 앱 소개 → 시험 회차 → 하루 공부 시간 → 계획 요약 → 오늘 탭.
 * 익명 학습자는 앱을 열 때 이미 만들어져 있고, 여기서 고른 값을 프로필에 저장하면 온보딩 완료.
 * '이미 계정이 있어요' → 계정 화면 로그인 모드 (기존 Apple/Google 계정).
 */
export default function Welcome() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const [step, setStep] = useState<Step>('intro');
  const [examRoundId, setExamRoundId] = useState<number | null | undefined>(undefined);
  const [minutes, setMinutes] = useState<number | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);

  const rounds = useLoad(() => (step === 'intro' ? Promise.resolve(null) : getExamRounds()), [step === 'intro']);
  const examDate = rounds.data?.find((r) => r.id === examRoundId)?.exam_date ?? null;
  const plan = useLoad(
    () => (step === 'plan' && minutes ? getMyPlan({ examDate, dailyMinutes: minutes }) : Promise.resolve(null)),
    [step, examDate, minutes],
  );

  const go = (to: Step) => { haptic.select(); setSaveError(false); setStep(to); };
  const back = () => go(STEPS[STEPS.indexOf(step) - 1]);

  const begin = async () => {
    if (!session || !minutes || examRoundId === undefined) return;
    setSaving(true);
    setSaveError(false);
    try {
      await saveStudyProfile(session.user.id, { examRoundId, dailyMinutes: minutes, onboarded: true });
      haptic.success();
      finishOnboarding(session.user.id); // 루트 레이아웃이 오늘 탭으로 넘긴다
    } catch {
      setSaveError(true);
      setSaving(false);
    }
  };

  const footer = (
    <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: Math.max(insets.bottom, 12) + 4, gap: 4 }}>
      {saveError ? <InlineError>저장하지 못했어요. 잠시 후 다시 시도해 주세요.</InlineError> : null}
      {step === 'intro' ? (
        <>
          <Button label="시작하기" onPress={() => go('exam')} />
          <Pressy
            onPress={() => router.push({ pathname: '/account', params: { mode: 'signin' } })}
            accessibilityLabel="이미 계정이 있어요. 로그인하기"
            style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
          >
            <Txt variant="subhead" color={c.accent} weight="500">이미 계정이 있어요</Txt>
          </Pressy>
        </>
      ) : (
        <>
          {step === 'exam' && <Button label="다음" onPress={() => go('time')} disabled={examRoundId === undefined} />}
          {step === 'time' && <Button label="다음" onPress={() => go('plan')} disabled={!minutes} />}
          {step === 'plan' && <Button label="학습 시작하기" onPress={begin} loading={saving} disabled={!plan.data} />}
          <Pressy onPress={back} disabled={saving} accessibilityLabel="이전" style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Txt variant="subhead" color={c.text2} weight="500">이전</Txt>
          </Pressy>
        </>
      )}
    </View>
  );

  const loadingBox = <View style={{ height: 180, alignItems: 'center', justifyContent: 'center' }}><Spinner color={c.text2} /></View>;
  const retryBox = (onRetry: () => void) => (
    <View style={{ gap: 12, alignItems: 'center', paddingVertical: 24 }}>
      <InlineError>불러오지 못했어요. 네트워크 연결을 확인해 주세요.</InlineError>
      <Button label="다시 시도" kind="tint" height={44} onPress={onRetry} />
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 20, paddingBottom: 12, gap: 20, flexGrow: 1 }}>
        <View style={{ paddingHorizontal: 20, gap: 18 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Mark size={24} bg={c.accentFill} />
            <Txt variant="footnote" color={c.text2} weight="500" style={{ flex: 1 }}>Econary</Txt>
            {step !== 'intro' ? <StepDots index={STEPS.indexOf(step) - 1} count={STEPS.length - 1} /> : null}
          </View>
          <View style={{ gap: 6 }}>
            <Txt variant="title" style={{ fontSize: 26, lineHeight: 34 }} accessibilityRole="header">
              {step === 'intro' ? '시험까지 남은 날,\n경제 어휘를 계획대로' : HEAD[step][0]}
            </Txt>
            <Txt variant="subhead" color={c.text2}>{step === 'intro' ? '하루 10분이면 충분해요.' : HEAD[step][1]}</Txt>
          </View>
        </View>

        {step === 'intro' && <IntroCards />}

        {step === 'exam' && (
          <Reveal style={{ paddingHorizontal: 16 }}>
            {rounds.error ? retryBox(rounds.reload) : !rounds.data ? loadingBox : (
              <ExamRoundPicker rounds={rounds.data} value={examRoundId} onChange={(id) => { haptic.select(); setExamRoundId(id); }} />
            )}
          </Reveal>
        )}

        {step === 'time' && (
          <Reveal style={{ paddingHorizontal: 16 }}>
            <MinutesPicker value={minutes} onChange={(m) => { haptic.select(); setMinutes(m); }} />
          </Reveal>
        )}

        {step === 'plan' && (
          <Reveal style={{ paddingHorizontal: 16 }}>
            {plan.error ? retryBox(plan.reload) : !plan.data ? loadingBox : <PlanSummary plan={plan.data} />}
          </Reveal>
        )}
      </ScrollView>
      {footer}
    </View>
  );
}

function StepDots({ index, count }: { index: number; count: number }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 6 }} accessible accessibilityLabel={`${count}단계 중 ${index + 1}단계`}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={{ width: i === index ? 16 : 6, height: 6, borderRadius: 3, backgroundColor: i <= index ? c.accent : c.separator }} />
      ))}
    </View>
  );
}

function IntroCards() {
  const { c } = useTheme();
  const { width } = useWindowDimensions();
  const [page, setPage] = useState(0);
  const cardW = Math.min(width, 480) - 32 - 40; // 다음 카드가 살짝 보이도록
  const gap = 12;
  return (
    <View style={{ gap: 14 }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={cardW + gap}
        decelerationRate="fast"
        contentContainerStyle={{ paddingHorizontal: 16, gap }}
        scrollEventThrottle={16}
        onScroll={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / (cardW + gap)))}
      >
        {CARDS.map((card) => (
          <View
            key={card.chip}
            accessible
            accessibilityLabel={card.body}
            style={{ width: cardW, minHeight: 220, backgroundColor: c.surface, borderRadius: 18, padding: 20, justifyContent: 'space-between' }}
          >
            <View style={{ gap: 14 }}>
              <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: card.color, alignItems: 'center', justifyContent: 'center' }}>
                {ICON_BADGES.includes(card.badge)
                  ? <Icon name={card.badge as IconName} color={onCategory.text} size={20} />
                  : <Txt variant="headline" color={onCategory.text} weight="700">{card.badge}</Txt>}
              </View>
              <Txt variant="headline" style={{ lineHeight: 26 }}>{card.body}</Txt>
            </View>
            <View style={{ alignSelf: 'flex-start', backgroundColor: card.color, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 3 }}>
              <Txt variant="footnote" color={onCategory.text} style={{ fontSize: 12 }}>{card.chip}</Txt>
            </View>
          </View>
        ))}
      </ScrollView>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {CARDS.map((card, i) => (
          <View key={card.chip} style={{ width: i === page ? 16 : 6, height: 6, borderRadius: 3, backgroundColor: i === page ? c.accent : c.separator }} />
        ))}
      </View>
    </View>
  );
}
