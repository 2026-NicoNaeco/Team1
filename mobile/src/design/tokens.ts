import { Platform, type TextStyle, type ViewStyle } from 'react-native';

/**
 * 뉴비맵 디자인 토큰.
 * 콘셉트: "차분한 지도, 명확한 선택, 부담 없는 안내."
 * 브랜드 색(primary)은 주요 행동과 선택 상태에만 쓴다. 명암 대비는 __tests__/tokens.test.ts 가 검증한다.
 */

export const colors = {
  bg: '#F5F7F8',
  surface: '#FFFFFF',
  /** 표면 위의 약한 면 (칩, 비활성 영역) */
  surfaceMuted: '#EDF1F3',

  text: '#18242B',
  textSecondary: '#52616B',
  /** 비활성 컨트롤의 글자 */
  textDisabled: '#6B7A84',
  onPrimary: '#FFFFFF',

  primary: '#0F766E',
  primaryPressed: '#0B5F58',
  primarySoft: '#E8F4F1',

  /** 카드·구분용 연한 선. 컨트롤 경계로는 쓰지 않는다. */
  border: '#D7E0E3',
  /** 컨트롤(체크박스, 입력창 등)의 경계. 흰 배경에서 3:1 이상 */
  borderStrong: '#7A8C96',

  caution: '#8A4B08',
  cautionBg: '#FFF4DF',
  cautionBorder: '#EBCB92',

  danger: '#B42318',
  dangerBg: '#FDECEA',

  /** 중립 안내(데모·정보) */
  info: '#2D5266',
  infoBg: '#E9F0F4',

  overlay: 'rgba(24, 36, 43, 0.45)',
} as const;

/** 지도 전용 색. 낮은 채도로 두어 경로가 먼저 보이게 한다. */
export const mapColors = {
  land: '#EEF1EC',
  block: '#E4E9E1',
  park: '#D5E6D2',
  water: '#C9DEEA',
  campus: '#E3E7EE',
  roadCasing: '#C3CDD2',
  roadFill: '#FFFFFF',
  highwayCasing: '#B7A687',
  highwayFill: '#F3E6C4',
  label: '#3E4D56',
  labelMuted: '#6C7B84',
  labelHalo: '#F5F7F4',
  /** 선택한 경로 */
  routeSelected: '#0F766E',
  routeSelectedCasing: '#FFFFFF',
  /** 대안 경로: 비활성처럼 보이지 않도록 중간 채도의 청회색을 쓴다 */
  routeAlt: '#5E7F99',
  routeAltCasing: '#FFFFFF',
  traveled: '#9FB3B0',
  origin: '#18242B',
  destination: '#B42318',
  vehicle: '#0F766E',
} as const;

/** 4 단위 간격 체계 */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const layout = {
  /** 화면 좌우 여백 */
  screenX: 20,
  /** 최소 터치 영역 */
  minTouch: 48,
  buttonHeight: 54,
  tabBarHeight: 64,
} as const;

export const radius = {
  chip: 10,
  control: 12,
  button: 14,
  card: 16,
  sheet: 24,
  /** 점·핀처럼 정말 둥근 요소에만 */
  round: 999,
} as const;

export type TextVariant =
  | 'navDistance'
  | 'metric'
  | 'title1'
  | 'title2'
  | 'heading'
  | 'body'
  | 'bodyStrong'
  | 'caption'
  | 'captionStrong'
  | 'micro';

/**
 * 글자 스타일 (논리 단위). 시스템 글자 크기 설정에 따라 함께 커진다.
 * 크기를 줄여서 확대 문제를 숨기지 않고, 레이아웃이 줄바꿈으로 대응한다.
 */
