import { useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { useReducedMotion } from '../hooks/useReducedMotion';

interface PressState {
  pressed: boolean;
}

export interface PressableScaleProps extends Omit<PressableProps, 'style' | 'children'> {
  /** 바깥(터치 영역) 스타일. flex·margin·alignSelf·width 같은 배치용 */
  style?: StyleProp<ViewStyle>;
  /** 안쪽(눈에 보이는 면) 스타일. 배경·테두리·패딩. 누르면 이 면이 살짝 작아진다 */
  contentStyle?: StyleProp<ViewStyle> | ((state: PressState) => StyleProp<ViewStyle>);
  /** 눌렀을 때의 크기 비율. 기본 0.97 */
  pressedScale?: number;
  children?: ReactNode | ((state: PressState) => ReactNode);
}

/**
 * 누르면 면이 살짝 작아졌다 돌아오는 눌림 반응을 가진 Pressable.
 * 터치 영역(바깥)은 그대로 두고 눈에 보이는 면(안쪽)만 움직이므로, 누르는 도중에 손가락이 영역 밖으로 밀리지 않는다.
 * 모션 줄이기를 켜면 움직이지 않고, 색 변화(contentStyle 의 pressed)만 남는다.
 */
export function PressableScale({
  style,
  contentStyle,
  pressedScale = 0.97,
  children,
  onPressIn,
  onPressOut,
  ...rest
}: PressableScaleProps) {
  const reducedMotion = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const [pressed, setPressed] = useState(false);

  const animate = (to: number) => {
    if (reducedMotion) return;
    Animated.timing(scale, {
      toValue: to,
      duration: to < 1 ? 90 : 170,
      easing: Easing.out(Easing.quad),
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  };

  const state: PressState = { pressed };
  return (
    <Pressable
      {...rest}
      style={style}
      onPressIn={(e) => {
        setPressed(true);
        animate(pressedScale);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        setPressed(false);
        animate(1);
        onPressOut?.(e);
      }}
    >
      <Animated.View
        style={[styles.content, typeof contentStyle === 'function' ? contentStyle(state) : contentStyle, { transform: [{ scale }] }]}
      >
        {typeof children === 'function' ? children(state) : children}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { alignSelf: 'stretch' },
});
