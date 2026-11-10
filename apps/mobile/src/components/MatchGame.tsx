/**
 * 플래시카드 · 짝 맞추기 (시안 5번). 오늘 단어 최대 6쌍, 단어와 뜻을 차례로 눌러 짝을 맞춘다.
 * 첫 탭부터 시간을 재고, 최고 기록은 기기에만 남긴다. 학습 기록에는 반영하지 않는다.
 */
import { useEffect, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { getPref, setPref } from '../lib/prefs';
import { radius, useTheme } from '../theme';
import { haptic } from '../ui/haptics';
import { Button, EmptyState, Pressy, Reveal, Txt } from '../ui/kit';
import type { FlashCard } from './FlashDeck';

const MAX_PAIRS = 6;
/** 이벤트 핸들러에서만 부른다 */
const clock = () => Date.now();
const MIN_PAIRS = 3;

type Tile = { key: string; pairId: number; kind: 'term' | 'meaning'; text: string };

function shuffle<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 뜻의 첫 문장 (짝 칸에 들어갈 만큼) */
const shortMeaning = (m: string) => {
  const first = m.split(/(?<=[.。!?])\s/)[0] ?? m;
  return first.replace(/[.。]$/, '');
};

function deal(cards: FlashCard[]): Tile[] {
  const picked = shuffle(cards).slice(0, MAX_PAIRS);
  return shuffle(
    picked.flatMap((cd) => [
      { key: `t${cd.id}`, pairId: cd.id, kind: 'term' as const, text: cd.term },
      { key: `m${cd.id}`, pairId: cd.id, kind: 'meaning' as const, text: shortMeaning(cd.meaning) },
    ]),
  );
}

const fmt = (ms: number) => {
  const s = ms / 1000;
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`;
};

export function MatchGame({ cards, onExit }: { cards: FlashCard[]; onExit: () => void }) {
  const { c } = useTheme();
  const { width } = useWindowDimensions();
  const [tiles, setTiles] = useState(() => deal(cards));
  const [selected, setSelected] = useState<string | null>(null);
  const [matched, setMatched] = useState<Set<number>>(new Set());
  const [wrong, setWrong] = useState<string[]>([]);
  const [mistakes, setMistakes] = useState(0);
  const [confused, setConfused] = useState<Map<number, number>>(new Map());
  const [startAt, setStartAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [result, setResult] = useState<{ ms: number; best: number | null } | null>(null);

  const pairs = tiles.length / 2;
  const finished = result !== null;

  useEffect(() => {
    if (startAt === null || finished) return;
    const t = setInterval(() => setNow(clock()), 100);
    return () => clearInterval(t);
  }, [startAt, finished]);

  if (cards.length < MIN_PAIRS) {
    return <EmptyState icon="info" tone="fill" title="단어가 3개 이상일 때 할 수 있어요." body="오늘 배정된 단어가 더 생기면 다시 와 주세요." />;
  }

  const finish = async (end: number) => {
    const ms = end - (startAt ?? end);
    const key = `match-best:${pairs}`;
    const best = await getPref<number | null>(key, null);
    if (best === null || ms < best) await setPref(key, ms);
    setResult({ ms, best });
  };

  const tap = (tile: Tile) => {
    if (finished || matched.has(tile.pairId) || wrong.length) return;
    const t0 = startAt ?? clock();
    if (startAt === null) { setStartAt(t0); setNow(t0); }
    if (!selected) { haptic.select(); setSelected(tile.key); return; }
    if (selected === tile.key) { setSelected(null); return; }
    const other = tiles.find((x) => x.key === selected)!;
    if (other.kind === tile.kind) { haptic.select(); setSelected(tile.key); return; }
    if (other.pairId === tile.pairId) {
      haptic.success();
      const next = new Set(matched).add(tile.pairId);
      setMatched(next);
      setSelected(null);
      if (next.size === pairs) void finish(clock());
    } else {
      haptic.warning();
      setMistakes((n) => n + 1);
      const termId = other.kind === 'term' ? other.pairId : tile.pairId;
      setConfused((m) => new Map(m).set(termId, (m.get(termId) ?? 0) + 1));
      setWrong([other.key, tile.key]);
      setTimeout(() => { setWrong([]); setSelected(null); }, 450);
    }
  };

  const again = () => {
    setTiles(deal(cards));
    setSelected(null);
    setMatched(new Set());
    setWrong([]);
    setMistakes(0);
    setConfused(new Map());
    setStartAt(null);
    setNow(0);
    setResult(null);
  };

  if (result) {
    const mostConfused = [...confused.entries()].sort((a, b) => b[1] - a[1])[0];
    const term = mostConfused ? cards.find((cd) => cd.id === mostConfused[0])?.term : null;
    const diff = result.best !== null ? (result.best - result.ms) / 1000 : null;
    return (
      <Reveal style={{ flex: 1, gap: 20 }}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 6 }}>
          <Txt variant="subhead" color={c.text2}>{pairs}쌍을 모두 맞췄어요</Txt>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end' }} accessible accessibilityLabel={`${(result.ms / 1000).toFixed(1)}초`}>
            <Txt variant="display" style={{ fontSize: 64, lineHeight: 72, fontVariant: ['tabular-nums'] }}>{(result.ms / 1000).toFixed(1)}</Txt>
            <Txt variant="title" style={{ paddingBottom: 10 }}>초</Txt>
          </View>
          {diff !== null ? (
            <View style={{ backgroundColor: diff > 0 ? c.successBg : c.badgeNeutral, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 4 }}>
              <Txt variant="footnote" color={diff > 0 ? c.success : c.badgeNeutralText}>
                {diff > 0 ? `내 기록보다 ${diff.toFixed(1)}초 빨라요` : `내 기록 ${(result.best! / 1000).toFixed(1)}초`}
              </Txt>
            </View>
          ) : (
            <View style={{ backgroundColor: c.tint, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 4 }}>
              <Txt variant="footnote" color={c.onTint}>첫 기록이에요</Txt>
            </View>
          )}
          <View style={{ alignSelf: 'stretch', backgroundColor: c.surface, borderRadius: radius.xl, paddingHorizontal: 16, marginTop: 20 }}>
            <StatRow label="틀린 짝" value={`${mistakes}번`} />
            <StatRow label="자주 헷갈린 단어" value={term ?? '없음'} last />
          </View>
        </View>
        <View style={{ gap: 4 }}>
          <Button label="다시 하기" onPress={again} />
          <Pressy onPress={onExit} accessibilityLabel="오늘 화면으로" style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Txt variant="subhead" weight="500" color={c.accent}>오늘 화면으로</Txt>
          </Pressy>
        </View>
      </Reveal>
    );
  }

  const gap = 10;
  const tileW = (Math.min(width, 480) - 32 - gap * 2) / 3;
  const elapsed = startAt === null ? 0 : now - startAt;

  return (
    <View style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Txt variant="footnote" weight="400" color={c.text2}>단어와 뜻을 차례로 눌러 짝을 맞추세요</Txt>
          <Txt variant="footnote" weight="400" color={c.text2}>
            맞춘 짝 <Txt variant="footnote" weight="700" color={c.text}>{matched.size}</Txt> / {pairs}
          </Txt>
        </View>
        <Txt variant="title" style={{ fontSize: 30, lineHeight: 36, fontVariant: ['tabular-nums'] }} accessibilityLabel={`경과 시간 ${(elapsed / 1000).toFixed(0)}초`}>
          {fmt(elapsed)}
        </Txt>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap }}>
        {tiles.map((tile) => {
          const gone = matched.has(tile.pairId);
          const isSel = selected === tile.key;
          const isWrong = wrong.includes(tile.key);
          const style = {
            width: tileW, height: tileW * 1.18, borderRadius: radius.lg, padding: 8,
            alignItems: 'center' as const, justifyContent: 'center' as const,
          };
          if (gone) {
            return <View key={tile.key} style={[style, { borderWidth: 1, borderStyle: 'dashed', borderColor: c.separator }]} accessibilityElementsHidden />;
          }
          return (
            <Pressy
              key={tile.key}
              onPress={() => tap(tile)}
              accessibilityLabel={`${tile.kind === 'term' ? '단어' : '뜻'}: ${tile.text}`}
              accessibilityState={{ selected: isSel }}
              style={[
                style,
                {
                  backgroundColor: isWrong ? c.dangerBg : isSel ? c.tint : c.surface,
                  borderWidth: 1.5,
                  borderColor: isWrong ? c.danger : isSel ? c.accent : 'transparent',
                },
              ]}
            >
              <Txt
                variant={tile.kind === 'term' ? 'headline' : 'caption'}
                weight={tile.kind === 'term' ? '700' : '500'}
                style={{ textAlign: 'center', fontSize: tile.kind === 'term' ? 16 : 12.5 }}
                numberOfLines={tile.kind === 'term' ? 3 : 5}
                adjustsFontSizeToFit
              >
                {tile.text}
              </Txt>
            </Pressy>
          );
        })}
      </View>
    </View>
  );
}

function StatRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 50, borderBottomWidth: last ? 0 : 0.5, borderBottomColor: c.separator }}>
      <Txt variant="callout" style={{ flex: 1 }}>{label}</Txt>
      <Txt variant="callout" weight="600">{value}</Txt>
    </View>
  );
}
