/**
 * 플래시카드 · 카드 넘기기 (시안 5번).
 * 앞면(분야 색, 용어) → 탭하면 뒷면(뜻 · 요즘 뉴스에서). 오른쪽으로 밀거나 ✓ = 알아요, 왼쪽/✕ = 모르겠어요, ↶ = 되돌리기.
 * 결과는 부모가 모아 '모르겠어요' 단어를 복습 일정에 넣는다.
 */
import { useEffect, useMemo, useState } from 'react';
import { PanResponder, Pressable, View, useWindowDimensions } from 'react-native';
import Animated, {
  Extrapolation, interpolate, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming,
} from 'react-native-reanimated';
import { categoryColor, onCategory, radius, spring, useTheme } from '../theme';
import { CategoryChip, Rings } from '../ui/deck';
import { haptic } from '../ui/haptics';
import { Icon, type IconName } from '../ui/Icon';
import { Button, Pressy, Txt } from '../ui/kit';

export interface FlashCard {
  id: number;
  term: string;
  english: string | null;
  meaning: string;
  category: string | null;
  news: string | null;
}

export type Decision = { id: number; known: boolean };

const SWIPE = 110;

export function FlashDeck({
  cards, meaningFirst, onProgress, onDecide, onUndo, onFinish, onMatch, onClose,
}: {
  cards: FlashCard[];
  meaningFirst: boolean;
  /** index = 넘긴 장 수 */
  onProgress: (index: number, total: number) => void;
  onDecide: (d: Decision) => void;
  onUndo: (d: Decision) => void;
  /** 덱을 끝까지 넘겼을 때 (이번 판의 결정 전부) */
  onFinish: (decisions: Decision[]) => void;
  onMatch: () => void;
  onClose: () => void;
}) {
  const { c } = useTheme();
  const [deck, setDeck] = useState(cards);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const index = decisions.length;
  const done = index >= deck.length;
  const known = decisions.filter((d) => d.known).length;
  const unknown = decisions.length - known;

  useEffect(() => onProgress(index, deck.length), [index, deck.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const decide = (isKnown: boolean) => {
    const card = deck[index];
    if (!card) return;
    const d = { id: card.id, known: isKnown };
    if (isKnown) haptic.success(); else haptic.warning();
    onDecide(d);
    const next = [...decisions, d];
    setDecisions(next);
    if (next.length === deck.length) onFinish(next);
  };
  const undo = () => {
    const last = decisions[decisions.length - 1];
    if (!last) return;
    haptic.select();
    onUndo(last);
    setDecisions(decisions.slice(0, -1));
  };
  const restart = (onlyUnknown: boolean) => {
    const ids = new Set(decisions.filter((d) => !d.known).map((d) => d.id));
    setDeck(onlyUnknown ? deck.filter((cd) => ids.has(cd.id)) : deck);
    setDecisions([]);
  };

  return (
    <View style={{ flex: 1, gap: 12 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Counter tone="danger" n={unknown} label="모르겠어요" />
        <Counter tone="success" n={known} label="알아요" />
      </View>

      {done ? (
        <View style={{ flex: 1, justifyContent: 'center', gap: 20 }}>
          <View style={{ backgroundColor: c.surface, borderRadius: 18, padding: 24, gap: 6, alignItems: 'center' }}>
            <Txt variant="subhead" color={c.text2}>{deck.length}장을 모두 넘겼어요</Txt>
            <Txt variant="title">알아요 {known} · 모르겠어요 {unknown}</Txt>
            {unknown > 0 ? (
              <Txt variant="footnote" weight="400" color={c.text2} style={{ textAlign: 'center' }}>모르는 단어는 내일 복습에 넣었어요.</Txt>
            ) : null}
          </View>
          <View style={{ gap: 8 }}>
            {unknown > 0 ? <Button label="모르는 단어만 다시" onPress={() => restart(true)} /> : <Button label="처음부터 다시" onPress={() => restart(false)} />}
            <Button label="짝 맞추기 하기" kind="tint" onPress={onMatch} />
            <Pressy onPress={onClose} accessibilityLabel="닫기" style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
              <Txt variant="subhead" weight="500" color={c.accent}>닫기</Txt>
            </Pressy>
          </View>
        </View>
      ) : (
        <>
          <View style={{ flex: 1 }}>
            {/* 다음 카드가 뒤에 살짝 */}
            {deck[index + 1] ? (
              <View
                style={{
                  position: 'absolute', left: 14, right: 14, top: 14, bottom: 0, borderRadius: 22,
                  backgroundColor: categoryColor(deck[index + 1].category), opacity: 0.28,
                }}
              />
            ) : null}
            <SwipeCard key={`${deck[index].id}-${index}`} card={deck[index]} meaningFirst={meaningFirst} onDecide={decide} />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 28, paddingTop: 4 }}>
            <RoundButton icon="x" tone="danger" label="모르겠어요" onPress={() => decide(false)} />
            <RoundButton icon="undo" tone="neutral" label="되돌리기" onPress={undo} disabled={index === 0} small />
            <RoundButton icon="check" tone="success" label="알아요" onPress={() => decide(true)} />
          </View>
        </>
      )}
    </View>
  );
}

function SwipeCard({ card, meaningFirst, onDecide }: { card: FlashCard; meaningFirst: boolean; onDecide: (known: boolean) => void }) {
  const { c } = useTheme();
  const reduce = useReducedMotion();
  const { width } = useWindowDimensions();
  const [back, setBack] = useState(meaningFirst);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const rot = useSharedValue(meaningFirst ? 180 : 0);
  const color = categoryColor(card.category);
  const pan = useMemo(() => {
    const flyOut = (known: boolean) => {
      tx.set(withTiming((known ? 1 : -1) * (width + 120), { duration: reduce ? 0 : 220 }));
      setTimeout(() => onDecide(known), reduce ? 0 : 200);
    };
    return PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy),
        onPanResponderMove: (_, g) => { tx.set(g.dx); ty.set(g.dy * 0.2); },
        onPanResponderRelease: (_, g) => {
          if (Math.abs(g.dx) > SWIPE || Math.abs(g.vx) > 0.8) flyOut(g.dx > 0);
          else { tx.set(withSpring(0, spring.snappy)); ty.set(withSpring(0, spring.snappy)); }
        },
        onPanResponderTerminate: () => { tx.set(withSpring(0, spring.snappy)); ty.set(withSpring(0, spring.snappy)); },
      });
  }, [width, reduce, onDecide, tx, ty]);

  const flip = () => {
    haptic.select();
    const next = !back;
    setBack(next);
    rot.set(reduce ? (next ? 180 : 0) : withTiming(next ? 180 : 0, { duration: 320 }));
  };

  const moveStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { rotate: `${interpolate(tx.value, [-300, 0, 300], [-12, 0, 12], Extrapolation.CLAMP)}deg` },
    ],
  }));
  // 뒷면이 비치지 않도록 90° 에서 앞/뒤를 바꾼다 (backfaceVisibility 없이 웹·네이티브 동일)
  const frontStyle = useAnimatedStyle(() => ({
    opacity: rot.value < 90 ? 1 : 0,
    transform: [{ perspective: 1200 }, { rotateY: `${rot.value}deg` }],
  }));
  const backStyle = useAnimatedStyle(() => ({
    opacity: rot.value >= 90 ? 1 : 0,
    transform: [{ perspective: 1200 }, { rotateY: `${rot.value - 180}deg` }],
  }));
  const knowStamp = useAnimatedStyle(() => ({ opacity: interpolate(tx.value, [20, SWIPE], [0, 1], Extrapolation.CLAMP) }));
  const dontStamp = useAnimatedStyle(() => ({ opacity: interpolate(tx.value, [-SWIPE, -20], [1, 0], Extrapolation.CLAMP) }));

  const face = { position: 'absolute' as const, left: 0, right: 0, top: 0, bottom: 14, borderRadius: 22, overflow: 'hidden' as const };

  return (
    <Animated.View style={[{ flex: 1 }, moveStyle]} {...pan.panHandlers}>
      <Pressable
        onPress={flip}
        accessibilityLabel={back ? `${card.term}의 뜻: ${card.meaning}. 탭해서 용어 보기` : `${card.term}. 탭해서 뜻 보기`}
        accessibilityRole="button"
        style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
      >
        <Animated.View style={[face, { backgroundColor: color, padding: 22 }, frontStyle]} pointerEvents="none">
          <Rings size={260} style={{ top: -110, right: -100 }} />
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
            <CategoryChip label={card.category || '시사 어휘'} onColor />
          </View>
          <View style={{ flex: 1, justifyContent: 'center', gap: 6 }}>
            <Txt variant="term" color={onCategory.text} style={{ fontSize: 40, lineHeight: 48 }} numberOfLines={3} adjustsFontSizeToFit>{card.term}</Txt>
            {card.english ? <Txt variant="callout" color={onCategory.text2}>{card.english}</Txt> : null}
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 }}>
            <Icon name="refresh" color={onCategory.text2} size={14} />
            <Txt variant="subhead" color={onCategory.text2} style={{ fontSize: 14 }}>탭해서 뜻 보기</Txt>
          </View>
        </Animated.View>

        <Animated.View style={[face, { backgroundColor: c.surface, padding: 22, gap: 10 }, backStyle]} pointerEvents="none">
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
            <CategoryChip label={card.category || '시사 어휘'} />
          </View>
          <Txt variant="footnote" color={c.accent}>{card.term}</Txt>
          <Txt variant="title" style={{ fontSize: 22, lineHeight: 33 }} numberOfLines={7} adjustsFontSizeToFit>{card.meaning}</Txt>
          <View style={{ flex: 1 }} />
          {card.news ? (
            <View style={{ borderTopWidth: 0.5, borderTopColor: c.separator, paddingTop: 12, gap: 4 }}>
              <Txt variant="footnote" color={c.text}>요즘 뉴스에서</Txt>
              <Txt variant="subhead" color={c.text2} numberOfLines={3}>{card.news}</Txt>
            </View>
          ) : null}
        </Animated.View>
      </Pressable>

      <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 30, left: 24, transform: [{ rotate: '-10deg' }] }, knowStamp]}>
        <Stamp label="알아요" color={c.success} bg={c.successBg} />
      </Animated.View>
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 30, right: 24, transform: [{ rotate: '10deg' }] }, dontStamp]}>
        <Stamp label="모르겠어요" color={c.danger} bg={c.dangerBg} />
      </Animated.View>
    </Animated.View>
  );
}

