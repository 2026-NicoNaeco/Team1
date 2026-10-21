import { PixelRatio } from 'react-native';
import { useUiStore } from '../state/uiStore';

/** 시스템 글자 크기 배율 × (개발용으로 키운 배율). 큰 글자에서는 안내 문구를 줄이는 등 레이아웃 판단에 쓴다. */
export function useFontScale(): number {
  const dev = useUiStore((s) => s.devFontScale);
  return PixelRatio.getFontScale() * dev;
}
