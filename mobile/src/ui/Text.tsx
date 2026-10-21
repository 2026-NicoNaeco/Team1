import { Platform, Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';
import { colors, maxFontMultiplier, typography, type TextVariant } from '../design/tokens';
import { useUiStore } from '../state/uiStore';

/**
 * 웹은 한글을 글자 단위로 끊는 것이 기본이라 단어 중간에서 줄이 바뀐다. 기기(iOS·Android)처럼 단어 단위로 줄바꿈하고,
 * 공백 없이 긴 단어만 넘칠 때 끊도록 한다.
 */
const WEB_WRAP = Platform.OS === 'web' ? ({ wordBreak: 'keep-all', overflowWrap: 'anywhere' } as unknown as TextStyle) : null;

export interface TextProps extends RNTextProps {
  variant?: TextVariant;
  color?: string;
  align?: TextStyle['textAlign'];
}

/**
 * 모든 글자는 이 컴포넌트를 쓴다. 시스템 글자 크기 설정을 따라 커지며(상한은 maxFontMultiplier),
 * 크기를 줄여서 확대 문제를 숨기지 않고 줄바꿈으로 대응한다.
 */
export function Text({ variant = 'body', color = colors.text, align, style, maxFontSizeMultiplier, ...rest }: TextProps) {
  const devScale = useUiStore((s) => s.devFontScale);
  const base = typography[variant];
  const cap = maxFontSizeMultiplier ?? maxFontMultiplier[variant];
  // 개발용 배율도 시스템 배율처럼 변형별 상한(maxFontMultiplier)까지만 반영한다
  const k = Math.min(devScale, cap);
  const scaled: TextStyle =
    k === 1 ? base : { ...base, fontSize: (base.fontSize ?? 16) * k, lineHeight: (base.lineHeight ?? 24) * k };
  return (
    <RNText
      {...rest}
      maxFontSizeMultiplier={cap}
      style={[scaled, WEB_WRAP, { color }, align ? { textAlign: align } : null, style]}
    />
  );
}
