export const SOURCE_LABEL: Record<string, string> = { ytn: 'YTN', hankyung: '한경', manual: '직접 입력' };

export const RUN_STATUS: Record<string, { label: string; tone: 'ok' | 'warn' | 'bad' }> = {
  ok: { label: '정상', tone: 'ok' },
  no_match: { label: '연결 단어 없음', tone: 'warn' },
  fetch_failed: { label: '수집 실패', tone: 'bad' },
  parse_failed: { label: '본문 추출 실패', tone: 'bad' },
  generate_failed: { label: '생성 실패', tone: 'bad' },
};

export const STAGE_LABEL: Record<string, string> = { fetch: '수집', parse: '본문', link: '단어 연결', generate: '생성' };

export function kst(ts: string | null | undefined): string {
  if (!ts) return '';
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(ts));
}
