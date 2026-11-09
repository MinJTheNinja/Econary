import { STUDY_TIMEZONE } from './config';

/** 'YYYY-MM-DD' 날짜 문자열 (학습 시간대 기준) */
export type DateStr = string;

/** 주어진 시각의 학습 시간대(KST) 날짜 */
export function studyDate(at: Date = new Date()): DateStr {
  // en-CA 로케일은 YYYY-MM-DD 형식을 준다
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: STUDY_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

export function addDays(date: DateStr, days: number): DateStr {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** b - a (일) */
export function diffDays(a: DateStr, b: DateStr): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}
