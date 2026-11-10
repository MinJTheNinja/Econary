/**
 * 첫 실행 화면의 학습자 후기 (시안 4번 '후기 카드').
 * 실제 학습자에게 받은, 게시에 동의한 후기만 넣는다. 비어 있으면 앱 소개 카드를 보여 준다.
 *
 * 예) { quote: '출퇴근 지하철에서 하루 10개씩. 경제 기사 읽는 속도가 확실히 빨라졌어요.',
 *       word: '반대매매', category: '금융', name: '김○○ · 직장인 3년차', meta: '4개월째 사용 중' }
 */
export interface Testimonial {
  /** 후기 본문 */
  quote: string;
  /** 도움 된 단어 */
  word?: string;
  /** 단어 칩 색 (분야 이름: 금융·경제·경영·공공·과학·사회) */
  category?: string;
  /** 이름 · 직업 등 (이름 첫 글자가 이니셜 원에 들어간다) */
  name: string;
  /** 사용 기간 등 */
  meta?: string;
}

export const TESTIMONIALS: Testimonial[] = [];