export const typography: Record<TextVariant, TextStyle> = {
  navDistance: { fontSize: 40, lineHeight: 46, fontWeight: '700', letterSpacing: -0.5 },
  metric: { fontSize: 30, lineHeight: 36, fontWeight: '700', letterSpacing: -0.4 },
  title1: { fontSize: 26, lineHeight: 34, fontWeight: '700', letterSpacing: -0.3 },
  title2: { fontSize: 22, lineHeight: 30, fontWeight: '700', letterSpacing: -0.2 },
  heading: { fontSize: 20, lineHeight: 28, fontWeight: '700', letterSpacing: -0.2 },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' },
  bodyStrong: { fontSize: 16, lineHeight: 24, fontWeight: '600' },
  caption: { fontSize: 14, lineHeight: 20, fontWeight: '400' },
  captionStrong: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  micro: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
};

/** 글자 크기를 시스템 설정으로 얼마나 키울 수 있는지 (레이아웃이 깨지는 것을 막는 상한) */
export const maxFontMultiplier: Record<TextVariant, number> = {
  navDistance: 1.3,
  metric: 1.4,
  title1: 1.5,
  title2: 1.6,
  heading: 1.6,
  body: 2,
  bodyStrong: 2,
  caption: 2,
  captionStrong: 2,
  micro: 1.5,
};

const webShadow = (css: string): ViewStyle => ({ boxShadow: css }) as ViewStyle;

/** 지도 위에 떠 있는 요소와 시트에만 쓴다 */
export const shadow = {
  floating: Platform.select<ViewStyle>({
    ios: { shadowColor: '#0B1A20', shadowOpacity: 0.16, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
    android: { elevation: 6 },
    default: webShadow('0 4px 14px rgba(11, 26, 32, 0.16)'),
  })!,
  sheet: Platform.select<ViewStyle>({
    ios: { shadowColor: '#0B1A20', shadowOpacity: 0.14, shadowRadius: 16, shadowOffset: { width: 0, height: -4 } },
    android: { elevation: 12 },
    default: webShadow('0 -4px 18px rgba(11, 26, 32, 0.14)'),
  })!,
} as const;

/** 대비 검증에 쓰는 쌍 (tokens.test.ts) */
export const contrastPairs: Array<{ name: string; fg: string; bg: string; min: number }> = [
  { name: '본문/배경', fg: colors.text, bg: colors.bg, min: 4.5 },
  { name: '본문/카드', fg: colors.text, bg: colors.surface, min: 4.5 },
  { name: '보조 글자/배경', fg: colors.textSecondary, bg: colors.bg, min: 4.5 },
  { name: '보조 글자/카드', fg: colors.textSecondary, bg: colors.surface, min: 4.5 },
  { name: '보조 글자/약한 면', fg: colors.textSecondary, bg: colors.surfaceMuted, min: 4.5 },
  { name: '버튼 글자/주요색', fg: colors.onPrimary, bg: colors.primary, min: 4.5 },
  { name: '주요색 글자/카드', fg: colors.primary, bg: colors.surface, min: 4.5 },
  { name: '주요색 글자/선택 배경', fg: colors.primary, bg: colors.primarySoft, min: 4.5 },
  { name: '본문/선택 배경', fg: colors.text, bg: colors.primarySoft, min: 4.5 },
  { name: '주의 글자/주의 배경', fg: colors.caution, bg: colors.cautionBg, min: 4.5 },
  { name: '오류 글자/카드', fg: colors.danger, bg: colors.surface, min: 4.5 },
  { name: '오류 글자/오류 배경', fg: colors.danger, bg: colors.dangerBg, min: 4.5 },
  { name: '안내 글자/안내 배경', fg: colors.info, bg: colors.infoBg, min: 4.5 },
  { name: '비활성 글자/약한 면', fg: colors.textDisabled, bg: colors.surfaceMuted, min: 3 },
  { name: '컨트롤 경계/카드 (비텍스트 3:1)', fg: colors.borderStrong, bg: colors.surface, min: 3 },
  { name: '지도 라벨/지도 배경', fg: mapColors.label, bg: mapColors.land, min: 4.5 },
  { name: '선택 경로/지도 배경 (비텍스트 3:1)', fg: mapColors.routeSelected, bg: mapColors.land, min: 3 },
  { name: '대안 경로/지도 배경 (비텍스트 3:1)', fg: mapColors.routeAlt, bg: mapColors.land, min: 3 },
];
