/** 디자인 보드에 쓰인 선 아이콘 (24 그리드, round cap). 장식용이라 기본 접근성에서 숨긴다. */
import { Platform } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

/** 스크린리더에서 숨김 (웹은 SVG 에 이 속성이 없어 생략) */
const hidden = Platform.OS === 'web' ? {} : ({ accessible: false, importantForAccessibility: 'no-hide-descendants' } as const);

const ICONS = {
  calendar: { w: 2, el: <><Rect x={3} y={5} width={18} height={16} rx={3} /><Path d="M3 10h18M8 3v4M16 3v4" /></> },
  refresh: { w: 2, el: <><Path d="M3 12a9 9 0 0 1 15.5-6.3L21 8" /><Path d="M21 3v5h-5" /><Path d="M21 12a9 9 0 0 1-15.5 6.3L3 16" /><Path d="M3 21v-5h5" /></> },
  bars: { w: 2, el: <Path d="M5 20V12M12 20V5M19 20v-9" /> },
  chevronRight: { w: 2.5, el: <Path d="M9 6l6 6-6 6" /> },
  chevronLeft: { w: 2.5, el: <Path d="M15 6l-6 6 6 6" /> },
  arrowRight: { w: 2.5, el: <><Path d="M5 12h14" /><Path d="M13 6l6 6-6 6" /></> },
  check: { w: 2.6, el: <Path d="M5 12l5 5 9-10" /> },
  x: { w: 3, el: <Path d="M6 6l12 12M18 6L6 18" /> },
  alertCircle: { w: 2.2, el: <><Circle cx={12} cy={12} r={9} /><Path d="M12 8v5" /><Path d="M12 16.5v.01" /></> },
  info: { w: 2, el: <><Path d="M12 17v-6" /><Path d="M12 7.5v.01" /><Circle cx={12} cy={12} r={9} /></> },
  warning: { w: 2.2, el: <><Path d="M12 3l9.5 17h-19z" /><Path d="M12 10v4" /><Path d="M12 17.5v.01" /></> },
  news: { w: 2.2, el: <><Rect x={3} y={4} width={18} height={16} rx={2} /><Path d="M7 9h10M7 13h10M7 17h6" /></> },
  bookCheck: { w: 2, el: <><Path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5z" /><Path d="M9 10l2 2 4-4" /></> },
  user: { w: 2, el: <><Circle cx={12} cy={8} r={4} /><Path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></> },
  spinner: { w: 2.6, el: <Path d="M21 12a9 9 0 1 1-6.2-8.6" /> },
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 20, color, strokeWidth }: { name: IconName; size?: number; color: string; strokeWidth?: number }) {
  const icon = ICONS[name];
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth ?? icon.w}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...hidden}
    >
      {icon.el}
    </Svg>
  );
}

/** Econary 마크: 올라가는 세 막대 (앱 아이콘·스플래시·실행 화면) */
export function Mark({ size = 88, bg, bar = '#FFFFFF' }: { size?: number; bg: string; bar?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 88 88" {...hidden}>
      <Rect width={88} height={88} rx={22} fill={bg} />
      <Rect x={22} y={48} width={11} height={18} rx={3} fill={bar} fillOpacity={0.55} />
      <Rect x={38.5} y={36} width={11} height={30} rx={3} fill={bar} fillOpacity={0.8} />
      <Rect x={55} y={22} width={11} height={44} rx={3} fill={bar} />
    </Svg>
  );
}
