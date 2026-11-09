import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, TextInput } from 'react-native';
import { Body, Button, Card, Screen, Title, colors } from '../components/ui';
import { submitReport, type ReportReason, type ReportTarget } from '../lib/api';
import { useAuth } from '../lib/auth';

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

/** 단어 뜻·시사 설명·퀴즈 오류 신고 (PRD 7.1). 접수된 신고는 관리자 웹 '오류 신고'에서 확인한다. */
export default function ReportScreen() {
  const params = useLocalSearchParams<{ wordId: string; target: ReportTarget; contentId?: string; term?: string }>();
  const target: ReportTarget = params.target in TARGET_LABEL ? params.target : 'word_meaning';
  const { session } = useAuth();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | { error: string }>('idle');

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
      setState('sent');
    } catch (e) {
      setState({ error: e instanceof Error ? e.message : String(e) });
    }
  };

  if (state === 'sent') {
    return (
      <Screen>
        <Title>신고가 접수되었어요</Title>
        <Body muted>알려 주셔서 고마워요. 확인 후 콘텐츠를 고치거나 내릴게요.</Body>
        <Button label="닫기" onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Body muted>
        {params.term ? `'${params.term}' · ` : ''}{TARGET_LABEL[target]}
      </Body>
      <Title>무엇이 잘못됐나요?</Title>
      {REASONS.filter((r) => !r.for || r.for.includes(target)).map((r) => {
        const selected = reason === r.value;
        return (
          <Pressable
            key={r.value}
            onPress={() => setReason(r.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={r.label}
          >
            <Card style={selected ? { borderColor: colors.accent, borderWidth: 2 } : undefined}>
              <Text style={{ fontSize: 16, color: colors.text }}>{r.label}</Text>
            </Card>
          </Pressable>
        );
      })}
      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder="자세한 내용 (선택, 500자 이내)"
        maxLength={500}
        multiline
        accessibilityLabel="자세한 내용"
        style={{
          minHeight: 90, borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 12,
          backgroundColor: colors.card, color: colors.text, fontSize: 15, textAlignVertical: 'top',
        }}
      />
      {typeof state === 'object' && <Body style={{ color: colors.bad }}>보내지 못했어요: {state.error}</Body>}
      <Button label={state === 'sending' ? '보내는 중…' : '신고하기'} onPress={send} disabled={!reason || state === 'sending'} />
    </Screen>
  );
}
