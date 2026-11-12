import { shuffle } from '@tesat/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FlashDeck, type Decision, type FlashCard } from '../components/FlashDeck';
import { MatchGame } from '../components/MatchGame';
import { getExplanations, getTodayAssignment, getWords, markUnknown } from '../lib/api';
import { useAuth } from '../lib/auth';
import { getPref, setPref } from '../lib/prefs';
import { useLoad } from '../lib/useLoad';
import { radius, useTheme } from '../theme';
import { haptic } from '../ui/haptics';
import { Icon } from '../ui/Icon';
import { EmptyState, Pressy, Spinner, Txt } from '../ui/kit';

type Mode = 'flip' | 'match';
type Settings = { meaningFirst: boolean; shuffle: boolean };
const DEFAULT_SETTINGS: Settings = { meaningFirst: false, shuffle: false };

async function loadCards(): Promise<FlashCard[]> {
  const assignments = await getTodayAssignment();
  const ids = assignments.map((a) => a.word_id);
  const [words, news] = await Promise.all([getWords(ids), getExplanations(ids)]);
  return ids.flatMap((id) => {
    const w = words.get(id);
    return w ? [{ id, term: w.term, english: w.english_name, meaning: w.meaning, category: w.category, news: news.get(id)?.body ?? null }] : [];
  });
}

function flushUnknown(pending: Set<number>, userId: string | undefined) {
  const ids = [...pending];
  pending.clear();
  if (userId && ids.length) markUnknown(userId, ids).catch((e) => console.warn('[cards] markUnknown', e));
}

const shuffled = <T,>(xs: T[]) => shuffle(xs);

/**
 * 플래시카드 (시안 5번): 오늘 단어로 카드 넘기기 / 짝 맞추기.
 * '모르겠어요' 단어는 덱을 끝냈을 때 또는 화면을 닫을 때 한 번에 내일 복습에 넣는다.
 */