function Stamp({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <View style={{ borderWidth: 2.5, borderColor: color, backgroundColor: bg, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 4 }}>
      <Txt variant="title" color={color} style={{ fontSize: 22 }}>{label}</Txt>
    </View>
  );
}

function Counter({ tone, n, label }: { tone: 'danger' | 'success'; n: number; label: string }) {
  const { c } = useTheme();
  const fg = tone === 'danger' ? c.danger : c.success;
  const bg = tone === 'danger' ? c.dangerBg : c.successBg;
  const badge = (
    <View style={{ minWidth: 20, height: 20, borderRadius: 10, backgroundColor: fg, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 }}>
      <Txt variant="caption" weight="700" color={tone === 'danger' ? c.onDanger : c.onSuccess} style={{ fontVariant: ['tabular-nums'] }}>{n}</Txt>
    </View>
  );
  return (
    <View
      accessible
      accessibilityLabel={`${label} ${n}개`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: bg, borderRadius: radius.pill, paddingHorizontal: 10, height: 30 }}
    >
      {tone === 'danger' ? badge : null}
      <Txt variant="footnote" color={fg} style={{ fontSize: 14 }}>{label}</Txt>
      {tone === 'success' ? badge : null}
    </View>
  );
}

function RoundButton({
  icon, tone, label, onPress, disabled, small,
}: { icon: IconName; tone: 'danger' | 'success' | 'neutral'; label: string; onPress: () => void; disabled?: boolean; small?: boolean }) {
  const { c } = useTheme();
  const d = small ? 48 : 64;
  const fg = tone === 'danger' ? c.danger : tone === 'success' ? c.success : c.text2;
  return (
    <Pressy
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={label}
      style={{
        width: d, height: d, borderRadius: d / 2, alignItems: 'center', justifyContent: 'center',
        backgroundColor: c.surface, borderWidth: tone === 'neutral' ? 0 : 1.5, borderColor: fg, opacity: disabled ? 0.4 : 1,
      }}
    >
      <Icon name={icon} color={fg} size={small ? 20 : 26} />
    </Pressy>
  );
}
