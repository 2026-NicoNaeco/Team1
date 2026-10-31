import { PixelRatio, useWindowDimensions } from 'react-native';
import { useUiStore } from '../state/uiStore';

/** 시스템 글자 크기 배율 × (개발용으로 키운 배율). 큰 글자에서는 안내 문구를 줄이는 등 레이아웃 판단에 쓴다. */
export function useFontScale(): number {
  const dev = useUiStore((s) => s.devFontScale);
  return PixelRatio.getFontScale() * dev;
}

/** 나란히 놓은 버튼에 필요한 폭(글자 배율 1 기준)보다 화면이 좁은지. 좁은 기기와 큰 글자를 함께 판단한다. */
export function useTooNarrowFor(requiredWidth: number): boolean {
  const { width } = useWindowDimensions();
  return width / useFontScale() < requiredWidth;
}
