import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ExamRoundPicker, MinutesPicker, PlanSummary } from '../components/StudyPlan';
import { getExamRounds, getMyPlan, getMyProfile, saveStudyProfile } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useLoad } from '../lib/useLoad';
import { useTheme } from '../theme';
import { haptic } from '../ui/haptics';
import { Button, InlineError, Pressy, SectionLabel, Spinner, Txt } from '../ui/kit';

/**
 * 학습 계획 시트 (오늘 탭 'D-n · 하루 n개 (변경)'). 기존 '학습 수준' 시트를 대체.
 * 고르는 동안 계획을 미리 보여 주고 '저장'으로 반영한다. 오늘 이미 배정된 단어는 그대로, 내일부터 적용.
 */
export default function StudyPlanSheet() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const base = useLoad(async () => {
    const [rounds, profile] = await Promise.all([getExamRounds(), getMyProfile()]);
    return { rounds, profile };
  }, []);
  // 사용자가 바꾼 값 (undefined = 아직 안 바꿈 → 저장된 값)
  const [examPick, setExamPick] = useState<{ id: number | null } | undefined>(undefined);
  const [minutesPick, setMinutesPick] = useState<number | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);

  const rounds = base.data?.rounds ?? [];
  const saved = base.data?.profile;
  // 지난 회차는 목록에 없으니 '아직 안 고름'으로 둔다
  const savedExam = saved ? (saved.exam_round_id === null ? null : rounds.some((r) => r.id === saved.exam_round_id) ? saved.exam_round_id : undefined) : undefined;
  const examRoundId = examPick ? examPick.id : savedExam;
  const minutes = minutesPick ?? saved?.daily_minutes ?? undefined;
  const examDate = rounds.find((r) => r.id === examRoundId)?.exam_date ?? null;

  const preview = useLoad(
    () => (base.data && minutes ? getMyPlan({ examDate, dailyMinutes: minutes }) : Promise.resolve(null)),
    [!!base.data, examDate, minutes],
  );

  const canSave = !!session && examRoundId !== undefined && !!minutes;
  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setSaveError(false);
    try {
      await saveStudyProfile(session.user.id, { examRoundId: examRoundId!, dailyMinutes: minutes!, onboarded: !saved?.onboarded_at });
      haptic.success();
      router.back();
    } catch {
      setSaveError(true);
      setSaving(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.sheet }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: 20, paddingHorizontal: 20 }}>
        <Txt variant="title" style={{ fontSize: 20, flex: 1 }} accessibilityRole="header">학습 계획</Txt>
        <Pressy onPress={() => router.back()} accessibilityLabel="닫기" style={{ minHeight: 44, minWidth: 44, alignItems: 'flex-end', justifyContent: 'center' }}>
          <Txt variant="headline" color={c.text2}>닫기</Txt>
        </Pressy>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16, gap: 8 }}>
        <Txt variant="subhead" color={c.text2} style={{ marginHorizontal: 4 }}>
          시험일과 하루 공부 시간으로 매일 새 단어 수를 정해요. 오늘 이미 배정된 단어는 그대로이고, 내일부터 적용돼요.
        </Txt>
        {base.error ? (
          <View style={{ gap: 12, alignItems: 'center', paddingVertical: 24 }}>
            <InlineError>불러오지 못했어요. 네트워크 연결을 확인해 주세요.</InlineError>
            <Button label="다시 시도" kind="tint" height={44} onPress={base.reload} />
          </View>
        ) : !base.data ? (
          <View style={{ height: 240, alignItems: 'center', justifyContent: 'center' }}><Spinner color={c.text2} /></View>
        ) : (
          <>
            {preview.data ? <View style={{ paddingTop: 8 }}><PlanSummary plan={preview.data} onSheet /></View> : null}
            <SectionLabel>시험 회차</SectionLabel>
            <ExamRoundPicker rounds={rounds} value={examRoundId} onChange={(id) => { haptic.select(); setExamPick({ id }); }} onSheet />
            <SectionLabel>하루 공부 시간</SectionLabel>
            <MinutesPicker value={minutes} onChange={(m) => { haptic.select(); setMinutesPick(m); }} onSheet />
          </>
        )}
      </ScrollView>
      <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: Math.max(insets.bottom, 12) + 8, gap: 8 }}>
        {saveError ? <InlineError>저장하지 못했어요. 잠시 후 다시 시도해 주세요.</InlineError> : null}
        <Button label="저장" onPress={save} loading={saving} disabled={!canSave} />
      </View>
    </View>
  );
}
