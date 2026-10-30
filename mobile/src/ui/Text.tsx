import { Children, type ReactNode } from 'react';
import { Platform, Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';
import { colors, maxFontMultiplier, typography, type TextVariant } from '../design/tokens';
import { useUiStore } from '../state/uiStore';
import { keepWords, plainText } from './wordBreak';

/**
 * 한글은 어절(띄어쓰기) 단위로 줄을 바꿔야 읽기 쉽다. 그런데 기본 줄바꿈은 한글 글자 사이 어디서든 줄을 바꿀 수 있게 둔다.
 * - 웹: `wordBreak: keep-all`, 공백 없이 긴 단어만 넘칠 때 끊는다.
 * - iOS: `lineBreakStrategyIOS="hangul-word"`. (iOS 기기에서는 확인하지 못했다)
 * - Android: 줄바꿈 속성이 없어서 `wordBreak.ts` 의 `keepWords` 로 한글 어절의 글자 사이에 WORD JOINER 를 끼운다.
 *   스크린 리더가 이 문자를 읽지 않도록 접근성 라벨에는 원문을 둔다.
 */
const WEB_WRAP = Platform.OS === 'web' ? ({ wordBreak: 'keep-all', overflowWrap: 'anywhere' } as unknown as TextStyle) : null;
const IOS_WRAP = Platform.OS === 'ios' ? ({ lineBreakStrategyIOS: 'hangul-word' } as const) : null;
const KEEP_WORDS = Platform.OS === 'android';

/**
 * 글자 자식에서 한글 어절의 줄이 중간에서 바뀌지 않게 한다.
 * 자식이 글자·숫자뿐이면 하나로 이어 붙여 처리한다({count}번 처럼 숫자와 단위가 따로 들어와도 묶이게).
 * 요소가 섞여 있으면 글자 조각만 처리하고 요소는 그대로 둔다(그 안의 Text 가 스스로 처리한다).
 */
function keepAll(children: ReactNode): ReactNode {
  const plain = plainText(children);
  if (plain !== undefined) return keepWords(plain);
  if (Array.isArray(children)) return Children.map(children, (c) => (typeof c === 'string' ? keepWords(c) : c));
  return children;
}

export interface TextProps extends RNTextProps {
  variant?: TextVariant;
  color?: string;
  align?: TextStyle['textAlign'];
}

/**
 * 모든 글자는 이 컴포넌트를 쓴다. 시스템 글자 크기 설정을 따라 커지며(상한은 maxFontMultiplier),
 * 크기를 줄여서 확대 문제를 숨기지 않고 줄바꿈으로 대응한다.
 */
export function Text({ variant = 'body', color = colors.text, align, style, maxFontSizeMultiplier, children, ...rest }: TextProps) {
  const devScale = useUiStore((s) => s.devFontScale);
  const base = typography[variant];
  const cap = maxFontSizeMultiplier ?? maxFontMultiplier[variant];
  // 개발용 배율도 시스템 배율처럼 변형별 상한(maxFontMultiplier)까지만 반영한다
  const k = Math.min(devScale, cap);
  const scaled: TextStyle =
    k === 1 ? base : { ...base, fontSize: (base.fontSize ?? 16) * k, lineHeight: (base.lineHeight ?? 24) * k };

  let content = children;
  let label: { accessibilityLabel: string } | null = null;
  if (KEEP_WORDS) {
    content = keepAll(children);
    const original = plainText(children);
    if (original !== undefined && rest.accessibilityLabel === undefined && rest['aria-label'] === undefined && content !== children) {
      label = { accessibilityLabel: original };
    }
  }

  return (
    <RNText
      {...rest}
      {...IOS_WRAP}
      {...label}
      maxFontSizeMultiplier={cap}
      style={[scaled, WEB_WRAP, { color }, align ? { textAlign: align } : null, style]}
    >
      {content}
    </RNText>
  );
}
