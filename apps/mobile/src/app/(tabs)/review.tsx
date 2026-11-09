import { buildTodayReviewList, studyDate } from '@tesat/core';
import { Placeholder } from '../../components/Placeholder';

export default function ReviewScreen() {
  const list = buildTodayReviewList([], studyDate());
  return (
    <Placeholder
      title="오늘의 복습"
      lines={[list.isEmpty ? '복습할 단어가 없어요' : `${list.pending.length}개 남음`, '간격 반복 복습 — Phase 5']}
    />
  );
}
