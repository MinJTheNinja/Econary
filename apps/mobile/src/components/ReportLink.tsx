import { router } from 'expo-router';
import { Pressable } from 'react-native';
import type { ReportTarget } from '../lib/api';
import { Body, colors } from './ui';

/** 콘텐츠 옆에 붙는 작은 '오류 신고' 진입점 (PRD 7.1) */
export function ReportLink({
  wordId, term, target, contentId, label,
}: { wordId: number; term?: string; target: ReportTarget; contentId?: number; label: string }) {
  return (
    <Pressable
      onPress={() =>
        router.push({
          pathname: '/report',
          params: { wordId: String(wordId), target, ...(contentId ? { contentId: String(contentId) } : {}), ...(term ? { term } : {}) },
        })
      }
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      style={{ alignSelf: 'flex-end' }}
    >
      <Body style={{ fontSize: 12, color: colors.muted, textDecorationLine: 'underline' }}>{label}</Body>
    </Pressable>
  );
}
