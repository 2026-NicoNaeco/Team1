import { Platform, type TextStyle, type ViewStyle } from 'react-native';

/**
 * 뉴비맵 디자인 토큰.
 * 콘셉트: "차분한 선택, 부담 없는 안내." 회색 바탕 위에 흰 카드를 올리고, 큰 제목과 부드러운 색 배지로 정보를 구분한다.
 * 브랜드 색(primary)은 주요 행동과 선택 상태에만 쓴다. 명암 대비는 __tests__/tokens.test.ts 가 검증한다.
 *
 * 글자색 규칙
 * - 흰 바탕(surface) 위: text / textSecondary / textTertiary / primary 모두 가능
 * - 회색 바탕(bg) 위: primary 는 대비가 모자라므로 글자에는 primaryStrong 을 쓴다
 */

export const colors = {
  bg: '#F2F4F6',
  surface: '#FFFFFF',
  /** 흰 카드 안쪽의 약한 면, 비선택 칩 */
  surfaceMuted: '#F2F4F6',
  /** 회색 바탕 위에 올라가는 약한 면 */
  surfaceStrong: '#E5E8EB',

  text: '#191F28',
  textSecondary: '#4E5968',
  /** 보조 설명보다 한 단계 더 약한 글자. 회색 바탕에서도 4.5:1 을 넘는다 */
  textTertiary: '#5F6B7A',
  /** 비활성 컨트롤의 글자 */
  textDisabled: '#78828E',
  onPrimary: '#FFFFFF',

  primary: '#0A8576',
  primaryPressed: '#08695D',
  /** 회색·옅은 색 바탕 위의 브랜드색 글자 */
  primaryStrong: '#075E54',
  primarySoft: '#E6F5F2',
  /** 선택된 카드의 바탕 */
  primarySofter: '#F1FAF8',

  /** 카드·구분용 연한 선. 컨트롤 경계로는 쓰지 않는다. */
  border: '#E5E8EB',
  /** 컨트롤(체크박스, 입력창 등)의 경계. 흰 배경에서 3:1 이상 */
  borderStrong: '#868E98',

  success: '#0B7A3E',
  successBg: '#E5F6EC',

  caution: '#8A5300',
  cautionBg: '#FFF4DD',
  cautionBorder: '#F2D9A0',

  /** "운전 부담 높음" 등 부드러운 경고. 붉은색으로 불안을 키우지 않는다 */
  warn: '#B4410C',
  warnBg: '#FFEBDD',

  danger: '#D92D20',
  dangerText: '#B42318',
  dangerBg: '#FEECEB',

  /** 중립 안내 */
  info: '#1D4E9E',
  infoBg: '#EAF1FD',

  overlay: 'rgba(25, 31, 40, 0.5)',
  /** 어두운 알림(토스트)의 바탕 */
  inverse: '#191F28',
  onInverse: '#FFFFFF',
} as const;

/** 지도 전용 색. 낮은 채도로 두어 경로가 먼저 보이게 한다. */
export const mapColors = {
  land: '#F0F2EE',
  block: '#E7EAE4',
  park: '#D9ECCF',
  water: '#C8E0F2',
  campus: '#E4E7F1',
  building: '#E4E7E1',
  streetMinor: '#FFFFFF',
  streetCasing: '#E3E7E1',
  roadCasing: '#D5DADD',
  roadFill: '#FFFFFF',
  highwayCasing: '#E3B65B',
  highwayFill: '#FFE9B8',
  label: '#3B4752',
  labelMuted: '#5E6B76',
  labelWater: '#3F6F8F',
  labelHalo: '#F7F8F5',
  /** 선택한 경로 */
  routeSelected: '#0A8576',
  routeSelectedCasing: '#FFFFFF',
  /** 대안 경로: 비활성처럼 보이지 않도록 중간 채도의 청회색을 쓴다 */
  routeAlt: '#6B8299',
  routeAltCasing: '#FFFFFF',
  traveled: '#A9BBB8',
  origin: '#191F28',
  destination: '#191F28',
  vehicle: '#0A8576',
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
  buttonHeight: 56,
  tabBarHeight: 64,
  /** 카드 안쪽 여백 */
  cardPad: 20,
} as const;

export const radius = {
  chip: 12,
  control: 12,
  field: 16,
  button: 16,
  card: 20,
  sheet: 28,
  /** 알약·점·핀처럼 정말 둥근 요소에만 */
  round: 999,
} as const;

export type TextVariant =
  | 'navDistance'
  | 'metric'
  | 'title1'
  | 'title2'
  | 'heading'
  | 'lead'
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
  navDistance: { fontSize: 44, lineHeight: 50, fontWeight: '700', letterSpacing: -0.8 },
  metric: { fontSize: 34, lineHeight: 40, fontWeight: '700', letterSpacing: -0.8 },
  title1: { fontSize: 28, lineHeight: 38, fontWeight: '700', letterSpacing: -0.6 },
  title2: { fontSize: 22, lineHeight: 30, fontWeight: '700', letterSpacing: -0.4 },
  heading: { fontSize: 19, lineHeight: 27, fontWeight: '700', letterSpacing: -0.3 },
  lead: { fontSize: 17, lineHeight: 25, fontWeight: '600', letterSpacing: -0.2 },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400', letterSpacing: -0.1 },
  bodyStrong: { fontSize: 16, lineHeight: 24, fontWeight: '600', letterSpacing: -0.1 },
  caption: { fontSize: 14, lineHeight: 21, fontWeight: '400' },
  captionStrong: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  micro: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
};