export default function CardsScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const userId = session?.user.id;
  const params = useLocalSearchParams<{ mode?: string }>();
  const [mode, setMode] = useState<Mode>(params.mode === 'match' ? 'match' : 'flip');
  const [settings, setSettings] = useState<Settings | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [progress, setProgress] = useState<[number, number]>([0, 0]);
  const [round, setRound] = useState(0);
  const { data: cards, error, reload } = useLoad(loadCards, []);

  useEffect(() => { void getPref('flash-settings', DEFAULT_SETTINGS).then(setSettings); }, []);

  // 아직 저장하지 않은 '모르겠어요'. 되돌리기로 빠질 수 있다
  const pending = useRef(new Set<number>());
  const flush = () => flushUnknown(pending.current, userId);
  useEffect(() => {
    const set = pending.current;
    return () => flushUnknown(set, userId); // 닫을 때(제스처 포함) 남은 것 저장
  }, [userId]);

  const close = () => { flush(); if (router.canGoBack()) router.back(); else router.replace('/'); };
  const switchMode = (m: Mode) => { if (m !== mode) { haptic.select(); setMode(m); } };
  const updateSettings = (s: Settings) => {
    setSettings(s);
    void setPref('flash-settings', s);
    setRound((r) => r + 1); // 새 설정으로 덱을 다시
  };

  const shuffle = settings?.shuffle;
  const deck = useMemo(
    () => (cards && shuffle !== undefined ? (shuffle ? shuffled(cards) : cards) : null),
    [cards, shuffle, round], // eslint-disable-line react-hooks/exhaustive-deps -- round: 다시 섞기
  );
  const [i, n] = progress;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top + 4 }}>
      {/* 상단 막대: 닫기 · 제목 · 설정 */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, minHeight: 48 }}>
        <Pressy onPress={close} accessibilityLabel="닫기" style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="x" color={c.text} size={20} />
        </Pressy>
        <Txt variant="headline" style={{ flex: 1, textAlign: 'center', fontVariant: ['tabular-nums'] }} accessibilityRole="header">
          {mode === 'flip' && n ? `${Math.min(i + 1, n)} / ${n}` : '오늘 단어'}
        </Txt>
        {mode === 'flip' ? (
          <Pressy onPress={() => setShowSettings(true)} accessibilityLabel="카드 설정" style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="sliders" color={c.text2} size={20} />
          </Pressy>
        ) : <View style={{ width: 44 }} />}
      </View>

      <View style={{ paddingHorizontal: 16, gap: 10, paddingBottom: 12 }}>
        <Segmented value={mode} onChange={switchMode} />
        {mode === 'flip' ? (
          <View style={{ height: 3, borderRadius: 2, backgroundColor: c.track }}>
            <View style={{ height: 3, borderRadius: 2, backgroundColor: c.accentFill, width: n ? `${(i / n) * 100}%` : 0 }} />
          </View>
        ) : null}
      </View>

      {error ? (
        <EmptyState icon="alertCircle" tone="danger" title="오늘의 단어를 불러오지 못했어요."
          body="네트워크 연결을 확인한 뒤 다시 시도해 주세요." action={{ label: '다시 시도', onPress: reload }} />
      ) : !deck ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Spinner color={c.text2} /></View>
      ) : deck.length === 0 ? (
        <EmptyState icon="bookCheck" tone="success" title="오늘 배정된 단어가 없어요." body="새 단어가 배정되면 카드로 볼 수 있어요." />
      ) : mode === 'flip' ? (
        <View style={{ flex: 1, paddingHorizontal: 16, paddingBottom: Math.max(insets.bottom, 12) + 8 }}>
          <FlashDeck
            key={round}
            cards={deck}
            meaningFirst={settings!.meaningFirst}
            onProgress={(a, b) => setProgress([a, b])}
            onDecide={(d: Decision) => { if (!d.known) pending.current.add(d.id); }}
            onUndo={(d: Decision) => { if (!d.known) pending.current.delete(d.id); }}
            onFinish={flush}
            onMatch={() => switchMode('match')}
            onClose={close}
          />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 16, paddingBottom: Math.max(insets.bottom, 12) + 8 }}>
          <MatchGame cards={deck} onExit={close} />
        </ScrollView>
      )}

      <Modal visible={showSettings} transparent animationType="fade" onRequestClose={() => setShowSettings(false)}>
        <Pressable style={{ flex: 1, backgroundColor: c.scrim, justifyContent: 'flex-end' }} onPress={() => setShowSettings(false)} accessibilityLabel="설정 닫기">
          <Pressable onPress={() => {}} style={{ backgroundColor: c.sheet, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, padding: 16, paddingBottom: Math.max(insets.bottom, 12) + 8, gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4 }}>
              <Txt variant="title" style={{ fontSize: 20, flex: 1 }} accessibilityRole="header">카드 설정</Txt>
              <Pressy onPress={() => setShowSettings(false)} accessibilityLabel="완료" style={{ minHeight: 44, minWidth: 44, alignItems: 'flex-end', justifyContent: 'center' }}>
                <Txt variant="headline" color={c.accent}>완료</Txt>
              </Pressy>
            </View>
            {settings ? (
              <View style={{ backgroundColor: c.sheetSurface, borderRadius: radius.xl, paddingHorizontal: 16 }}>
                <ToggleRow label="뜻 먼저 보기" value={settings.meaningFirst} onChange={(v) => updateSettings({ ...settings, meaningFirst: v })} />
                <ToggleRow label="순서 섞기" value={settings.shuffle} onChange={(v) => updateSettings({ ...settings, shuffle: v })} last />
              </View>
            ) : null}
            <Txt variant="caption" color={c.text2} style={{ paddingHorizontal: 4 }}>설정을 바꾸면 처음 카드부터 다시 시작해요.</Txt>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function Segmented({ value, onChange }: { value: Mode; onChange: (m: Mode) => void }) {
  const { c, isDark } = useTheme();
  const items: [Mode, string][] = [['flip', '카드 넘기기'], ['match', '짝 맞추기']];
  return (
    <View style={{ flexDirection: 'row', backgroundColor: c.fill, borderRadius: radius.md, padding: 3 }} accessibilityRole="tablist">
      {items.map(([m, label]) => {
        const on = m === value;
        return (
          <View key={m} style={{ flex: 1 }}>
          <Pressy
            onPress={() => onChange(m)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={label}
            style={{
              height: 34, borderRadius: radius.md - 3, alignItems: 'center', justifyContent: 'center',
              backgroundColor: on ? (isDark ? c.disabledBg : c.surface) : 'transparent',
            }}
          >
            <Txt variant="footnote" weight={on ? '700' : '500'} style={{ fontSize: 14 }}>{label}</Txt>
          </Pressy>
          </View>
        );
      })}
    </View>
  );
}

function ToggleRow({ label, value, onChange, last }: { label: string; value: boolean; onChange: (v: boolean) => void; last?: boolean }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 52, borderBottomWidth: last ? 0 : 0.5, borderBottomColor: c.separator }}>
      <Txt variant="callout" style={{ flex: 1 }}>{label}</Txt>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: c.accentFill, false: c.fill }} accessibilityLabel={label} />
    </View>
  );
}
