/**
 * Econary 디자인 토큰 — Claude Design "디자인 토큰" 보드 그대로.
 * 모든 화면은 색·간격·라운드·글자를 이 이름으로만 참조한다 (하드코딩 금지).
 */
import { Platform, type TextStyle } from 'react-native';

export interface Palette {
  bg: string;
  surface: string;
  /** 시트 바탕 */
  sheet: string;
  /** 시트 안쪽 카드 (라이트 #FFF, 다크 #2C2C2E) */
  sheetSurface: string;
  fill: string;
  separator: string;
  text: string;
  text2: string;
  textDisabled: string;
  accent: string;
  accentFill: string;
  onAccent: string;
  tint: string;
  onTint: string;
  success: string;
  successBg: string;
  onSuccess: string;
  warning: string;
  warningBg: string;
  danger: string;
  dangerBg: string;
  onDanger: string;
  badgeNeutral: string;
  badgeNeutralText: string;
  /** 탭 바 머티리얼 (iOS 는 BlurView 위에 반투명으로) */
  bar: string;
  barLine: string;
  tabInactive: string;
  scrim: string;
  /** 퀴즈 빈 라디오 링 */
  ring: string;
  disabledBg: string;
  /** 진도 막대 트랙 */
  track: string;
  chip: string;
  grabber: string;
  appleBg: string;
  appleFg: string;
  googleBg: string;
  googleFg: string;
  googleBorder: string;
  /** 진도 잔디: 신규 모두 완료 / 일부 학습 / 쉼 */
  heatFull: string;
  heatPartial: string;
  heatRest: string;
}

export const light: Palette = {
  bg: '#F2F2F7',
  surface: '#FFFFFF',
  sheet: '#F2F2F7',
  sheetSurface: '#FFFFFF',
  fill: '#E5E5EA',
  separator: '#D1D1D6',
  text: '#1C1C1E',
  text2: '#636366',
  textDisabled: '#8E8E93',
  accent: '#3A4FD8',
  accentFill: '#3A4FD8',
  onAccent: '#FFFFFF',
  tint: '#E9ECFB',
  onTint: '#2B3BB0',
  success: '#1B6B34',
  successBg: '#E3F3E7',
  onSuccess: '#FFFFFF',
  warning: '#8A4B00',
  warningBg: '#FDF0DC',
  danger: '#B3261E',
  dangerBg: '#FDECEA',
  onDanger: '#FFFFFF',
  badgeNeutral: '#EBEBF0',
  badgeNeutralText: '#55555A',
  bar: 'rgba(249,249,251,0.92)',
  barLine: '#C6C6C8',
  tabInactive: '#6C6C70',
  scrim: 'rgba(0,0,0,0.32)',
  ring: '#AEAEB2',
  disabledBg: '#E5E5EA',
  track: '#E5E5EA',
  chip: '#F2F2F7',
  grabber: '#C7C7CC',
  appleBg: '#000000',
  appleFg: '#FFFFFF',
  googleBg: '#FFFFFF',
  googleFg: '#1F1F1F',
  googleBorder: '#747775',
  heatFull: '#3A4FD8',
  heatPartial: '#C5CCF4',
  heatRest: '#E5E5EA',
};

export const dark: Palette = {
  bg: '#000000',
  surface: '#1C1C1E',
  sheet: '#1C1C1E',
  sheetSurface: '#2C2C2E',
  fill: '#2C2C2E',
  separator: '#38383A',
  text: '#F2F2F7',
  text2: '#AEAEB2',
  textDisabled: '#8E8E93',
  accent: '#8C99FF',
  accentFill: '#4A5DF0',
  onAccent: '#FFFFFF',
  tint: '#1E2342',
  onTint: '#B8C0FF',
  success: '#6FD08C',
  successBg: '#15301E',
  onSuccess: '#0B2A15',
  warning: '#F0B45A',
  warningBg: '#3A2A12',
  danger: '#FF8A80',
  dangerBg: '#3B1714',
  onDanger: '#3A0D08',
  badgeNeutral: '#2C2C2E',
  badgeNeutralText: '#AEAEB2',
  bar: 'rgba(22,22,24,0.9)',
  barLine: '#38383A',
  tabInactive: '#8E8E93',
  scrim: 'rgba(0,0,0,0.6)',
  ring: '#636366',
  disabledBg: '#2C2C2E',
  track: '#38383A',
  chip: '#2C2C2E',
  grabber: '#5A5A5E',
  appleBg: '#FFFFFF',
  appleFg: '#000000',
  googleBg: '#131314',
  googleFg: '#E3E3E3',
  googleBorder: '#8E918F',
  heatFull: '#4A5DF0',
  heatPartial: '#2B3474',
  heatRest: '#2C2C2E',
};