/** 글자 크기를 시스템 설정으로 얼마나 키울 수 있는지 (레이아웃이 깨지는 것을 막는 상한) */
export const maxFontMultiplier: Record<TextVariant, number> = {
  navDistance: 1.3,
  metric: 1.4,
  title1: 1.4,
  title2: 1.5,
  heading: 1.6,
  lead: 1.8,
  body: 2,
  bodyStrong: 2,
  caption: 2,
  captionStrong: 2,
  micro: 1.5,
};

const webShadow = (css: string): ViewStyle => ({ boxShadow: css }) as ViewStyle;

/** 지도 위에 떠 있는 요소와 시트에만 쓴다. 카드는 그림자 없이 색으로만 구분한다. */
export const shadow = {
  floating: Platform.select<ViewStyle>({
    ios: { shadowColor: '#0B1A20', shadowOpacity: 0.14, shadowRadius: 12, shadowOffset: { width: 0, height: 3 } },
    android: { elevation: 5 },
    default: webShadow('0 3px 14px rgba(11, 26, 32, 0.14)'),
  })!,
  sheet: Platform.select<ViewStyle>({
    ios: { shadowColor: '#0B1A20', shadowOpacity: 0.12, shadowRadius: 20, shadowOffset: { width: 0, height: -6 } },
    android: { elevation: 14 },
    default: webShadow('0 -6px 24px rgba(11, 26, 32, 0.12)'),
  })!,
  /** 화면 아래 고정 버튼 영역: 본문과 부드럽게 구분한다 */
  bar: Platform.select<ViewStyle>({
    ios: { shadowColor: '#0B1A20', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: -4 } },
    android: { elevation: 8 },
    default: webShadow('0 -4px 16px rgba(11, 26, 32, 0.06)'),
  })!,
} as const;

/** 대비 검증에 쓰는 쌍 (tokens.test.ts) */
export const contrastPairs: Array<{ name: string; fg: string; bg: string; min: number }> = [
  { name: '본문/배경', fg: colors.text, bg: colors.bg, min: 4.5 },
  { name: '본문/카드', fg: colors.text, bg: colors.surface, min: 4.5 },
  { name: '보조 글자/배경', fg: colors.textSecondary, bg: colors.bg, min: 4.5 },
  { name: '보조 글자/카드', fg: colors.textSecondary, bg: colors.surface, min: 4.5 },
  { name: '보조 글자/회색 면', fg: colors.textSecondary, bg: colors.surfaceStrong, min: 4.5 },
  { name: '약한 글자/배경', fg: colors.textTertiary, bg: colors.bg, min: 4.5 },
  { name: '약한 글자/카드', fg: colors.textTertiary, bg: colors.surface, min: 4.5 },
  { name: '버튼 글자/주요색', fg: colors.onPrimary, bg: colors.primary, min: 4.5 },
  { name: '버튼 글자/주요색(누름)', fg: colors.onPrimary, bg: colors.primaryPressed, min: 4.5 },
  { name: '주요색 글자/카드', fg: colors.primary, bg: colors.surface, min: 4.5 },
  { name: '진한 주요색 글자/배경', fg: colors.primaryStrong, bg: colors.bg, min: 4.5 },
  { name: '진한 주요색 글자/선택 면', fg: colors.primaryStrong, bg: colors.primarySoft, min: 4.5 },
  { name: '진한 주요색 글자/선택 카드', fg: colors.primaryStrong, bg: colors.primarySofter, min: 4.5 },
  { name: '본문/선택 면', fg: colors.text, bg: colors.primarySoft, min: 4.5 },
  { name: '성공 글자/성공 면', fg: colors.success, bg: colors.successBg, min: 4.5 },
  { name: '주의 글자/주의 면', fg: colors.caution, bg: colors.cautionBg, min: 4.5 },
  { name: '부드러운 경고 글자/경고 면', fg: colors.warn, bg: colors.warnBg, min: 4.5 },
  { name: '위험 버튼 글자/위험색', fg: colors.onPrimary, bg: colors.danger, min: 4.5 },
  { name: '오류 글자/카드', fg: colors.dangerText, bg: colors.surface, min: 4.5 },
  { name: '오류 글자/오류 면', fg: colors.dangerText, bg: colors.dangerBg, min: 4.5 },
  { name: '안내 글자/안내 면', fg: colors.info, bg: colors.infoBg, min: 4.5 },
  { name: '알림 글자/알림 면', fg: colors.onInverse, bg: colors.inverse, min: 4.5 },
  { name: '비활성 글자/회색 면', fg: colors.textDisabled, bg: colors.surfaceStrong, min: 3 },
  { name: '컨트롤 경계/카드 (비텍스트 3:1)', fg: colors.borderStrong, bg: colors.surface, min: 3 },
  { name: '지도 라벨/지도 배경', fg: mapColors.label, bg: mapColors.land, min: 4.5 },
  { name: '지도 약한 라벨/지도 배경', fg: mapColors.labelMuted, bg: mapColors.land, min: 4.5 },
  { name: '선택 경로/지도 배경 (비텍스트 3:1)', fg: mapColors.routeSelected, bg: mapColors.land, min: 3 },
  { name: '대안 경로/지도 배경 (비텍스트 3:1)', fg: mapColors.routeAlt, bg: mapColors.land, min: 3 },
];
