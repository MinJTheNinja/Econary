import { computeStreak, studyDate } from '@tesat/core';
import { Placeholder } from '../../components/Placeholder';

export default function ProgressScreen() {
  return (
    <Placeholder
      title="학습 진도"
      lines={[`연속 학습 ${computeStreak([], studyDate())}일`, '진도 · 정답률 · 오답 단어 — Phase 6']}
    />
  );
}