/**
 * 단어 분야 색 (카드 덱·학습 헤더). 라이트/다크 공통 — 흰 글자 대비 AA 이상.
 * 키는 words.category 실제 값. 모르는 분야·빈 값은 default.
 */
export const categoryColors: Record<string, string> = {
  금융: '#2A3AA8',
  경영: '#8B3A12',
  경제: '#1B5378',
  공공: '#1F6B4F',
  과학: '#5B2E9E',
  사회: '#3A4FD8',
  default: '#3A4FD8',
};
export const categoryColor = (category: string | null | undefined) =>
  categoryColors[category ?? ''] ?? categoryColors.default;

/** 분야 색 위의 글자·칩 */
export const onCategory = {
  text: '#FFFFFF',
  text2: 'rgba(255,255,255,0.78)',
  chipBg: 'rgba(255,255,255,0.2)',
  chipDarkBg: 'rgba(0,0,0,0.22)',
  rings: 'rgba(255,255,255,0.16)',
  done: '#1F6B34',
} as const;

/** space.1~8 */
export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32 } as const;

export const radius = { sm: 6, md: 12, lg: 14, xl: 16, sheet: 20, pill: 22 } as const;

/** size.touch: 최소 44, 리스트 행 48, 주요 버튼 52, 보기 56 */
export const size = { touch: 44, row: 48, button: 52, choice: 56 } as const;

/** iOS 는 시스템 글꼴(SF + Apple SD Gothic Neo), Android 는 Pretendard (앱에 내장), 웹 미리보기는 CSS 폴백 */
export const fontFamily = Platform.select({
  ios: undefined,
  android: 'Pretendard',
  default: "-apple-system, 'Apple SD Gothic Neo', Pretendard, 'Noto Sans KR', sans-serif",
});

type TypeToken = Pick<TextStyle, 'fontSize' | 'lineHeight' | 'fontWeight' | 'letterSpacing'>;
const t = (fontSize: number, lh: number, fontWeight: TextStyle['fontWeight'], letterSpacing = 0): TypeToken => ({
  fontSize,
  lineHeight: Math.round(fontSize * lh),
  fontWeight,
  letterSpacing,
});

/** 타입 스케일: 한글 본문은 자간 0, 큰 제목만 음수 자간 */
export const type = {
  display: t(48, 1, '700', -1),
  term: t(36, 1.2, '700', -0.5),
  largeTitle: t(32, 1.2, '700', -0.4),
  title: t(24, 1.25, '700', -0.3),
  question: t(21, 1.5, '700', -0.2),
  headline: t(17, 1.45, '600'),
  body: t(17, 1.6, '400'),
  callout: t(16, 1.6, '400'),
  subhead: t(15, 1.55, '400'),
  footnote: t(13, 1.5, '600'),
  caption: t(12, 1.5, '400'),
} as const;
export type TypeName = keyof typeof type;

/** 모션: 스프링 (Reanimated withSpring 설정) */
export const spring = {
  press: { stiffness: 400, damping: 40 },
  snappy: { stiffness: 500, damping: 45 },
  reveal: { stiffness: 260, damping: 32 },
  sheet: { stiffness: 300, damping: 35 },
} as const;

/** elevation.cta: 라이트만 */
export const ctaShadow = (isDark: boolean) =>
  isDark
    ? {}
    : {
        shadowColor: '#3A4FD8',
        shadowOpacity: 0.25,
        shadowRadius: 9,
        shadowOffset: { width: 0, height: 6 },
        elevation: 6,
      };
