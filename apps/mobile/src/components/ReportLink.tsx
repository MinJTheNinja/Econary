import { router } from 'expo-router';
import type { ReportTarget } from '../lib/api';
import { SmallLink } from '../ui/kit';

/** 콘텐츠 카드 오른쪽 아래의 작은 '오류 신고' 진입점 (PRD 7.1) → 오류 신고 시트 */
export function ReportLink({
  wordId, term, target, contentId, label,
}: { wordId: number; term?: string; target: ReportTarget; contentId?: number; label: string }) {
  return (
    <SmallLink
      label={label}
      onPress={() =>
        router.push({
          pathname: '/report',
          params: { wordId: String(wordId), target, ...(contentId ? { contentId: String(contentId) } : {}), ...(term ? { term } : {}) },
        })
      }
    />
  );
}
