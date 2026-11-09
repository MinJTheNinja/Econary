import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { submitReport, type ReportReason, type ReportTarget } from '../lib/api';
import { useAuth } from '../lib/auth';
import { fontFamily, radius, useTheme } from '../theme';
import { haptic } from '../ui/haptics';
import { Icon } from '../ui/Icon';
import { Button, Group, IconBubble, InlineError, Pressy, Reveal, Row, Txt } from '../ui/kit';

const TARGET_LABEL: Record<ReportTarget, string> = {
  word_meaning: '단어 뜻',
  explanation: '시사 설명',
  quiz: '시사 퀴즈',
  meaning_quiz: '뜻 고르기 퀴즈',
};

const REASONS: { value: ReportReason; label: string; for?: ReportTarget[] }[] = [
  { value: 'wrong_meaning', label: '뜻·설명이 틀렸어요' },
  { value: 'wrong_answer', label: '정답이 틀렸어요', for: ['quiz', 'meaning_quiz'] },
  { value: 'outdated', label: '오래된 정보예요' },
  { value: 'typo', label: '오타가 있어요' },
  { value: 'other', label: '기타' },
];

/** 오류 신고 시트 (PRD 7.1). 접수된 신고는 관리자 웹 '오류 신고'에서 확인한다. */
export default function ReportSheet() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ wordId: string; target: ReportTarget; contentId?: string; term?: string }>();
  const target: ReportTarget = params.target in TARGET_LABEL ? params.target : 'word_meaning';
  const { session } = useAuth();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const sending = state === 'sending';

  const send = async () => {
    if (!session || !reason) return;
    setState('sending');
    try {
      await submitReport({
        userId: session.user.id,
        wordId: Number(params.wordId),
        target,
        contentId: params.contentId ? Number(params.contentId) : null,
        reason,
        note,
      });
      haptic.success();
      setState('sent');
    } catch (e) {
      console.warn('[report]', e);
      setState('error');
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: c.sheet }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: 16, paddingHorizontal: 20 }}>
        <Txt variant="headline" style={{ flex: 1, textAlign: 'center', paddingLeft: 44 }} accessibilityRole="header">오류 신고</Txt>
        <Pressy onPress={() => router.back()} accessibilityLabel="닫기" style={{ minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: c.fill, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="x" color={c.text2} size={13} />
          </View>
        </Pressy>
      </View>

      {state === 'sent' ? (
        <Reveal style={{ flex: 1, paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}>
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 24, paddingBottom: 40 }}>
            <IconBubble name="check" tone="success" />
            <Txt variant="title" style={{ fontSize: 20 }} accessibilityRole="header" accessibilityLiveRegion="polite">신고가 접수되었어요</Txt>
            <Txt variant="subhead" color={c.text2} style={{ textAlign: 'center' }}>알려 주셔서 고마워요. 확인 후 콘텐츠를 고치거나 내릴게요.</Txt>
          </View>
          <Button label="닫기" kind="tint" onPress={() => router.back()} />
        </Reveal>
      ) : (
        <ScrollView contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 16, paddingTop: 12, paddingBottom: insets.bottom + 24, gap: 12 }} keyboardShouldPersistTaps="handled">
          <View style={{ gap: 4, paddingHorizontal: 4 }}>
            <Txt variant="subhead" color={c.text2} style={{ fontSize: 14 }}>
              {params.term ? `‘${params.term}’ · ` : ''}{TARGET_LABEL[target]}
            </Txt>
            <Txt variant="title" style={{ fontSize: 22, letterSpacing: -0.2 }}>무엇이 잘못됐나요?</Txt>
          </View>

          <View accessibilityRole="radiogroup" accessibilityLabel="신고 사유">
            <Group onSheet>
              {REASONS.filter((r) => !r.for || r.for.includes(target)).map((r, i, list) => {
                const on = reason === r.value;
                return (
                  <Row
                    key={r.value}
                    last={i === list.length - 1}
                    minHeight={50}
                    onPress={sending ? undefined : () => { haptic.select(); setReason(r.value); }}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on, disabled: sending }}
                    accessibilityLabel={r.label}
                  >
                    <Txt variant="callout" style={{ flex: 1 }}>{r.label}</Txt>
                    {on ? <Icon name="check" color={c.accent} size={20} /> : null}
                  </Row>
                );
              })}
            </Group>
          </View>

          <View style={{ gap: 6, paddingHorizontal: 4 }}>
            <Txt variant="footnote" color={c.text2}>자세한 내용 (선택, 500자 이내)</Txt>
            <TextInput
              value={note}
              onChangeText={setNote}
              editable={!sending}
              placeholder="예: 뜻에 ‘상한’과 ‘하한’이 바뀌어 있어요."
              placeholderTextColor={c.textDisabled}
              maxLength={500}
              multiline
              accessibilityLabel="자세한 내용"
              style={{
                minHeight: 104, marginHorizontal: -4, borderRadius: radius.md, borderWidth: 1, borderColor: c.separator,
                backgroundColor: c.sheetSurface, color: c.text, paddingHorizontal: 14, paddingVertical: 12,
                fontSize: 16, lineHeight: 24, fontFamily, textAlignVertical: 'top',
              }}
            />
            <Txt variant="caption" color={c.text2} style={{ alignSelf: 'flex-end', fontVariant: ['tabular-nums'] }}>{note.length} / 500</Txt>
          </View>

          {state === 'error' ? <InlineError>신고를 보내지 못했어요. 다시 시도해 주세요.</InlineError> : null}
          <View style={{ flex: 1 }} />
          <Button label={sending ? '보내는 중…' : '신고하기'} onPress={send} loading={sending} disabled={!reason} />
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}
